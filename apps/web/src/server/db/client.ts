import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { databaseUrl } from '../env';
import * as schema from './schema';

// Database = INSTANCE Drizzle (phần `db` của bundle trả về) — mọi consumer
// destructure rồi truyền instance trần; `sql` chỉ script một-lần cần để đóng pool.
export type Database = ReturnType<typeof createDatabase>['db'];

let cachedDb: Database | null = null;

/**
 * Singleton LAZY cho code chạy trong Next (route handler, tRPC context, RSC).
 *
 * KHÔNG được gọi `createDatabase()` ở module scope: `next build` (bước
 * "Collecting page data") import route module KHÔNG có DATABASE_URL — requireEnv
 * throw và build image Docker chết. Kết nối DB phải xảy ra ở request đầu tiên,
 * không phải lúc import. Script một-lần (db-smoke) vẫn dùng `createDatabase()`
 * trực tiếp vì cần `sql` để đóng pool.
 */
export function getDb(): Database {
  cachedDb ??= createDatabase().db;
  return cachedDb;
}

/**
 * Tạo connection pool + Drizzle client.
 *
 * Trả về cả `sql` để caller đóng được pool — script một-lần (db:smoke, migration)
 * sẽ treo process nếu không đóng.
 */
export function createDatabase(url: string = databaseUrl()) {
  const sql = postgres(url, { max: 10 });
  return { db: drizzle(sql, { schema }), sql };
}
