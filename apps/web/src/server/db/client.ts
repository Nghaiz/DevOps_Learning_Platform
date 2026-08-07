import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { databaseUrl } from '../env.js';
import * as schema from './schema.js';

export type Database = ReturnType<typeof createDatabase>;

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
