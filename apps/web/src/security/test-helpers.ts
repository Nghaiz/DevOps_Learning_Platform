import { createDatabase, type Database } from '../server/db/client';
import type { AuthedUser, TRPCContext } from '../server/trpc/init';

/**
 * DB dùng chung cho các test rule-0N — một pool cho cả file test-suite, đóng ở
 * `afterAll` từng file (không đóng ở đây vì nhiều test file import module này).
 */
let shared: { db: Database; sql: ReturnType<typeof createDatabase>['sql'] } | null = null;

export function testDb(): Database {
  shared ??= createDatabase();
  return shared.db;
}

export async function closeTestDb(): Promise<void> {
  if (shared !== null) {
    await shared.sql.end({ timeout: 5 });
    shared = null;
  }
}

/**
 * Context tRPC giả cho test router trực tiếp qua `appRouter.createCaller`.
 *
 * `resHeaders` là một `Headers` THẬT chứ không phải stub: `fetchRequestHandler`
 * cũng đưa vào đúng kiểu đó và dựng `Response` từ nó, nên test đọc
 * `ctx.resHeaders.getSetCookie()` là đọc đúng thứ trình duyệt sẽ nhận.
 */
export function ctxFor(user: AuthedUser | null): TRPCContext {
  return { db: testDb(), user, reqHeaders: new Headers(), resHeaders: new Headers() };
}

export function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
