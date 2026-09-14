import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { inArray } from 'drizzle-orm';
import {
  closeTestDb,
  ctxFor,
  purgeLeakedFixtures,
  testDb,
  uniqueId,
} from '../../security/test-helpers';
import { users, type User } from '../db/schema';
import { createTRPCRouter, protectedProcedure } from '../trpc/init';
import { appRouter } from '../trpc/routers/app-router';
import { classesRouter } from '../trpc/routers/classes';

/**
 * ⛔ **Ô nghiệm thu AC-F** (phase-18 §2, 18.F): *"một sinh viên gọi thẳng điểm
 * cuối bảng điểm lớp bằng tài khoản của mình ⇒ bị từ chối. Test tự động,
 * không thử tay."*
 *
 * File này gác ba việc, và việc thứ ba mới là việc còn sống lâu nhất:
 *
 * 1. `classes.scoreboard` từ chối sinh viên, kể cả sinh viên ĐANG Ở TRONG lớp.
 * 2. Đối chứng dương: cùng lượt gọi đó, một `admin` đọc được, và thứ đọc được
 *    có email của người khác trong đó. Không có vế này thì "sinh viên bị từ
 *    chối" không chứng minh được rằng phép từ chối đang che một thứ có thật.
 * 3. **Cổng duyệt TOÀN BỘ bảng procedure của router** và đòi từng cái từ chối
 *    cả `user` lẫn `author`. Hai ô đầu chỉ nói về những procedure người viết
 *    test nhớ tới; ô thứ ba đỏ với một procedure công khai mà lane sau thêm
 *    vào, kể cả khi người thêm chưa từng đọc file này.
 *
 * ⚠ ĐÒI Postgres, cùng ràng buộc với `authoring.integration.test.ts`.
 *
 * ⚠ `createCaller` BỎ QUA tầng serialize của tRPC: nó đúng cho khẳng định về
 * authz và về DB ở đây, nhưng không chứng minh gì về thứ trình duyệt thật
 * nhận. Vế HTTP thật nằm ở `http-wire.integration.test.ts`, và hai file là hai
 * tầng khác nhau chứ không phải một bản chép.
 */

const ADMIN = uniqueId('lop-adm');
const MEMBER = uniqueId('lop-sv');
const OUTSIDER = uniqueId('lop-ngoai');
const AUTHOR = uniqueId('lop-tg');

let classId = '';

function callerAs(id: string, role: User['role']) {
  return appRouter.createCaller(ctxFor({ id, role }));
}

function isTRPCCode(code: string) {
  return (error: unknown) => error instanceof TRPCError && error.code === code;
}

beforeAll(async () => {
  /*
    Dọn rác của những lượt TRƯỚC trước khi gieo lượt này. `afterAll` không chạy
    khi tiến trình không sống tới đó (Ctrl-C, một ô ném ngoài `it`), nên một
    lượt dọn ở đây là thứ duy nhất tự lành. Xem chú thích dài của
    `purgeLeakedFixtures`.
  */
  await purgeLeakedFixtures(testDb());

  const db = testDb();
  await db.insert(users).values([
    { id: ADMIN, name: 'Giảng viên', email: `${ADMIN}@test.local`, role: 'admin' },
    { id: MEMBER, name: 'Sinh viên trong lớp', email: `${MEMBER}@test.local` },
    { id: OUTSIDER, name: 'Sinh viên ngoài lớp', email: `${OUTSIDER}@test.local` },
    { id: AUTHOR, name: 'Tác giả', email: `${AUTHOR}@test.local`, role: 'author' },
  ]);

  const created = await callerAs(ADMIN, 'admin').classes.create({ name: uniqueId('Lop-AC-F') });
  classId = created.id;
  await callerAs(ADMIN, 'admin').classes.addMember({
    classId,
    email: `${MEMBER}@test.local`,
  });
});

afterAll(async () => {
  // `classes` và `class_members` cascade từ `users`, nên xoá bốn tài khoản là
  // đủ. Đó chính là lý do hai bảng đó khai `onDelete: 'cascade'`.
  await testDb()
    .delete(users)
    .where(inArray(users.id, [ADMIN, MEMBER, OUTSIDER, AUTHOR]));
  await closeTestDb();
});

describe('AC-F · bảng điểm lớp', () => {
  it('sinh viên TRONG lớp gọi thẳng ⇒ FORBIDDEN', async () => {
    // Ca khó nhất, không phải ca dễ: một người ngoài bị chặn là chuyện hiển
    // nhiên; điều AC-F thật sự đòi là người Ở TRONG lớp cũng không đọc được
    // điểm của bạn cùng lớp.
    await expect(
      callerAs(MEMBER, 'user').classes.scoreboard({ classId }),
    ).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
  });

  it('sinh viên NGOÀI lớp gọi thẳng ⇒ FORBIDDEN', async () => {
    await expect(
      callerAs(OUTSIDER, 'user').classes.scoreboard({ classId }),
    ).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
  });

  it('người chưa đăng nhập ⇒ UNAUTHORIZED', async () => {
    await expect(
      appRouter.createCaller(ctxFor(null)).classes.scoreboard({ classId }),
    ).rejects.toSatisfy(isTRPCCode('UNAUTHORIZED'));
  });

  it('ĐỐI CHỨNG DƯƠNG: admin đọc được, và thứ đọc được là dữ liệu của NGƯỜI KHÁC', async () => {
    /*
      Vế này là điều kiện để ba ô trên có nghĩa. Nếu `scoreboard` trả rỗng với
      mọi người thì "sinh viên bị từ chối" cũng đúng, và cũng vô giá trị: phép
      chặn khi ấy không che gì cả. Ô này khẳng định email của một người khác
      THẬT SỰ nằm trong thứ mà admin nhận.
    */
    const board = await callerAs(ADMIN, 'admin').classes.scoreboard({ classId });
    expect(board.rows.map((row) => row.email)).toContain(`${MEMBER}@test.local`);
  });

  it('chủ lớp KHÔNG nằm trong bảng điểm của lớp mình', async () => {
    // `class_members` theo định nghĩa chỉ chứa sinh viên. Chủ lớp lọt vào đây
    // là người chấm xuất hiện trong bảng điểm của chính mình, và mọi phép tính
    // trên sĩ số sau đó lệch một.
    const board = await callerAs(ADMIN, 'admin').classes.scoreboard({ classId });
    expect(board.rows.map((row) => row.userId)).not.toContain(ADMIN);
  });
});

/**
 * Cổng cấu trúc. Xem mục 3 ở chú thích đầu file.
 *
 * Phép đo là HÀNH VI (gọi thật rồi xem ném gì), không phải đọc middleware: một
 * phép đọc `_def` phải tự dựng lại cách tRPC xâu chuỗi middleware, và bản dựng
 * lại đó sẽ trôi khỏi thật ở lần nâng cấp tRPC kế tiếp.
 *
 * Gọi với input RỖNG là cố ý: trong tRPC v11, `.input()` lắp bộ phân giải vào
 * SAU middleware của `adminProcedure`, nên một người không phải admin nhận
 * `FORBIDDEN` trước khi Zod kịp chạy. Nhờ vậy cổng này không cần biết từng
 * procedure ăn input hình gì, và nó vẫn đúng với procedure mà lane sau thêm.
 */
async function procedureLeaks(
  procedureNames: readonly string[],
  call: (name: string) => Promise<unknown>,
): Promise<readonly string[]> {
  const leaked: string[] = [];
  for (const name of procedureNames) {
    try {
      await call(name);
      leaked.push(`${name} (không ném gì)`);
    } catch (error) {
      if (!(error instanceof TRPCError) || error.code !== 'FORBIDDEN') {
        const code = error instanceof TRPCError ? error.code : 'không phải TRPCError';
        leaked.push(`${name} (${code})`);
      }
    }
  }
  return leaked;
}

describe('18.F.3 · MỌI procedure của classes.* đứng sau adminProcedure', () => {
  const names = Object.keys(classesRouter._def.procedures);

  it('đọc được một bảng procedure THẬT', () => {
    // Không có ô này thì một `_def.procedures` rỗng (tRPC đổi hình dạng nội bộ)
    // biến cả cổng dưới thành một no-op xanh vĩnh viễn.
    expect(names.length, 'không đọc được procedure nào của classesRouter').toBeGreaterThanOrEqual(7);
    expect(names).toContain('scoreboard');
    expect(names).toContain('members');
  });

  it.each([['user'], ['author']] as const)('vai trò %s bị từ chối ở TẤT CẢ procedure', async (role) => {
    const caller = callerAs(role === 'author' ? AUTHOR : OUTSIDER, role) as unknown as {
      classes: Record<string, (input: unknown) => Promise<unknown>>;
    };

    const leaked = await procedureLeaks(names, (name) => {
      const procedure = caller.classes[name];
      if (procedure === undefined) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `thiếu ${name}` });
      }
      return procedure({});
    });

    expect(
      leaked,
      'Mỗi dòng trên là một procedure của `classes.*` KHÔNG đứng sau ' +
        '`adminProcedure`. Router này không có điểm cuối nào dành cho sinh ' +
        'viên: mỗi dòng nó trả về là dữ liệu của người khác (danh sách lớp, ' +
        'email thành viên, bảng điểm). Đừng nới cổng này.',
    ).toEqual([]);
  });

  it('ĐỐI CHỨNG DƯƠNG: cổng trên ĐỎ được với một router có procedure công khai', async () => {
    /*
      Không có ô này thì một `procedureLeaks` luôn trả mảng rỗng (bắt nhầm lỗi,
      vòng lặp không chạy, `names` rỗng) cũng làm ô trên xanh, tức xanh vì mù
      chứ không phải vì sạch. Router dưới đây dựng từ CHÍNH `createTRPCRouter`
      và `protectedProcedure` mà `init.ts` xuất ra, nên nó đi qua đúng chuỗi
      middleware đang chạy production, chỉ thiếu đúng nấc `adminProcedure`.
    */
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

describe('18.F.1 · ràng buộc của lớp', () => {
  it('chủ lớp không thêm được chính mình làm sinh viên', async () => {
    await expect(
      callerAs(ADMIN, 'admin').classes.addMember({ classId, email: `${ADMIN}@test.local` }),
    ).rejects.toSatisfy(isTRPCCode('BAD_REQUEST'));
  });

  it('thêm lại một người đã ở trong lớp ⇒ CONFLICT, không phải một no-op im lặng', async () => {
    await expect(
      callerAs(ADMIN, 'admin').classes.addMember({ classId, email: `${MEMBER}@test.local` }),
    ).rejects.toSatisfy(isTRPCCode('CONFLICT'));
  });

  it('email không có tài khoản ⇒ NOT_FOUND', async () => {
    await expect(
      callerAs(ADMIN, 'admin').classes.addMember({
        classId,
        email: 'khong-ai-dang-ky@test.local',
      }),
    ).rejects.toSatisfy(isTRPCCode('NOT_FOUND'));
  });

  it('bỏ một người không ở trong lớp ⇒ NOT_FOUND, không báo thành công', async () => {
    // Một nút "Bỏ khỏi lớp" báo thành công trong khi không xoá dòng nào là một
    // no-op đội lốt, và người bấm sẽ tin rằng danh sách đã đổi.
    await expect(
      callerAs(ADMIN, 'admin').classes.removeMember({ classId, userId: OUTSIDER }),
    ).rejects.toSatisfy(isTRPCCode('NOT_FOUND'));
  });

  it('sĩ số là phép ĐẾM, không phải một cột lưu sẵn', async () => {
    /*
      `classes.member_count` là cột đã cân nhắc rồi bỏ (xem `db/schema.ts`). Ô
      này khẳng định hệ quả quan sát được của việc bỏ nó: thêm rồi bỏ một người
      thì con số đi lên rồi đi xuống mà không có bước đồng bộ nào ở giữa. Một
      cột lưu sẵn quên cập nhật sẽ đỏ ở đúng đây.
    */
    const admin = callerAs(ADMIN, 'admin');
    const truoc = (await admin.classes.get({ classId })).memberCount;

    await admin.classes.addMember({ classId, email: `${OUTSIDER}@test.local` });
    expect((await admin.classes.get({ classId })).memberCount).toBe(truoc + 1);

    await admin.classes.removeMember({ classId, userId: OUTSIDER });
    expect((await admin.classes.get({ classId })).memberCount).toBe(truoc);
  });

  it('lớp không tồn tại ⇒ NOT_FOUND, không phải một bảng điểm rỗng', async () => {
    await expect(
      callerAs(ADMIN, 'admin').classes.scoreboard({
        classId: '0f8e7d6c-5b4a-4938-a271-6c5d4e3f2a1b',
      }),
    ).rejects.toSatisfy(isTRPCCode('NOT_FOUND'));
  });
});
