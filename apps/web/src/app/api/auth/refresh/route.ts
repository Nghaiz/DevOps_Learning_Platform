import { NextResponse, type NextRequest } from 'next/server';
import { getAuth } from '../../../../server/auth/config';
import { issueRefreshTokenForSession, rotateRefreshToken } from '../../../../server/auth/tokens';
import { getDb } from '../../../../server/db/client';

/**
 * Xoay refresh token (luật 6,7 — phase-0.md 0.D task 15).
 *
 * Cookie `refresh_token` (httpOnly, path /api/auth) TÁCH BIỆT khỏi cookie session
 * của Better Auth. Không có nó (lần gọi đầu sau login) → bootstrap bằng session
 * Better Auth hiện tại. Có nó → xoay qua auth/tokens.ts; token cũ dùng lại sau
 * khi xoay bị từ chối 401 và thu hồi cả chuỗi hậu duệ (luật 7). CHỈ đọc cookie
 * `refresh_token`; một access JWT gửi kèm (Authorization header hay nhét nhầm
 * vào cookie khác) không được endpoint này chấp nhận dưới bất kỳ hình thức nào.
 *
 * KHÔNG phát access token ra trình duyệt — và đây là điểm quan trọng nhất của
 * file. Access JWT có `aud=orchestrator`: nó là credential server-to-server giữa
 * BFF và orchestrator, không phải thứ client cầm. `trpc/routers/session.ts` mint
 * nó tại chỗ, ngay trước mỗi lần gọi gRPC, rồi vứt. Bản trước còn set thêm cookie
 * `access_token` cho trình duyệt — không consumer nào đọc, nên nó là bearer
 * credential nằm không trên máy user với TTL 15 phút và zero lợi ích. Token
 * `aud=gateway` mà P1 cần là token KHÁC: buộc theo một sessionId cụ thể, đời
 * bằng đời session, do session.create phát — không phải cookie ambient này.
 */

// postgres + node:crypto cần Node thật — nhất quán với logout/ và [...all]/.
export const runtime = 'nodejs';

const REFRESH_COOKIE = 'refresh_token';

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const existingRefresh = request.cookies.get(REFRESH_COOKIE)?.value ?? null;

  let rawRefresh: string;
  let refreshExpiresAt: Date;

  if (existingRefresh === null) {
    // Bootstrap: chưa có refresh token — cần bằng chứng danh tính khác, đây là
    // NƠI DUY NHẤT route này còn phụ thuộc session cookie Better Auth.
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (session === null) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    const issued = await issueRefreshTokenForSession(db, session.user.id, session.session.id);
    if (issued === null) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    rawRefresh = issued.raw;
    refreshExpiresAt = issued.expiresAt;
  } else {
    const outcome = await rotateRefreshToken(db, existingRefresh);
    if (!outcome.ok) {
      return NextResponse.json({ error: `refresh_${outcome.reason}` }, { status: 401 });
    }
    rawRefresh = outcome.token.raw;
    refreshExpiresAt = outcome.token.expiresAt;
  }

  // Chỉ trả hạn của refresh cookie. KHÔNG trả access token dưới bất kỳ hình thức
  // nào (body cũng như cookie) — xem ghi chú đầu file.
  const response = NextResponse.json({
    ok: true,
    refreshExpiresAt: refreshExpiresAt.toISOString(),
  });

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

  return response;
}
