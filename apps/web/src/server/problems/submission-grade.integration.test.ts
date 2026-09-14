import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { eq, inArray } from 'drizzle-orm';
import { gradeFromSubmission } from '@devops-platform/games';
import {
  closeTestDb,
  ctxFor,
  purgeLeakedFixtures,
  testDb,
  uniqueId,
} from '../../security/test-helpers';
import { problemSubmissions, problems, users } from '../db/schema';
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
const CLAIMED = {
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
    // `CLAIMED.objectivesMet` rỗng. Bốn id trong DB chỉ có thể tới từ phép phát
    // lại phía máy chủ — xem khối đầu file.
    expect(CLAIMED.objectivesMet).toHaveLength(0);
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
      items: { passed: string[]; total: number }[];
    };
    const item = page.items[0];
    expect(item).toBeDefined();

    const grade = gradeFromSubmission({ passed: item?.passed ?? [], total: item?.total ?? 0 });
    expect(grade.verdict).toBe('WA');
    expect(grade.passed).toHaveLength(4);
    expect(grade.total).toBe(5);
    // Đúng chuỗi mà người học đọc trong lịch sử nộp bài.
    expect(`${grade.verdict} (${grade.passed.length}/${grade.total})`).toBe('WA (4/5)');
  });
});
