import { randomBytes, createHash } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Database, DbOrTx } from '../db/client';
import { authRefreshTokens, sessions, users, verifications } from '../db/schema';

/**
 * Refresh token TÁCH BIỆT khỏi access JWT và khỏi session cookie của Better Auth
 * (luật 6,7 — phase-0.md 0.D task 15, xem chú thích đầy đủ ở schema.ts).
 *
 * Token thô (32 byte ngẫu nhiên, hex) chỉ tồn tại trong cookie httpOnly gửi cho
 * client; DB chỉ giữ SHA-256 của nó — rò DB không lộ token dùng được.
 */
const RAW_TOKEN_BYTES = 32;
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 ngày

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function generateRawToken(): string {
  return randomBytes(RAW_TOKEN_BYTES).toString('hex');
}

export interface IssuedRefreshToken {
  raw: string;
  expiresAt: Date;
}

/** Phát refresh token MỚI cho user — dùng lúc đăng nhập hoặc bootstrap phiên đầu. */
export async function issueRefreshToken(
  db: Database,
  userId: string,
  rotatedFrom?: string,
): Promise<IssuedRefreshToken> {
  return withUserLock(db, userId, (tx) => insertRefreshToken(tx, userId, rotatedFrom));
}

async function withUserLock<T>(
  db: Database,
  userId: string,
  work: (tx: DbOrTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
    return work(tx);
  });
}

async function insertRefreshToken(
  db: DbOrTx,
  userId: string,
  rotatedFrom?: string,
): Promise<IssuedRefreshToken> {
  const raw = generateRawToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await db.insert(authRefreshTokens).values({
    userId,
    tokenHash: hashToken(raw),
    expiresAt,
    rotatedFrom: rotatedFrom ?? null,
  });

  return { raw, expiresAt };
}

/** Bootstrap must recheck the session after waiting for concurrent reset revocation. */
export async function issueRefreshTokenForSession(
  db: Database,
  userId: string,
  sessionId: string,
): Promise<IssuedRefreshToken | null> {
  return withUserLock(db, userId, async (tx) => {
    const [session] = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.userId, userId),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return session ? insertRefreshToken(tx, userId) : null;
  });
}

/** Serialize reset revocation with refresh rotation and session bootstrap. */
export async function revokeUserCredentials(db: Database, userId: string): Promise<void> {
  return withUserLock(db, userId, async (tx) => {
    await tx
      .update(authRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(authRefreshTokens.userId, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(verifications).where(eq(verifications.value, userId));
  });
}

export type RefreshOutcome =
  | { ok: true; userId: string; token: IssuedRefreshToken }
  | { ok: false; reason: 'not_found' | 'revoked' | 'expired' };

/**
 * Xoay refresh token — CLAIM NGUYÊN TỬ + phát hiện reuse:
 *
 * 1. UPDATE ... WHERE token_hash = $hash AND revoked_at IS NULL RETURNING — một
 *    câu lệnh duy nhất vừa kiểm vừa revoke. Hai request đua nhau cùng một token
 *    thì Postgres chỉ cho ĐÚNG MỘT bên claim được (row lock trên UPDATE); bên
 *    thua nhận 0 row. Phiên bản cũ SELECT-rồi-UPDATE có cửa sổ cho cả hai bên
 *    cùng thấy revoked_at IS NULL → một token đẻ hai chuỗi con song song.
 * 2. Claim hụt + token TỒN TẠI nhưng đã revoked = REPLAY (lý do rotation tồn
 *    tại: kẻ trộm token xoay trước, nạn nhân xoay sau — hoặc ngược lại). Phản
 *    ứng đúng theo RFC 6819 §5.2.2.3: thu hồi TOÀN BỘ chuỗi hậu duệ mọc ra từ
 *    token bị replay (walk rotated_from xuôi dòng) — kẻ trộm không giữ được
 *    chuỗi 7 ngày.
 * 3. Hết hạn kiểm SAU claim: token quá hạn giờ cũng đã bị revoke luôn — vô hại
 *    (đằng nào cũng không dùng được nữa) và giữ luồng một-câu-UPDATE.
 */
export async function rotateRefreshToken(db: Database, rawToken: string): Promise<RefreshOutcome> {
  const hash = hashToken(rawToken);
  const [owner] = await db
    .select({ userId: authRefreshTokens.userId })
    .from(authRefreshTokens)
    .where(eq(authRefreshTokens.tokenHash, hash))
    .limit(1);
  if (!owner) return { ok: false, reason: 'not_found' };
  // Claim, successor insertion and replay revocation share one user lock with reset.
  // A transaction around the claim alone would still let reset miss its new child.
  return withUserLock(db, owner.userId, (tx) => rotateLocked(tx, hash));
}

async function rotateLocked(db: DbOrTx, hash: string): Promise<RefreshOutcome> {
  const [claimed] = await db
    .update(authRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(authRefreshTokens.tokenHash, hash), isNull(authRefreshTokens.revokedAt)))
    .returning();

  if (!claimed) {
    const [row] = await db
      .select({ id: authRefreshTokens.id, revokedAt: authRefreshTokens.revokedAt })
      .from(authRefreshTokens)
      .where(eq(authRefreshTokens.tokenHash, hash))
      .limit(1);

    if (!row) {
      return { ok: false, reason: 'not_found' };
    }
    // Token có thật nhưng claim hụt ⇒ đã revoked từ trước ⇒ replay. Giết cả chuỗi.
    await revokeDescendants(db, row.id);
    return { ok: false, reason: 'revoked' };
  }

  if (claimed.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  const token = await insertRefreshToken(db, claimed.userId, claimed.id);
  return { ok: true, userId: claimed.userId, token };
}

/**
 * Thu hồi mọi hậu duệ của một token (con → cháu → ...): dùng khi phát hiện replay.
 *
 * Đi theo QUAN HỆ rotated_from, KHÔNG lọc revoked_at khi duyệt: trong chuỗi
 * A→B→C→D bình thường thì B, C đã revoked sẵn (mỗi lần rotate revoke mắt trước)
 * — duyệt "chỉ mắt chưa revoke" sẽ đứng ngay tầng đầu và mắt SỐNG cuối chuỗi
 * (D — thứ kẻ trộm đang cầm) thoát nạn. `revoked_at IS NULL` chỉ lọc ở lượt
 * GHI, không lọc ở lượt duyệt.
 *
 * ## MỘT câu lệnh, không phải một vòng lặp theo tầng
 *
 * Hàm này chạy TRONG transaction đang giữ `SELECT … FOR UPDATE` trên hàng
 * `users` (xem `withUserLock`), nên mọi thứ nó làm đều là thời gian người dùng
 * khác của cùng tài khoản phải xếp hàng. Bản trước duyệt theo tầng: HAI lượt
 * round-trip cho MỖI thế hệ. Một chuỗi 7 ngày xoay mỗi 15 phút là ~670 thế hệ ⇒
 * ~1340 lượt round-trip dưới khoá — và vì `rotated_from` khi đó chưa có index,
 * mỗi lượt còn là một lượt quét bảng.
 *
 * CTE đệ quy làm đúng phép duyệt ấy bên trong Postgres: một lượt round-trip, dù
 * chuỗi dài bao nhiêu. Đây là cách bó thời gian giữ khoá mà KHÔNG phải bó số
 * thế hệ.
 *
 * ## ⛔ Vì sao KHÔNG khôi phục trần 100 thế hệ
 *
 * Trần cũ (`depth < 100`, bỏ ở e25cc85) là một cái PHANH CHỐNG VÒNG, không phải
 * một cách bó thời gian giữ khoá — và nó sai: mắt SỐNG cuối chuỗi là thứ kẻ
 * trộm đang cầm, nên dừng ở thế hệ 100 để lại đúng token cần giết. Ô nghiệm thu
 * `rule-07-refresh-rotation.test.ts` → 'replay thu hồi token còn sống sau hơn
 * 100 thế hệ rotation' giữ vế đó và sẽ ĐỎ nếu trần quay lại. Vòng thì `UNION`
 * (không phải `UNION ALL`) lo: Postgres loại bỏ dòng trùng với dòng đã sinh ra,
 * nên một vòng tự tắt — đúng vai của `visited` trong bản cũ.
 *
 * Một review độc lập chỉ ra (N7, 2026-09-13).
 */
async function revokeDescendants(db: DbOrTx, rootId: string): Promise<void> {
  // Tên cột lấy từ schema chứ không gõ tay: đổi tên cột thì câu lệnh này đổi
  // theo, thay vì hỏng lúc chạy với một thông báo không nhắc gì tới schema.
  const id = sql.identifier(authRefreshTokens.id.name);
  const rotatedFrom = sql.identifier(authRefreshTokens.rotatedFrom.name);
  const revokedAt = sql.identifier(authRefreshTokens.revokedAt.name);

  // ⚠ `.toISOString()` + ép kiểu tường minh, KHÔNG truyền thẳng `Date`:
  // `db.execute` đi qua `unsafe()` của postgres-js, nơi không có bước suy kiểu
  // tham số như truy vấn dựng bằng tag template — một `Date` ở đó chết với
  // `ERR_INVALID_ARG_TYPE`, và thông báo không hề nhắc tới kiểu tham số. Vẫn là
  // đồng hồ TIẾN TRÌNH như mọi chỗ khác trong file này, không phải `now()` của
  // Postgres: trộn hai đồng hồ trong cùng một bảng là thứ không ai gỡ lại được.
  const revokedNow = new Date().toISOString();

  await db.execute(sql`
    WITH RECURSIVE descendants(${id}) AS (
      SELECT ${id} FROM ${authRefreshTokens} WHERE ${id} = ${rootId}
      UNION
      SELECT child.${id} FROM ${authRefreshTokens} AS child
        JOIN descendants ON child.${rotatedFrom} = descendants.${id}
    )
    UPDATE ${authRefreshTokens}
      SET ${revokedAt} = ${revokedNow}::timestamptz
      WHERE ${id} IN (SELECT ${id} FROM descendants WHERE ${id} <> ${rootId})
        AND ${revokedAt} IS NULL
  `);
}

/** Thu hồi một refresh token (logout). Idempotent — token không tồn tại thì bỏ qua. */
export async function revokeRefreshToken(db: Database, rawToken: string): Promise<void> {
  const hash = hashToken(rawToken);
  const [owner] = await db
    .select({ userId: authRefreshTokens.userId, id: authRefreshTokens.id })
    .from(authRefreshTokens)
    .where(eq(authRefreshTokens.tokenHash, hash))
    .limit(1);
  if (!owner) return;
  await withUserLock(db, owner.userId, async (tx) => {
    await tx
      .update(authRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(authRefreshTokens.tokenHash, hash), isNull(authRefreshTokens.revokedAt)));
    await revokeDescendants(tx, owner.id);
  });
}
