import { randomBytes, createHash } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import { authRefreshTokens } from '../db/schema';

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

  const token = await issueRefreshToken(db, claimed.userId, claimed.id);
  return { ok: true, userId: claimed.userId, token };
}

/**
 * Thu hồi mọi hậu duệ của một token (con → cháu → ...): dùng khi phát hiện replay.
 *
 * Frontier đi theo QUAN HỆ rotated_from, KHÔNG lọc revoked_at khi duyệt: trong
 * chuỗi A→B→C→D bình thường thì B, C đã revoked sẵn (mỗi lần rotate revoke mắt
 * trước) — duyệt "chỉ mắt chưa revoke" sẽ đứng ngay tầng đầu và mắt SỐNG cuối
 * chuỗi (D — thứ kẻ trộm đang cầm) thoát nạn. Duyệt bằng SELECT id theo tầng,
 * revoke mắt nào còn sống, rồi đi tiếp bằng TOÀN BỘ id con.
 *
 * Lặp theo tầng thay vì CTE đệ quy — chuỗi rotation thực tế ngắn, Drizzle chưa có
 * API recursive CTE gọn; LIMIT 100 tầng làm phanh an toàn chống dữ liệu vòng
 * (không thể xảy ra qua issueRefreshToken, nhưng phanh rẻ hơn niềm tin).
 */
async function revokeDescendants(db: Database, rootId: string): Promise<void> {
  let frontier = [rootId];
  for (let depth = 0; depth < 100 && frontier.length > 0; depth += 1) {
    const children = await db
      .select({ id: authRefreshTokens.id })
      .from(authRefreshTokens)
      .where(inArray(authRefreshTokens.rotatedFrom, frontier));
    if (children.length === 0) {
      return;
    }
    const childIds = children.map((child) => child.id);
    await db
      .update(authRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(inArray(authRefreshTokens.id, childIds), isNull(authRefreshTokens.revokedAt)));
    frontier = childIds;
  }
}

/** Thu hồi một refresh token (logout). Idempotent — token không tồn tại thì bỏ qua. */
export async function revokeRefreshToken(db: Database, rawToken: string): Promise<void> {
  const hash = hashToken(rawToken);
  await db
    .update(authRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(authRefreshTokens.tokenHash, hash), isNull(authRefreshTokens.revokedAt)));
}
