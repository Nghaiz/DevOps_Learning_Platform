import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getAuth, ACCESS_TOKEN_TTL_SECONDS } from '../../../../server/auth/config';
import { mintAccessTokenFor } from '../../../../server/auth/jwt';
import { issueRefreshToken, rotateRefreshToken } from '../../../../server/auth/tokens';
import { getDb } from '../../../../server/db/client';
import { users } from '../../../../server/db/schema';

/**
 * Refresh access token (luật 6,7 — phase-0.md 0.D task 15).
 *
 * Cookie `refresh_token` (httpOnly, path riêng /api/auth/refresh) TÁCH BIỆT khỏi
 * cookie session của Better Auth và khỏi cookie `access_token`. Không có nó (lần
 * gọi đầu sau login) → bootstrap bằng session Better Auth hiện tại. Có nó → xoay
 * (rotate) qua auth/tokens.ts — token cũ dùng lại sau khi xoay bị từ chối 401
 * (revocation, luật 7). CHỈ đọc cookie `refresh_token`; một access JWT gửi kèm
 * (Authorization header hay nhét nhầm vào cookie khác) không được endpoint này
 * chấp nhận dưới bất kỳ hình thức nào — luật 7 "dùng access token ở endpoint
 * refresh → từ chối".
 */

// postgres + node:crypto cần Node thật — nhất quán với logout/ và [...all]/.
export const runtime = 'nodejs';

const REFRESH_COOKIE = 'refresh_token';
const ACCESS_COOKIE = 'access_token';

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const existingRefresh = request.cookies.get(REFRESH_COOKIE)?.value ?? null;

  let userId: string;
  let role: string;
  let rawRefresh: string;
  let refreshExpiresAt: Date;

  if (existingRefresh === null) {
    // Bootstrap: chưa có refresh token — cần bằng chứng danh tính khác, đây là
    // NƠI DUY NHẤT route này còn phụ thuộc session cookie Better Auth.
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (session === null) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    userId = session.user.id;
    role = (session.user as { role?: string }).role ?? 'user';
    const issued = await issueRefreshToken(db, userId);
    rawRefresh = issued.raw;
    refreshExpiresAt = issued.expiresAt;
  } else {
    const outcome = await rotateRefreshToken(db, existingRefresh);
    if (!outcome.ok) {
      return NextResponse.json({ error: `refresh_${outcome.reason}` }, { status: 401 });
    }
    userId = outcome.userId;
    rawRefresh = outcome.token.raw;
    refreshExpiresAt = outcome.token.expiresAt;

    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!row) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 401 });
    }
    role = row.role;
  }

  const accessToken = await mintAccessTokenFor(userId, role);

  const response = NextResponse.json({ ok: true, accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS });

  response.cookies.set(REFRESH_COOKIE, rawRefresh, {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    // path '/api/auth' (KHÔNG hẹp hơn thành /api/auth/refresh): /api/auth/logout
    // phải ĐỌC được cookie này để revoke (RFC 6265 path-match — path hẹp hơn là
    // logout không bao giờ thấy nó, revocation thành code chết). Vẫn không bao
    // giờ rời phạm vi /api/auth/*, không đi kèm request trang thường.
    path: '/api/auth',
    expires: refreshExpiresAt,
  });

  response.cookies.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  });

  return response;
}
