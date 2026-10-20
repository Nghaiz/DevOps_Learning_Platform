import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import type { GameId } from '@devops-platform/games';

import { closeTestDb, ctxFor, testDb, uniqueId } from '../../security/test-helpers';
import { problems } from '../db/schema';
import { appRouter } from '../trpc/routers/app-router';

/**
 * `problems.list({ filter: { gameId } })` — bộ lọc theo game, đi qua ROUTER thật.
 *
 * Đi qua `appRouter` chứ không gọi thẳng `listProblemsForSolver`: hai cổng nối
 * tiếp nhau và hỏng độc lập (schema Zod `.strict()` và mệnh đề WHERE). Một ô chỉ
 * gọi tầng dịch vụ sẽ xanh trong khi người dùng nhận 400 vì schema chưa nhận khoá.
 *
 * ⚠ ĐÒI Postgres. `createCaller` bỏ qua tầng serialize của tRPC.
 *
 * Mã cao (`-9951`) cố ý: không đụng bài seed thật `K8S-00xx`.
 */

const VIEWER = uniqueId('u-gamefilter');
const GIT_CODE = 'GIT-9951';
const K8S_CODE = 'K8S-9951';
const CODES = [GIT_CODE, K8S_CODE];

function row(code: string, gameId: GameId) {
  return {
    code,
    gameId,
    slug: `gamefilter-${code.toLowerCase()}`,
    title: `Bài lọc game ${code}`,
    statement: 'Đề ngắn.',
    difficulty: 'easy' as const,
    topics: [] as string[],
    tags: [] as string[],
    timeLimitSec: null,
    // Đường DANH SÁCH không phát lại gì, nên trạng thái đầu không cần đúng hình
    // dạng của game — chỉ cần là jsonb hợp lệ.
    initialState: {},
    objectives: [{ id: 't1', label: 'Xong', check: 'x', args: {}, visible: true }],
    allowedResources: null,
    hints: [],
    parMoves: null,
    state: 'published' as const,
    authorId: null,
  } as unknown as typeof problems.$inferInsert;
}

async function cleanup(): Promise<void> {
  await testDb().delete(problems).where(inArray(problems.code, CODES));
}

/** Đi hết mọi trang bằng chính `nextCursor` mà router trả ra. */
async function walk(gameId: GameId | undefined) {
  const caller = appRouter.createCaller(ctxFor({ id: VIEWER, role: 'user' }));
  const codes: { code: string; gameId: GameId }[] = [];
  let cursor: string | null = null;
  // Trần từ số dòng thật — một hằng sẽ sai khi DB dùng chung có thêm bài.
  const cap = Math.ceil((await testDb().$count(problems)) / 100) + 2;
  for (let page = 0; page < cap; page += 1) {
    const result = await caller.problems.list({
      limit: 100,
      ...(gameId === undefined ? {} : { filter: { gameId } }),
      ...(cursor === null ? {} : { cursor }),
    });
    codes.push(...result.items.map((item) => ({ code: item.problem.code, gameId: item.problem.gameId })));
    if (result.nextCursor === null) {
      return codes;
    }
    cursor = result.nextCursor;
  }
  throw new Error(`phân trang không kết thúc sau ${String(cap)} trang`);
}

beforeAll(async () => {
  await cleanup();
  await testDb().insert(problems).values([row(GIT_CODE, 'git'), row(K8S_CODE, 'k8s')]);
});

afterAll(async () => {
  await cleanup();
  await closeTestDb();
});

describe('problems.list · filter.gameId', () => {
  it('gameId = git ⇒ CHỈ bài git, và có bài git của bộ này', async () => {
    const got = await walk('git');
    expect(got.map((item) => item.code)).toContain(GIT_CODE);
    expect(got.map((item) => item.code)).not.toContain(K8S_CODE);
    expect(got.filter((item) => item.gameId !== 'git')).toEqual([]);
  });

  it('gameId = k8s ⇒ chiều ngược lại', async () => {
    const got = await walk('k8s');
    expect(got.map((item) => item.code)).toContain(K8S_CODE);
    expect(got.map((item) => item.code)).not.toContain(GIT_CODE);
    expect(got.filter((item) => item.gameId !== 'k8s')).toEqual([]);
  });

  it('ĐỐI CHỨNG: vắng gameId ⇒ mọi game, đúng hành vi cũ', async () => {
    // Không có ô này thì một bộ lọc luôn trả bài của game đầu tiên cũng làm hai
    // ô trên xanh một nửa.
    const codes = (await walk(undefined)).map((item) => item.code);
    expect(codes).toContain(GIT_CODE);
    expect(codes).toContain(K8S_CODE);
  });

  it('gameId lạ bị router từ chối (400), không ra trang rỗng', async () => {
    const caller = appRouter.createCaller(ctxFor({ id: VIEWER, role: 'user' }));
    await expect(
      caller.problems.list({ limit: 10, filter: { gameId: 'kubernetes' } } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
