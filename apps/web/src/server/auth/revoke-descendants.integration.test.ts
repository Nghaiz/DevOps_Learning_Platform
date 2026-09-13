import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { databaseUrl } from '../env';
import * as schema from '../db/schema';
import { authRefreshTokens, users } from '../db/schema';
import { uniqueId } from '../../security/test-helpers';
import { issueRefreshToken, rotateRefreshToken } from './tokens';

/**
 * Thu hồi chuỗi hậu duệ chạy TRONG transaction đang giữ `SELECT … FOR UPDATE`
 * trên hàng `users`, nên thời gian nó chạy là thời gian mọi request khác của
 * cùng tài khoản phải xếp hàng. File này gác cái TRẦN đó.
 *
 * ⛔ Nó gác bằng SỐ LƯỢT ROUND-TRIP, không bằng đồng hồ. Một ô đo mili-giây trên
 * máy đang chạy song song năm gói test khác là một ô chớp tắt; số lượt truy vấn
 * thì không phụ thuộc máy, và nó chính là đại lượng đã hỏng — bản cũ duyệt theo
 * tầng nên tốn hai lượt cho MỖI thế hệ.
 *
 * Client riêng (không dùng `testDb()` dùng chung) vì nó cần hai thứ mà các file
 * khác không nên chịu: một bộ đếm `debug` cho MỖI truy vấn, và `statement_timeout`
 * để một CTE đệ quy viết sai (`UNION ALL` thay vì `UNION`) đỏ trong 5 giây thay
 * vì treo cho tới lúc ai đó để ý.
 *
 * Vế ĐÚNG (thu hồi được mắt sống ở thế hệ >100) do
 * `security/rule-07-refresh-rotation.test.ts` giữ; file này không chép lại nó.
 *
 * Một review độc lập chỉ ra (N7, 2026-09-13).
 */
const SHALLOW_DEPTH = 3;
const DEEP_DEPTH = 40;

let sql: ReturnType<typeof postgres>;
let db: Database;
let queries = 0;
const seededUsers: string[] = [];

async function seedUser(): Promise<string> {
  const id = uniqueId('revoke-descendants');
  await db.insert(users).values({ id, name: 'Revoke Chain', email: `${id}@example.test` });
  seededUsers.push(id);
  return id;
}

/** Dựng một chuỗi rotation dài `depth`; trả token gốc và mắt SỐNG cuối chuỗi. */
async function chainOfDepth(userId: string, depth: number) {
  const root = await issueRefreshToken(db, userId);
  let tail = root.raw;
  for (let generation = 0; generation < depth; generation += 1) {
    const outcome = await rotateRefreshToken(db, tail);
    if (!outcome.ok) throw new Error('Không dựng được chuỗi rotation');
    tail = outcome.token.raw;
  }
  return { root: root.raw, tail };
}

/** Đếm số lượt truy vấn mà `work` gửi xuống Postgres. */
async function countQueries<T>(work: () => Promise<T>): Promise<{ result: T; queries: number }> {
  queries = 0;
  const result = await work();
  return { result, queries };
}

beforeAll(() => {
  sql = postgres(databaseUrl(), {
    max: 1,
    // Mili-giây, dạng SỐ: kiểu của postgres-js cho khoá này là `number`, và
    // một chuỗi ở đây đỏ typecheck chứ không âm thầm bị bỏ qua.
    connection: { statement_timeout: 5_000 },
    debug: () => {
      queries += 1;
    },
  });
  db = drizzle(sql, { schema });
});

afterAll(async () => {
  for (const id of seededUsers) {
    // `auth_refresh_tokens.user_id` có ON DELETE CASCADE, nên token đi theo user.
    await db.delete(users).where(eq(users.id, id));
  }
  await sql.end({ timeout: 5 });
});

describe('thu hồi chuỗi hậu duệ dưới khoá hàng users', () => {
  it('số lượt truy vấn KHÔNG tăng theo độ dài chuỗi', async () => {
    const userId = await seedUser();

    const shallow = await chainOfDepth(userId, SHALLOW_DEPTH);
    const shallowRun = await countQueries(() => rotateRefreshToken(db, shallow.root));
    expect(shallowRun.result).toEqual({ ok: false, reason: 'revoked' });

    const deep = await chainOfDepth(userId, DEEP_DEPTH);
    const deepRun = await countQueries(() => rotateRefreshToken(db, deep.root));
    expect(deepRun.result).toEqual({ ok: false, reason: 'revoked' });

    expect(
      deepRun.queries,
      `chuỗi ${DEEP_DEPTH} thế hệ tốn ${deepRun.queries} lượt, chuỗi ${SHALLOW_DEPTH} thế hệ tốn ${shallowRun.queries}`,
    ).toBe(shallowRun.queries);

    // ⛔ Đối chứng dương: không có hai vế này, ô trên vẫn xanh nếu việc thu hồi
    // biến thành KHÔNG LÀM GÌ — số lượt khi ấy cũng bằng nhau.
    expect(await rotateRefreshToken(db, shallow.tail)).toEqual({ ok: false, reason: 'revoked' });
    expect(await rotateRefreshToken(db, deep.tail)).toEqual({ ok: false, reason: 'revoked' });
  });

  it('bảng có index trên rotated_from, không chỉ trên user_id', async () => {
    // Một lượt round-trip vẫn có thể là một lượt QUÉT BẢNG: CTE đệ quy tra
    // `rotated_from` một lần mỗi thế hệ ở bên trong Postgres. Ô trên đếm lượt
    // round-trip và mù với điều đó, nên vế này phải được gác riêng.
    const indexes = await sql<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'auth_refresh_tokens'
    `;
    // Khớp theo CỘT chứ không theo tên index: đổi tên không phải hồi quy.
    expect(
      indexes.some((index) => /\(rotated_from\)/.test(index.indexdef)),
      `chỉ thấy: ${indexes.map((index) => index.indexdef).join(' | ')}`,
    ).toBe(true);
  });

  it('dữ liệu bị tạo VÒNG vẫn dừng, và mắt sống trong vòng vẫn chết', async () => {
    const userId = await seedUser();
    const a = await issueRefreshToken(db, userId);
    const b = await rotateRefreshToken(db, a.raw);
    expect(b.ok).toBe(true);
    if (!b.ok) return;

    const rows = await db
      .select({ id: authRefreshTokens.id, rotatedFrom: authRefreshTokens.rotatedFrom })
      .from(authRefreshTokens)
      .where(eq(authRefreshTokens.userId, userId));
    expect(rows).toHaveLength(2);
    const root = rows.find((row) => row.rotatedFrom === null);
    const child = rows.find((row) => row.rotatedFrom !== null);
    expect(root).toBeDefined();
    expect(child).toBeDefined();

    // Đóng vòng A→B→A. `rotated_from` không có ràng buộc khoá ngoại, nên một lượt
    // ghi hỏng hay một bản migrate tay dựng được đúng hình dạng này.
    await db
      .update(authRefreshTokens)
      .set({ rotatedFrom: child!.id })
      .where(eq(authRefreshTokens.id, root!.id));

    // Replay A: claim hụt (A đã revoked lúc xoay) ⇒ duyệt hậu duệ. Phép duyệt
    // phải dừng, và B — mắt đang SỐNG — phải chết.
    expect(await rotateRefreshToken(db, a.raw)).toEqual({ ok: false, reason: 'revoked' });
    expect(await rotateRefreshToken(db, b.token.raw)).toEqual({ ok: false, reason: 'revoked' });
  });
});
