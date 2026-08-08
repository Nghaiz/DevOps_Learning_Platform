/**
 * Smoke test hạ tầng dữ liệu phía TypeScript (phase-0.md 0.C task 12).
 *
 * Kiểm: Postgres nối được + Redis SET/GET/EXPIRE. Chạy:
 *   pnpm --filter @devops-platform/web db:smoke
 *
 * Bản song sinh phía Go: services/orchestrator/cmd/dbsmoke.
 */
import { sessionKey, POOL_FREE } from '@devops-platform/shared-types';
import { createDatabase } from '../server/db/client';
import { createRedis } from '../server/redis/client';

const SMOKE_SESSION_ID = 'smoke-ts';
const TTL_SECONDS = 30;

async function main(): Promise<void> {
  const { sql } = createDatabase();
  // Script một-lần: nuốt lỗi kết nối ở listener để nó đi ra qua đường throw bên
  // dưới, thay vì thành uncaught exception bỏ qua cả main().catch().
  const redis = createRedis(undefined, () => {});

  try {
    const rows = await sql<{ one: number }[]>`SELECT 1 AS one`;
    if (rows[0]?.one !== 1) {
      throw new Error(`Postgres trả kết quả lạ: ${JSON.stringify(rows)}`);
    }
    console.warn('[smoke] postgres: SELECT 1 ok');

    const key = sessionKey(SMOKE_SESSION_ID);
    await redis.set(key, 'ok');

    const value = await redis.get(key);
    if (value !== 'ok') {
      throw new Error(`Redis GET trả ${JSON.stringify(value)}, mong đợi "ok"`);
    }

    await redis.expire(key, TTL_SECONDS);
    const ttl = await redis.ttl(key);
    if (ttl <= 0 || ttl > TTL_SECONDS) {
      throw new Error(`Redis TTL = ${ttl}, mong đợi trong khoảng (0, ${TTL_SECONDS}]`);
    }
    console.warn(`[smoke] redis: SET/GET/EXPIRE ok trên ${key} (ttl=${ttl}s)`);

    await redis.del(key);
    console.warn(`[smoke] redis: namespace pool dùng key "${POOL_FREE}"`);
    console.warn('[smoke] PASS');
  } finally {
    // allSettled, KHÔNG phải await tuần tự: nếu sql.end() reject (Postgres bị kill
    // giữa chừng) thì redis.disconnect() sẽ không bao giờ chạy, socket ioredis còn
    // mở giữ event loop sống, và process TREO thay vì thoát với exit code đã set.
    // Trong CI đó là job chạy tới hết timeout thay vì fail ngay.
    await Promise.allSettled([
      sql.end({ timeout: 5 }),
      Promise.resolve().then(() => redis.disconnect()),
    ]);
  }
}

main().catch((error: unknown) => {
  console.error('[smoke] FAIL:', error);
  process.exitCode = 1;
});
