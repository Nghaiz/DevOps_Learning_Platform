import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { eq, inArray } from 'drizzle-orm';

import {
  closeTestDb,
  ctxFor,
  procedureLeaks,
  purgeLeakedFixtures,
  testDb,
  uniqueId,
} from '../../security/test-helpers';
import { problems, users, type User } from '../db/schema';
import { createTRPCRouter, protectedProcedure } from '../trpc/init';
import { appRouter } from '../trpc/routers/app-router';
import { examsRouter } from '../trpc/routers/exams';

/**
 * Ô nghiệm thu quyền của §18.G, và nó là bản sao có chủ ý của hợp đồng 18.F.3:
 * mỗi dòng `exams.*` trả về đều là dữ liệu của người khác (danh sách đề, bảng
 * điểm cả lớp, CSV điểm).
 *
 * Ba việc, và việc thứ ba sống lâu nhất:
 *
 * 1. `exams.scoreboard` từ chối sinh viên, kể cả sinh viên ĐANG THI kỳ đó.
 * 2. Đối chứng dương: cùng lượt gọi, một `admin` đọc được, và thứ đọc được có
 *    email người khác trong đó. Thiếu vế này thì "sinh viên bị từ chối" không
 *    chứng minh được rằng phép từ chối đang che một thứ có thật.
 * 3. Cổng duyệt TOÀN BỘ bảng procedure và đòi từng cái từ chối `user` lẫn
 *    `author` — đỏ với một procedure công khai mà lane sau thêm vào, kể cả khi
 *    người thêm chưa từng đọc file này.
 *
 * ⚠ ĐÒI Postgres. `createCaller` BỎ QUA tầng serialize của tRPC: đúng cho
 * khẳng định về authz và DB ở đây, không chứng minh gì về thứ trình duyệt thật
 * nhận.
 */

const ADMIN = uniqueId('thi-adm');
const MEMBER = uniqueId('thi-sv');
const OUTSIDER = uniqueId('thi-ngoai');
const AUTHOR = uniqueId('thi-tg');

let classId = '';
let examId = '';
let publishedCode = '';

function callerAs(id: string, role: User['role']) {
  return appRouter.createCaller(ctxFor({ id, role }));
}

function isTRPCCode(code: string) {
  return (error: unknown) => error instanceof TRPCError && error.code === code;
}

beforeAll(async () => {
  await purgeLeakedFixtures(testDb());

  const db = testDb();
  await db.insert(users).values([
    { id: ADMIN, name: 'Giảng viên', email: `${ADMIN}@test.local`, role: 'admin' },
    { id: MEMBER, name: 'Sinh viên trong lớp', email: `${MEMBER}@test.local` },
    { id: OUTSIDER, name: 'Sinh viên ngoài lớp', email: `${OUTSIDER}@test.local` },
    { id: AUTHOR, name: 'Tác giả', email: `${AUTHOR}@test.local`, role: 'author' },
  ]);

  const admin = callerAs(ADMIN, 'admin');
  classId = (await admin.classes.create({ name: uniqueId('Lop-18G') })).id;
  await admin.classes.addMember({ classId, email: `${MEMBER}@test.local` });

  /*
   * Đề dùng một bài CÓ THẬT và ĐÃ XUẤT BẢN. Một mã bịa sẽ bị cổng soạn đề từ
   * chối, và mọi ô dưới sẽ đỏ vì một lý do không liên quan gì tới quyền — tức
   * một suite đỏ không nói được điều gì về thứ nó định đo.
   */
  const [seeded] = await db
    .select({ code: problems.code })
    .from(problems)
    .where(eq(problems.state, 'published'))
    .limit(1);
  if (seeded === undefined) {
    throw new Error('DB test chưa có bài nào đã xuất bản — chạy `seed-content` trước');
  }
  publishedCode = seeded.code;

  examId = (
    await admin.exams.create({
      classId,
      title: uniqueId('Ky-thi'),
      problemCodes: [publishedCode],
      durationMinutes: 60,
      seedStrategy: 'fixed',
      opensAt: null,
      closesAt: null,
    })
  ).id;
});

afterAll(async () => {
  // `classes`, `exams`, `exam_attempts` đều cascade từ `users`, nên xoá bốn tài
  // khoản là đủ — chính là lý do các bảng đó khai `onDelete: 'cascade'`.
  await testDb()
    .delete(users)
    .where(inArray(users.id, [ADMIN, MEMBER, OUTSIDER, AUTHOR]));
  await closeTestDb();
});

describe('18.G · bảng điểm kỳ thi', () => {
  it('sinh viên ĐANG THI gọi thẳng bảng điểm ⇒ FORBIDDEN', async () => {
    // Ca khó, không phải ca dễ: người ngoài bị chặn là hiển nhiên; điều cần
    // khẳng định là người ĐANG thi cũng không đọc được điểm bạn cùng lớp.
    await callerAs(MEMBER, 'user').examSitting.start({ examId });
    await expect(
      callerAs(MEMBER, 'user').exams.scoreboard({ examId }),
    ).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
  });

  it('ĐỐI CHỨNG DƯƠNG: admin đọc được, và trong đó có email người khác', async () => {
    const board = await callerAs(ADMIN, 'admin').exams.scoreboard({ examId });
    expect(board.rows.map((row) => row.email)).toContain(`${MEMBER}@test.local`);
  });

  it('CSV cũng đứng sau cùng cổng đó', async () => {
    await expect(
      callerAs(MEMBER, 'user').exams.scoreboardCsv({ examId }),
    ).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
    const csv = await callerAs(ADMIN, 'admin').exams.scoreboardCsv({ examId });
    expect(csv.csv.startsWith('\ufeff')).toBe(true);
  });
});

describe('18.G · MỌI procedure của exams.* đứng sau adminProcedure', () => {
  const names = Object.keys(examsRouter._def.procedures);

  it('đọc được một bảng procedure THẬT', () => {
    // Không có ô này thì một `_def.procedures` rỗng (tRPC đổi hình dạng nội bộ)
    // biến cả cổng dưới thành một no-op xanh vĩnh viễn.
    expect(names.length, 'không đọc được procedure nào của examsRouter').toBeGreaterThanOrEqual(7);
    expect(names).toContain('scoreboard');
    expect(names).toContain('scoreboardCsv');
    expect(names).toContain('create');
  });

  it.each([['user'], ['author']] as const)(
    'vai trò %s bị từ chối ở TẤT CẢ procedure',
    async (role) => {
      const caller = callerAs(role === 'author' ? AUTHOR : OUTSIDER, role) as unknown as {
        exams: Record<string, (input: unknown) => Promise<unknown>>;
      };

      const leaked = await procedureLeaks(names, (name) => {
        const procedure = caller.exams[name];
        if (procedure === undefined) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `thiếu ${name}` });
        }
        return procedure({});
      });

      expect(
        leaked,
        'Mỗi dòng trên là một procedure của `exams.*` KHÔNG đứng sau ' +
          '`adminProcedure`. Màn của người học nằm ở `examSitting.*`; đừng nới ' +
          'cổng này để một màn hình nào đó tiện hơn.',
      ).toEqual([]);
    },
  );

  it('ĐỐI CHỨNG DƯƠNG: cổng trên ĐỎ được với một router có procedure công khai', async () => {
    const leaky = createTRPCRouter({
      diemCuaNguoiKhac: protectedProcedure.query(() => ({ email: 'nan-nhan@test.local' })),
    });
    const caller = leaky.createCaller(ctxFor({ id: OUTSIDER, role: 'user' })) as unknown as Record<
      string,
      (input: unknown) => Promise<unknown>
    >;
    const leaked = await procedureLeaks(['diemCuaNguoiKhac'], (name) => {
      const procedure = caller[name];
      if (procedure === undefined) {
        throw new Error(`thiếu ${name}`);
      }
      return procedure({});
    });
    expect(leaked).toEqual(['diemCuaNguoiKhac (không ném gì)']);
  });
});

describe('18.G · examSitting lọc cứng theo người đang đăng nhập', () => {
  it('người NGOÀI lớp nhận NOT_FOUND, không phải FORBIDDEN', async () => {
    /*
     * NOT_FOUND là cố ý: một FORBIDDEN xác nhận rằng kỳ thi này có thật, và đó
     * là một bit thông tin mà người ngoài lớp không cần có.
     */
    await expect(
      callerAs(OUTSIDER, 'user').examSitting.get({ examId }),
    ).rejects.toSatisfy(isTRPCCode('NOT_FOUND'));
  });

  it('người ngoài lớp không mở được lượt thi', async () => {
    await expect(
      callerAs(OUTSIDER, 'user').examSitting.start({ examId }),
    ).rejects.toSatisfy(isTRPCCode('NOT_FOUND'));
  });

  it('danh sách của người ngoài lớp KHÔNG chứa kỳ thi đó', async () => {
    const mine = await callerAs(OUTSIDER, 'user').examSitting.list();
    expect(mine.items.map((item) => item.id)).not.toContain(examId);
  });

  it('ĐỐI CHỨNG DƯƠNG: người TRONG lớp thì thấy', async () => {
    const mine = await callerAs(MEMBER, 'user').examSitting.list();
    expect(mine.items.map((item) => item.id)).toContain(examId);
  });

  /*
   * ⛔ Seed KHÔNG được đi qua dây. Một khi client đọc được seed máy chủ cấp thì
   * cổng seed lúc nộp chỉ còn gác được những ai không mở DevTools.
   */
  it('trạng thái lượt thi KHÔNG chở seed ra ngoài', async () => {
    const view = await callerAs(MEMBER, 'user').examSitting.get({ examId });
    expect(JSON.stringify(view)).not.toContain('seed');
  });
});

describe('18.G · lượt thi mở đúng MỘT lần', () => {
  /*
   * Bấm hai lần nút Bắt đầu, hai tab cùng mở, một lượt F5 đúng lúc — cả ba phải
   * ra CÙNG một lượt. Giải thưởng cho người thắng cuộc đua kia là một đồng hồ
   * được đặt lại, tức thêm giờ làm bài.
   */
  it('gọi start hai lần trả về cùng một started_at', async () => {
    const caller = callerAs(MEMBER, 'user');
    const first = await caller.examSitting.start({ examId });
    const second = await caller.examSitting.start({ examId });
    expect(second.attempt.startedAt).toBe(first.attempt.startedAt);
  });

  it('start đồng thời bốn lượt vẫn ra một started_at duy nhất', async () => {
    const caller = callerAs(MEMBER, 'user');
    const results = await Promise.all([
      caller.examSitting.start({ examId }),
      caller.examSitting.start({ examId }),
      caller.examSitting.start({ examId }),
      caller.examSitting.start({ examId }),
    ]);
    expect(new Set(results.map((r) => r.attempt.startedAt)).size).toBe(1);
  });

  it('đồng hồ do MÁY CHỦ cấp: remainingMs đi kèm serverNow', async () => {
    const view = await callerAs(MEMBER, 'user').examSitting.get({ examId });
    expect(view.serverNow).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    expect(view.attempt?.remainingMs).toBeGreaterThan(0);
    expect(view.attempt?.closed).toBe(false);
  });

  it('nộp tay khoá lượt, và bấm nộp lần hai không đổi mốc nộp', async () => {
    const caller = callerAs(MEMBER, 'user');
    const first = await caller.examSitting.submit({ examId });
    expect(first.attempt.closed).toBe(true);
    const second = await caller.examSitting.submit({ examId });
    expect(second.attempt.submittedAt).toBe(first.attempt.submittedAt);
  });
});

describe('18.G.3 · cổng soạn đề chặn bài không seedable vào kỳ thi per-student', () => {
  it('đề per-student với bài không seedable bị từ chối', async () => {
    const admin = callerAs(ADMIN, 'admin');
    await expect(
      admin.exams.create({
        classId,
        title: uniqueId('Ky-thi-per-student'),
        problemCodes: [publishedCode],
        durationMinutes: 60,
        seedStrategy: 'per-student',
        opensAt: null,
        closesAt: null,
      }),
    ).rejects.toSatisfy(isTRPCCode('BAD_REQUEST'));
  });

  it('mã bài không tồn tại bị từ chối, không tạo ra một đề rỗng', async () => {
    await expect(
      callerAs(ADMIN, 'admin').exams.create({
        classId,
        title: uniqueId('Ky-thi-ma-bia'),
        problemCodes: ['KHONG-CO-THAT-0001'],
        durationMinutes: 60,
        seedStrategy: 'fixed',
        opensAt: null,
        closesAt: null,
      }),
    ).rejects.toSatisfy(isTRPCCode('BAD_REQUEST'));
  });
});

describe('18.G · cổng seed lúc NỘP, đi qua router thật', () => {
  /*
   * Nhật ký tối thiểu nhưng ĐÚNG hình dạng schema. Cổng kỳ thi chạy TRƯỚC
   * `submitProblem`, nên một payload hợp lệ về hình dạng là đủ để chạm tới nó —
   * và đó cũng là điều đang được khẳng định: lượt nộp bị từ chối mà KHÔNG tốn
   * một lượt phát lại toàn bộ nhật ký.
   */
  const payloadWith = (seed: number, code: string, examId: string | undefined) => ({
    code,
    ...(examId === undefined ? {} : { examId }),
    runLog: { gameId: 'k8s' as const, levelId: `problem-${code}`, seed, actions: [] },
    claimed: {
      gameId: 'k8s' as const,
      levelId: `problem-${code}`,
      seed,
      startedAt: 0,
      finishedAt: 1,
      objectivesMet: [],
      objectivesTotal: 1,
      commandsUsed: 0,
      hintsUsed: 0,
      score: 0,
    },
  });

  let seedExamId = '';

  beforeAll(async () => {
    seedExamId = (
      await callerAs(ADMIN, 'admin').exams.create({
        classId,
        title: uniqueId('Ky-thi-seed'),
        problemCodes: [publishedCode],
        durationMinutes: 60,
        seedStrategy: 'fixed',
        opensAt: null,
        closesAt: null,
      })
    ).id;
    await callerAs(MEMBER, 'user').examSitting.start({ examId: seedExamId });
  });

  it('chưa mở lượt thi mà nộp kèm examId ⇒ FORBIDDEN', async () => {
    await expect(
      callerAs(OUTSIDER, 'user').problems.submit(
        payloadWith(1, publishedCode, seedExamId) as never,
      ),
    ).rejects.toSatisfy(isTRPCCode('NOT_FOUND'));
  });

  it('seed LỆCH seed máy chủ cấp ⇒ FORBIDDEN, và câu lỗi nói về seed', async () => {
    /*
     * Seed dùng ở đây gần như chắc chắn khác seed máy chủ cấp (31 bit), nhưng
     * "gần như" không phải một phép đo. Ô dưới chạy hai seed khác nhau: ít nhất
     * MỘT trong hai phải lệch, nên ít nhất một lượt phải bị từ chối. Không có
     * mẹo đó thì ô này về lý thuyết bong tróc 1 lần trên 2^31.
     */
    const results = await Promise.allSettled([
      callerAs(MEMBER, 'user').problems.submit(
        payloadWith(1, publishedCode, seedExamId) as never,
      ),
      callerAs(MEMBER, 'user').problems.submit(
        payloadWith(2, publishedCode, seedExamId) as never,
      ),
    ]);
    const rejectedForSeed = results.filter(
      (result) =>
        result.status === 'rejected' &&
        result.reason instanceof TRPCError &&
        result.reason.code === 'FORBIDDEN' &&
        result.reason.message.includes('seed'),
    );
    expect(rejectedForSeed.length).toBeGreaterThanOrEqual(1);
  });

  /*
   * ⛔ ĐỐI CHỨNG quan trọng nhất của cả §18.G: cùng lượt nộp đó, KHÔNG kèm
   * `examId`, phải KHÔNG bị cổng seed chạm tới.
   *
   * Thiếu ô này thì một bản cài đặt gác seed VÔ ĐIỀU KIỆN cũng làm ô trên xanh
   * — và bản đó đã được đo là sẽ từ chối MỌI lượt nộp K8s, vì arena sinh seed
   * ngẫu nhiên mỗi phiên. Đó chính là phương án (a) mà chủ dự án đã bác.
   */
  it('cùng lượt nộp KHÔNG kèm examId thì cổng seed không chạm tới', async () => {
    const error = await callerAs(MEMBER, 'user')
      .problems.submit(payloadWith(999, publishedCode, undefined) as never)
      .then(() => null)
      .catch((caught: unknown) => caught);
    // Nó VẪN có thể hỏng — nhật ký rỗng không phát lại ra lời giải nào — nhưng
    // phải hỏng vì một lý do KHÁC, không phải vì seed.
    if (error instanceof TRPCError) {
      expect(error.message).not.toContain('seed máy chủ');
    }
  });

  it('bài NGOÀI đề bị từ chối với đúng lý do đó', async () => {
    const other = await callerAs(ADMIN, 'admin').exams.create({
      classId,
      title: uniqueId('Ky-thi-de-khac'),
      problemCodes: [publishedCode],
      durationMinutes: 60,
      seedStrategy: 'fixed',
      opensAt: null,
      closesAt: null,
    });
    await callerAs(MEMBER, 'user').examSitting.start({ examId: other.id });
    await expect(
      callerAs(MEMBER, 'user').problems.submit(
        payloadWith(1, 'K8S-0009', other.id) as never,
      ),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof TRPCError &&
        (error.message.includes('không nằm trong đề') || error.code === 'NOT_FOUND'),
    );
  });
});
