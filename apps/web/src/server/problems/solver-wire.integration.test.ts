import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { eq, inArray } from 'drizzle-orm';
import { closeTestDb, ctxFor, purgeLeakedFixtures, testDb, uniqueId } from '../../security/test-helpers';
import { problemSubmissions, problems, users } from '../db/schema';
import { appRouter } from '../trpc/routers/app-router';

/**
 * §18.B.4 trên ĐƯỜNG HTTP THẬT — vế mà test đơn vị không chứng minh được.
 *
 * ⛔ Vì sao file này tồn tại dù `testcases.test.ts` đã khẳng định cùng một điều:
 * `appRouter.createCaller` **bỏ qua tầng serialize của tRPC**. Repo này đã trả
 * giá cho đúng khoảng hở đó một lần — router xanh trong khi HTTP thật trả 500 vì
 * một `bigint` không serialize được. Một ô khẳng định *"phản hồi KHÔNG chứa X"*
 * mà chạy qua `createCaller` là một ô nói về object trong bộ nhớ, không nói về
 * byte đi trên dây.
 *
 * Nên ô dưới đây đi qua `fetchRequestHandler` với một `Request` thật, và đọc
 * `response.text()` — chuỗi thô, trước khi bất kỳ ai `JSON.parse` nó.
 *
 * ⚠ `createContext` được tiêm thẳng thay vì dựng cookie phiên. Phần xác thực đã
 * có bộ gác riêng (`security/rule-01-authz.test.ts`, `rule-06-access-token.ts`),
 * và dựng lại nó ở đây sẽ làm ô này đỏ vì một lý do không liên quan tới thứ nó
 * đang đo. Thứ KHÔNG bị bỏ qua là đúng thứ cần: định tuyến HTTP, `fetchRequestHandler`,
 * và phép serialize ra JSON.
 *
 * ⚠ ĐÒI Postgres.
 */

const LEARNER = uniqueId('u-learner');
const CODE = 'K8S-9042';

/** Hai chuỗi này không được xuất hiện trong bất kỳ byte nào gửi cho người học. */
const SECRET_CHECK = 'deployment-replicas-ready';
const SECRET_ARG = 'so-bi-mat-cua-testcase';
const HIDDEN_LABEL = 'Nhan bi mat cua testcase an';
const VISIBLE_LABEL = 'Dua 3 pod len 2 node khac nhau';

function handle(path: string, input: unknown, user: { id: string; role: 'user' }): Promise<Response> {
  const url = `http://localhost/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req: new Request(url, { method: 'GET' }),
    router: appRouter,
    createContext: () => ctxFor({ ...user, role: user.role }) as never,
  });
}

beforeAll(async () => {
  await purgeLeakedFixtures(testDb());
  const db = testDb();
  await db.insert(users).values({ id: LEARNER, name: LEARNER, email: `${LEARNER}@example.test` });
  await db.insert(problems).values({
    code: CODE,
    slug: uniqueId('bai-do-ro'),
    title: 'Bai do ro testcase',
    statement: 'De bai ngan.',
    difficulty: 'medium',
    topics: ['workload'],
    tags: [],
    timeLimitSec: null,
    initialState: { nodes: [], namespaces: ['default'], resources: [] } as never,
    objectives: [
      { id: 't1', label: VISIBLE_LABEL, check: SECRET_CHECK, required: true },
      {
        id: 't2',
        label: HIDDEN_LABEL,
        check: 'hidden-check',
        args: { name: SECRET_ARG },
        // Thứ §18.D.2 sẽ ghi từ trang soạn bài. Dựng thẳng vì cột `objectives`
        // là `jsonb`: chú thích `$type<Objective[]>()` của Drizzle là một lời
        // khai lúc biên dịch, không phải một phép kiểm lúc chạy.
        visible: false,
      } as never,
    ] as never,
    allowedResources: null,
    hints: [{ id: 'h1', text: 'Noi dung goi y chua mo', penaltyPoints: 50 }] as never,
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

describe('byCode — byte thật trên dây', () => {
  it('không chở `check`, `args`, nhãn testcase ẩn, hay gợi ý chưa mở', async () => {
    const response = await handle('problems.byCode', { code: CODE }, { id: LEARNER, role: 'user' });
    expect(response.status).toBe(200);

    // CHUỖI THÔ, chưa `JSON.parse`. Một ô đọc `data.problem.testcases[0].check`
    // sẽ xanh khi cách chấm rơi vào một trường KHÁC; chuỗi thì không có chỗ trốn.
    const wire = await response.text();

    expect(wire).not.toContain(SECRET_CHECK);
    expect(wire).not.toContain(SECRET_ARG);
    expect(wire).not.toContain(HIDDEN_LABEL);
    expect(wire).not.toContain('Noi dung goi y chua mo');
    expect(wire).not.toContain('"objectives"');

    // Đối chứng DƯƠNG trong cùng một lượt: nếu ô trên xanh vì phản hồi rỗng
    // hoặc vì một lỗi trả về sớm, thì ba khẳng định kia không chứng minh gì.
    expect(wire).toContain(VISIBLE_LABEL);
    expect(wire).toContain(CODE);
  });
});

describe('list — cách chấm của cả một trang kho bài', () => {
  it('trang danh sách cũng không chở cách chấm của bài nào', async () => {
    // Lỗ rò rộng hơn `byCode`: trước bản này mỗi lần tải `/problems` gửi
    // `check` + `args` của tối đa 20 bài, cho một người chưa mở bài nào.
    const response = await handle(
      'problems.list',
      // `query` nằm TRONG `filter` (`listProblemsInput`), không ở gốc — schema
      // là `.strict()` nên đặt sai chỗ trả 400 chứ không im lặng bỏ qua.
      { limit: 20, filter: { query: CODE } },
      { id: LEARNER, role: 'user' },
    );
    expect(response.status).toBe(200);

    const wire = await response.text();
    expect(wire).not.toContain(SECRET_CHECK);
    expect(wire).not.toContain(SECRET_ARG);
    expect(wire).not.toContain(HIDDEN_LABEL);
    expect(wire).not.toContain('"objectives"');
    expect(wire).toContain(CODE);
  });
});
