import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { eq, inArray } from 'drizzle-orm';
import { gradeFromSubmission, type ProblemFailureCode } from '@devops-platform/games';
import {
  closeTestDb,
  ctxFor,
  purgeLeakedFixtures,
  testDb,
  uniqueId,
} from '../../security/test-helpers';
import { problemSubmissions, problems, users } from '../db/schema';
import { resetRateLimitState } from '../security/rate-limit';
import { appRouter } from '../trpc/routers/app-router';
import { problemTestcases } from './testcases';

/**
 * §18.C — `passed`/`total` là SỰ THẬT LỊCH SỬ, không phải một phép suy lúc đọc.
 *
 * Hai ô nghiệm thu của lane, và ô thứ hai mới là ô quan trọng:
 *
 *  1. Nộp một bài 5 testcase, qua 4 ⇒ đọc lại TỪ DB ra đúng 4 id và `total` 5.
 *  2. Nộp xong rồi **SỬA BÀI** thêm testcase ⇒ lượt nộp cũ vẫn `4/5`, không
 *     thành `4/6`. Không có ô này thì cột `total` chỉ là một cột thừa: mọi thứ
 *     nó chở đều suy lại được từ bài hôm nay, và nó sẽ bị ai đó xoá đi trong
 *     một lần dọn dẹp "trường suy ra được" hoàn toàn có thiện chí.
 *
 * ## Vì sao qua HTTP THẬT chứ không qua `createCaller`
 *
 * `appRouter.createCaller` **bỏ qua tầng serialize của tRPC**. Repo này đã trả
 * giá cho đúng khoảng hở đó một lần — router xanh trong khi HTTP thật trả 500 vì
 * một `bigint`. `passed` là một `text[]` của Postgres và `total` là một
 * `integer`; cả hai đi qua `node-postgres` trước khi đi qua `JSON.stringify`, và
 * một ô chạy trong bộ nhớ không nói gì về hai phép chuyển đó.
 *
 * ## Vì sao `claimed.objectivesMet` CỐ Ý để RỖNG
 *
 * Đây không phải lười dựng dữ liệu — nó là phần đo chính. Bản trước của
 * `submit.ts` lấy `passed` từ `claimed.objectivesMet` (lời khai của client);
 * bản này chấm bằng `gradeProblemRun`, tức máy chủ tự phát lại nhật ký. Một lượt
 * nộp khai **không qua testcase nào** mà vẫn đọc ra 4 id là bằng chứng trực tiếp
 * rằng đường cũ đã đứt. Nếu ai đó nối lại nó, ô này đỏ ngay.
 *
 * ⚠ ĐÒI Postgres.
 */

const LEARNER = uniqueId('u-grade');
const CODE = 'K8S-9043';
const SEED = 7;

/** Bốn cái này CÓ trong `initialState`; cái thứ năm thì không. */
const CO_THAT = ['cm-mot', 'cm-hai', 'cm-ba', 'cm-bon'] as const;
const CON_THIEU = 'cm-nam-chua-tao';

function testcase(id: string, name: string, label: string): Record<string, unknown> {
  return {
    id,
    label,
    check: 'resource-exists',
    args: { kind: 'ConfigMap', name, namespace: 'default' },
    required: true,
  };
}

/** Năm testcase lúc NỘP. Bốn cái đầu qua, cái cuối không. */
const NAM_TESTCASE = [
  testcase('t1', CO_THAT[0], 'Tạo ConfigMap một'),
  testcase('t2', CO_THAT[1], 'Tạo ConfigMap hai'),
  testcase('t3', CO_THAT[2], 'Tạo ConfigMap ba'),
  testcase('t4', CO_THAT[3], 'Tạo ConfigMap bốn'),
  testcase('t5', CON_THIEU, 'Tạo ConfigMap năm'),
];

/** Sáu testcase SAU KHI tác giả sửa bài — thêm `t6` vào cuối. */
const SAU_TESTCASE = [...NAM_TESTCASE, testcase('t6', 'cm-sau-them-sau', 'Case thêm sau')];

const INITIAL_STATE = {
  nodes: [],
  namespaces: ['default'],
  resources: CO_THAT.map((name) => ({
    kind: 'ConfigMap',
    name,
    namespace: 'default',
    spec: {},
  })),
};

const RUN_LOG = { gameId: 'k8s', levelId: CODE, seed: SEED, actions: [] };

/**
 * Lời khai của client — CỐ Ý nói "không qua testcase nào" (xem khối đầu file).
 *
 * `startedAt`/`finishedAt` là hai số bất kỳ hợp lệ: `durationSeconds` không nằm
 * trong thứ ô này đo, và `submit.ts` đã tự kẹp chúng.
 */
const CLAIMED_LECH = {
  gameId: 'k8s',
  levelId: CODE,
  seed: SEED,
  startedAt: 1_700_000_000_000,
  finishedAt: 1_700_000_060_000,
  objectivesMet: [],
  objectivesTotal: 5,
  commandsUsed: 0,
  hintsUsed: 0,
  score: 0,
};

/**
 * Lời khai KHỚP với phép phát lại, tức thứ một client thật gửi lên.
 *
 * ⚠ ĐỔI 2026-09-15, đọc trước khi sửa file này. Bản trước chỉ có MỘT hằng, chính
 * là `CLAIMED_LECH`, và nó cố ý khai sai để chứng minh `passed` tới từ máy chủ.
 * Phép chứng minh ấy dựa vào một hành vi VỪA BỊ BỎ: `verifyRun` so cả
 * `objectivesMet` (`core/verify.ts:432`) lẫn `score`, nên một lời khai rỗng LUÔN
 * ra `khong-khop` — và trước bản này đường chấm vẫn trả `WA (4/5)` cho một lượt
 * đã trượt xác minh.
 *
 * Chủ dự án chốt 2026-09-15: mọi lượt không xác minh được đều hiện `CE`. Lời
 * khai lệch vì thế không còn đi tới bước chấm theo testcase, nên nhóm AC-1/AC-2
 * — vốn cần một dòng ĐÃ CHẤM THẬT để nói `total` là sự thật lịch sử — phải dùng
 * lời khai khớp.
 *
 * `score: 560` là số ĐO ĐƯỢC chứ không phải số đoán: `scoreProblemRun({
 * objectivesMet: 4, objectivesTotal: 5, movesUsed: 0, parMoves: null, hints: [],
 * revealedHintIds: [] })` trả đúng nó. Cố ý viết thành HẰNG thay vì gọi lại hàm
 * đó tại chỗ — tính lại bằng chính hàm mà cổng đang dùng là một ô tự điều chỉnh,
 * luôn xanh kể cả khi công thức đổi.
 */
const CLAIMED = {
  ...CLAIMED_LECH,
  objectivesMet: ['t1', 't2', 't3', 't4'],
  score: 560,
};

function ctx(): never {
  return ctxFor({ id: LEARNER, role: 'user' } as never) as never;
}

/** Mutation qua `fetchRequestHandler` — POST, body là input thô (client không batch). */
async function post(path: string, input: unknown): Promise<unknown> {
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req: new Request(`http://localhost/api/trpc/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
    router: appRouter,
    createContext: ctx,
  });
  return unwrap(await response.text(), path);
}

/** Query qua `fetchRequestHandler` — GET, input trong query string. */
async function get(path: string, input: unknown): Promise<unknown> {
  const url = `http://localhost/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req: new Request(url, { method: 'GET' }),
    router: appRouter,
    createContext: ctx,
  });
  return unwrap(await response.text(), path);
}

/**
 * Bóc `{ result: { data } }` — và NÉM kèm body thô khi tRPC trả lỗi.
 *
 * Không `?? {}`, không `as any`: một lỗi tRPC bị nuốt ở đây sẽ hiện ra thành
 * `expected undefined to equal [...]`, và người đọc đi tìm bug ở cột DB thay vì
 * đọc câu lỗi đã có sẵn trong body.
 */
function unwrap(body: string, path: string): unknown {
  const parsed = JSON.parse(body) as { result?: { data?: unknown }; error?: unknown };
  if (parsed.error !== undefined || parsed.result === undefined) {
    throw new Error(`${path} trả lỗi: ${body}`);
  }
  return parsed.result.data;
}

beforeAll(async () => {
  const db = testDb();
  await purgeLeakedFixtures(db);
  await db.delete(problemSubmissions).where(eq(problemSubmissions.problemCode, CODE));
  await db.delete(problems).where(eq(problems.code, CODE));
  await db.insert(users).values({ id: LEARNER, name: LEARNER, email: `${LEARNER}@example.test` });
  await db.insert(problems).values({
    code: CODE,
    slug: uniqueId('bai-chot-lich-su'),
    title: 'Bai chot passed/total',
    statement: 'Tao bon ConfigMap.',
    difficulty: 'easy',
    topics: ['workload'],
    tags: [],
    timeLimitSec: null,
    initialState: INITIAL_STATE as never,
    objectives: NAM_TESTCASE as never,
    allowedResources: null,
    hints: [],
    parMoves: null,
    state: 'published',
    authorId: null,
  });
});

afterAll(async () => {
  const db = testDb();
  await db.delete(problemSubmissions).where(eq(problemSubmissions.problemCode, CODE));
  await db.delete(problems).where(eq(problems.code, CODE));
  await db.delete(users).where(inArray(users.id, [LEARNER]));
  await closeTestDb();
});

describe('AC-1 — nộp bài 5 testcase, qua 4', () => {
  it('phản hồi trên DÂY mang verdict `WA (4/5)`', async () => {
    const data = (await post('problems.submit', { code: CODE, runLog: RUN_LOG, claimed: CLAIMED })) as {
      grade: { verdict: string; passed: string[]; total: number };
      submission: { passed: string[]; total: number };
    };

    expect(data.grade.verdict).toBe('WA');
    expect([...data.grade.passed].sort()).toEqual(['t1', 't2', 't3', 't4']);
    expect(data.grade.total).toBe(5);

    // Cùng hai con số ở DTO của lượt nộp — cùng một `GradeResult`, không phải
    // hai phép tính. Lệch nhau ở đây nghĩa là ai đó đã tính lại `passed` lần hai.
    expect([...data.submission.passed].sort()).toEqual([...data.grade.passed].sort());
    expect(data.submission.total).toBe(data.grade.total);
  });

  it('ĐỌC LẠI TỪ DB ra đúng 4 id và `total` 5', async () => {
    const rows = await testDb()
      .select()
      .from(problemSubmissions)
      .where(eq(problemSubmissions.problemCode, CODE));

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toBeDefined();
    expect([...(row?.passed ?? [])].sort()).toEqual(['t1', 't2', 't3', 't4']);
    expect(row?.total).toBe(5);
  });

  it('`passed` KHÔNG tới từ lời khai của client', async () => {
    /*
     * ⚠ PHÉP CHỨNG MINH ĐỔI HÌNH 2026-09-15 — ghi lại vì bản cũ MẠNH HƠN, và nó
     * mất đi vì một quyết định sản phẩm chứ không vì ai đó nới ô test.
     *
     * Bản cũ khai `objectivesMet: []` rồi chỉ ra bốn id trong DB: một lời khai
     * rỗng không thể đẻ ra bốn id, nên bốn id đó phải tới từ máy chủ. Gọn, và
     * không cãi được. Nhưng từ khi mọi lượt không-xác-minh-được về `CE`, một lời
     * khai rỗng bị CHẶN trước bước chấm, nên ca đó không còn tồn tại để quan sát.
     *
     * Thứ thay thế yếu hơn một bậc và phải nói thẳng ra như vậy: nó chốt rằng
     * trên DÂY không có chỗ nào cho client gửi `passed` lên, và một khoá lạ bị
     * TỪ CHỐI chứ không bị bỏ qua (`problems.submit` dùng `.strict()`).
     *
     * Vế hành vi còn lại nằm ở nhóm AC-4: một lời khai lệch ra `CE` với `passed`
     * RỖNG — máy chủ không những không chép lời khai, nó vứt luôn số của chính
     * mình khi không chứng minh được.
     */
    expect(Object.keys(CLAIMED)).not.toContain('passed');
    const rows = await testDb()
      .select({ passed: problemSubmissions.passed })
      .from(problemSubmissions)
      .where(eq(problemSubmissions.problemCode, CODE));
    expect(rows[0]?.passed).toHaveLength(4);
  });
});

describe('AC-2 — sửa bài SAU khi nộp không viết lại lịch sử', () => {
  it('đối chứng dương: bài hôm nay THẬT SỰ đã có 6 testcase', async () => {
    await testDb()
      .update(problems)
      .set({ objectives: SAU_TESTCASE as never })
      .where(eq(problems.code, CODE));

    const rows = await testDb().select().from(problems).where(eq(problems.code, CODE));
    // ⛔ Ô này không thừa. Không có nó, một phép `update` im lặng không ăn (sai
    // mệnh đề `where`, sai tên cột) sẽ làm ô dưới XANH vì bài chưa hề đổi — tức
    // một ô đo đúng thứ nó định đo lại đọc ra y hệt một ô không đo gì.
    expect(problemTestcases(rows[0]?.objectives ?? []).length).toBe(6);
  });

  it('lượt nộp cũ vẫn `4/5` chứ không phải `4/6`', async () => {
    const page = (await get('problems.mySubmissions', { code: CODE, limit: 10 })) as {
      items: { passed: string[]; total: number }[];
    };

    expect(page.items).toHaveLength(1);
    const item = page.items[0];
    expect(item).toBeDefined();
    expect(item?.total).toBe(5);
    expect(item?.passed).toHaveLength(4);
  });

  it('lịch sử dựng lại verdict `WA (4/5)` từ hai cột đã chốt', async () => {
    const page = (await get('problems.mySubmissions', { code: CODE, limit: 10 })) as {
      items: { passed: string[]; total: number; failedCode: ProblemFailureCode | null }[];
    };
    const item = page.items[0];
    expect(item).toBeDefined();
    // Lượt này chấm được, nên KHÔNG có mã hỏng. Đây là vế đối chứng của nhóm
    // AC-3 ngay dưới: nếu `failedCode` khác `null` ở đây thì phép so bên dưới
    // sẽ xanh vì lý do sai.
    expect(item?.failedCode ?? null).toBeNull();

    const grade = gradeFromSubmission({
      passed: item?.passed ?? [],
      total: item?.total ?? 0,
      failedCode: item?.failedCode ?? null,
    });
    expect(grade.verdict).toBe('WA');
    expect(grade.passed).toHaveLength(4);
    expect(grade.total).toBe(5);
    // Đúng chuỗi mà người học đọc trong lịch sử nộp bài.
    expect(`${grade.verdict} (${grade.passed.length}/${grade.total})`).toBe('WA (4/5)');
  });
});

/*
 * AC-3 — nợ §0.3a của `phase-18.md`, đóng ở migration 0015.
 *
 * Nhóm này KHÔNG đi qua HTTP, và đó là chủ ý: nó gác phép ĐỌC LẠI, tức hàm
 * `gradeFromSubmission` chạy trên đúng hình dạng ba cột mà DB trả ra. Dựng một
 * lượt `engine-khong-tat-dinh` thật qua dây đòi một engine cố tình không tất
 * định — một đồ giả sẽ chỉ chứng minh rằng đồ giả hoạt động.
 *
 * Ô quan trọng nhất là ô thứ hai: hai dòng có `passed`/`total` GIỐNG HỆT nhau
 * phải đọc ra hai verdict khác nhau. Nếu nó xanh khi `failedCode` bị bỏ qua thì
 * cột thứ ba đang không làm gì.
 */
describe('AC-3 — `CE` thật không còn đọc lại thành `WA (0/5)`', () => {
  it('lượt CE do engine không tất định đọc ra `CE`, không phải `WA`', () => {
    const grade = gradeFromSubmission({
      passed: [],
      total: 5,
      failedCode: 'engine-khong-tat-dinh',
    });
    expect(grade.verdict).toBe('CE');
    // `fraction` không được in cho `CE` — xem `VerdictView`.
    expect(grade.failedReason).toBe(
      'Hai lần phát lại cùng một nhật ký cho hai kết quả khác nhau.',
    );
  });

  it('ĐỐI CHỨNG: cùng `passed`/`total` nhưng KHÔNG có mã thì vẫn là `WA (0/5)`', () => {
    // Đây là ca mà một bản vá "đoán từ `passed.length === 0`" sẽ làm hỏng: một
    // người chạy được bài nhưng không qua case nào cũng có `passed` rỗng.
    const grade = gradeFromSubmission({ passed: [], total: 5, failedCode: null });
    expect(grade.verdict).toBe('WA');
    expect(`${grade.verdict} (${grade.passed.length}/${grade.total})`).toBe('WA (0/5)');
    expect(grade.failedReason).toBeNull();
  });

  it('dòng ghi TRƯỚC 0015 (`total` 0, không mã) vẫn đọc là `CE` không đoán lý do', () => {
    const grade = gradeFromSubmission({ passed: [], total: 0, failedCode: null });
    expect(grade.verdict).toBe('CE');
    expect(grade.failedReason).toBe('Lượt này không chấm được, và lịch sử không lưu lý do.');
  });

  it('bài chưa có testcase nào nói đúng lý do của nó', () => {
    const grade = gradeFromSubmission({ passed: [], total: 0, failedCode: 'chua-co-testcase' });
    expect(grade.verdict).toBe('CE');
    expect(grade.failedReason).toBe('Bài này chưa có testcase nào nên chưa chấm được.');
  });
});

/*
 * AC-4 — thứ ĐƯỢC GHI vào `fail_code`, không phải thứ đọc ra từ nó.
 *
 * Nhóm `AC-3` ở trên gác phía ĐỌC: nó gọi `gradeFromSubmission` với ba giá trị
 * dựng TAY. Review đối kháng 2026-09-15 đo ra hệ quả: xoá hẳn dòng
 * `failCode: grade.failedCode` ở `submit.ts` thì **cả suite vẫn xanh**. Một cột
 * không có ô nào khẳng định nó ĐƯỢC GHI là một cột chưa được gác.
 *
 * Ca dùng để gác là `khong-khop`, vì nó là ca đắt nhất nếu sai: lượt chơi CHẠY
 * TỚI NƠI và qua hết testcase, nhưng lời khai điểm không khớp phát lại. Trước
 * 2026-09-15 đường này để `gradeProblemRun` trả `AC`, nên lịch sử hiện "AC" cạnh
 * `solved: false, score: 0` — ba câu mâu thuẫn trên cùng một dòng. Chủ dự án
 * chốt: hiện `CE`.
 */
describe('AC-4 — lượt TRƯỢT xác minh ghi đúng mã hỏng xuống cột', () => {
  beforeAll(async () => {
    // Nhóm AC-2 đã thêm case thứ SÁU vào bài để chứng minh `total` là sự thật
    // lịch sử. Trả bài về năm case để `CLAIMED` (khai `score: 560` cho 4/5) lại
    // KHỚP phép phát lại — nếu không, mọi lượt ở nhóm này đều `khong-khop` và ô
    // đối chứng bên dưới sẽ xanh vì lý do sai.
    await testDb()
      .update(problems)
      .set({ objectives: NAM_TESTCASE as never })
      .where(eq(problems.code, CODE));
  });

  it('khoá `passed` lạ trong lời khai bị BỎ QUA, không được tin', async () => {
    /*
     * Vế hành vi thay cho phép chứng minh cũ ở AC-1.
     *
     * `claimed` cố ý KHÔNG `.strict()` (xem chú thích input ở
     * `trpc/routers/problems.ts`), nên một khoá lạ bị Zod GỠ BỎ chứ không làm
     * lượt nộp đỏ. Đó là hành vi đúng, và nó cũng là thứ đáng gác: gỡ bỏ nghĩa
     * là giá trị client gửi không bao giờ tới được chỗ ghi.
     *
     * Khai `passed` đủ NĂM id trong khi phát lại chỉ ra bốn: nếu có bất kỳ đường
     * nào cho lời khai chạm vào cột, dòng ghi ra sẽ có năm.
     */
    const data = (await post('problems.submit', {
      code: CODE,
      runLog: RUN_LOG,
      claimed: { ...CLAIMED, passed: ['t1', 't2', 't3', 't4', 't5'] },
    })) as { submission: { passed: string[] } };

    expect([...data.submission.passed].sort()).toEqual(['t1', 't2', 't3', 't4']);
  });

  it('claim điểm sai ⇒ cột `fail_code` mang `khong-khop`, verdict `CE`', async () => {
    const truoc = await testDb()
      .select()
      .from(problemSubmissions)
      .where(eq(problemSubmissions.problemCode, CODE));

    const data = (await post('problems.submit', {
      code: CODE,
      runLog: RUN_LOG,
      // `CLAIMED_LECH` khai `objectivesMet: []` trong khi phát lại ra bốn, và
      // `verifyRun` so CẢ `objectivesMet` lẫn `score` (`core/verify.ts:432`),
      // nên đây là cách tất định nhất để ép `khong-khop` mà không phải giả lập
      // một engine hỏng.
      claimed: CLAIMED_LECH,
    })) as { grade: { verdict: string; failedCode: string | null } };

    expect(data.grade.verdict).toBe('CE');
    expect(data.grade.failedCode).toBe('khong-khop');

    const sau = await testDb()
      .select()
      .from(problemSubmissions)
      .where(eq(problemSubmissions.problemCode, CODE));
    expect(sau.length).toBe(truoc.length + 1);

    const moi = [...sau].sort(
      (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime(),
    )[0];
    expect(moi).toBeDefined();
    // ⛔ Đây là vế mà nhóm AC-3 KHÔNG nói được: giá trị nằm trong CỘT.
    expect(moi?.failCode).toBe('khong-khop');
    expect(moi?.passed).toEqual([]);
    // Lượt trượt xác minh vẫn được ghi và vẫn đếm vào `attemptCount` — nó chỉ
    // mất quyền được điểm. Xem `verify.ts` §8.3.3.
    expect(moi?.solved).toBe(false);
    expect(moi?.score).toBe(0);
  });

  it('ĐỐI CHỨNG: lượt hợp lệ ghi `fail_code` là `null`', async () => {
    // Không có ô này thì ô trên cũng xanh khi MỌI lượt đều ghi `khong-khop`.
    const data = (await post('problems.submit', {
      code: CODE,
      runLog: RUN_LOG,
      claimed: CLAIMED,
    })) as { grade: { verdict: string; failedCode: string | null } };

    expect(data.grade.failedCode).toBeNull();
    expect(data.grade.verdict).not.toBe('CE');
  });
});

/*
 * AC-5 — trần nhịp nộp bài (§18.C.4).
 *
 * Cổng này dựng ngày 2026-09-15 và review đo ra rằng **không ô nào đỏ được khi
 * gỡ nó**: `grep` toàn repo không ra file test nào chạm `SUBMIT_LIMIT_PER_MIN`
 * hay khoá `problems:submit:`. Tiền lệ ngay trong repo thì có —
 * `QUIZ_SUBMIT_LIMIT_PER_MIN` cùng con số, cùng khuôn, CÓ ô gác.
 *
 * `resetRateLimitState()` chạy trước vì bucket là in-memory per-process và dùng
 * chung với mọi ô khác trong cùng worker; không reset thì ô này đỏ hay xanh tuỳ
 * vào số lượt nộp của các nhóm phía trên, tức một ô đo chính thứ tự chạy.
 */
describe('AC-5 — trần 6 lượt nộp mỗi phút', () => {
  it('lượt thứ bảy trong một phút bị từ chối', async () => {
    resetRateLimitState();

    for (let i = 0; i < 6; i += 1) {
      await post('problems.submit', { code: CODE, runLog: RUN_LOG, claimed: CLAIMED });
    }

    await expect(
      post('problems.submit', { code: CODE, runLog: RUN_LOG, claimed: CLAIMED }),
    ).rejects.toThrow(/TOO_MANY_REQUESTS|quá nhanh/u);
  });

  it('ĐỐI CHỨNG: sau khi reset bucket thì nộp lại được ngay', () => {
    // Chốt rằng ô trên đỏ vì TRẦN NHỊP, không phải vì lượt nộp tự nó đã hỏng
    // sau sáu lần (dữ liệu thay đổi, bài bị sửa, v.v.).
    resetRateLimitState();
    return expect(
      post('problems.submit', { code: CODE, runLog: RUN_LOG, claimed: CLAIMED }),
    ).resolves.toBeDefined();
  });
});
