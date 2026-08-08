import { NextResponse, type NextRequest } from 'next/server';
import { getAuth } from '../../../../server/auth/config';
import { revokeRefreshToken } from '../../../../server/auth/tokens';
import { getDb } from '../../../../server/db/client';

// `postgres` (client Postgres, node:crypto qua tokens.ts) cần Node thật — không
// chạy được trên Edge runtime. Khai báo tường minh thay vì tin default của Next.
export const runtime = 'nodejs';

const REFRESH_COOKIE = 'refresh_token';
const ACCESS_COOKIE = 'access_token';

/**
 * Logout đầy đủ: thu hồi refresh token (nếu trình duyệt gửi — cookie path
 * '/api/auth' nên endpoint này NHẬN được nó), signOut session Better Auth, và
 * xoá cả 3 loại cookie.
 *
 * `asResponse: true` là mấu chốt: signOut của Better Auth xoá session cookie
 * bằng header Set-Cookie trên RESPONSE CỦA NÓ — gọi kiểu thường rồi tự dựng
 * NextResponse là vứt header đó đi, cookie session sống tiếp 7 ngày và middleware
 * (chỉ kiểm SỰ TỒN TẠI cookie) sẽ đá /login ↔ /dashboard thành vòng lặp redirect.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const existingRefresh = request.cookies.get(REFRESH_COOKIE)?.value ?? null;
  if (existingRefresh !== null) {
    await revokeRefreshToken(getDb(), existingRefresh);
  }

  // Session có thể đã hết hạn/không tồn tại — signOut lỗi vẫn phải dọn cookie
  // phía client, không để lỗi chặn logout. asResponse ⇒ lỗi trả response thường
  // (400) thay vì throw; catch giữ lại làm lưới an toàn cho lỗi vận chuyển.
  const authResponse = await getAuth()
    .api.signOut({ headers: request.headers, asResponse: true })
    .catch(() => null);

  const response = NextResponse.json({ ok: true });

  // delete() phải khớp path lúc set (RFC 6265): refresh cookie sống ở /api/auth,
  // delete mặc định path=/ sẽ KHÔNG trúng nó.
  response.cookies.delete({ name: REFRESH_COOKIE, path: '/api/auth' });
  response.cookies.delete(ACCESS_COOKIE);

  // Chuyển TOÀN BỘ Set-Cookie của Better Auth (xoá session token + cookie phụ)
  // sang response thật. PHẢI append SAU các cookies.delete() ở trên: API
  // ResponseCookies của Next serialize lại header set-cookie từ map nội bộ ở
  // mỗi lần gọi — append thô đứng TRƯỚC sẽ bị lần serialize đó nuốt mất (đã
  // dính thật: session cookie không được clear, logout thành vòng lặp redirect).
  const authSetCookies = authResponse?.headers.getSetCookie() ?? [];
  for (const setCookie of authSetCookies) {
    response.headers.append('set-cookie', setCookie);
  }
  if (authSetCookies.length === 0) {
    // signOut không trả Set-Cookie (session đã hết hạn từ trước / lỗi vận
    // chuyển) — vẫn phải đảm bảo cookie session biến mất khỏi trình duyệt,
    // không thì middleware (kiểm SỰ TỒN TẠI cookie) đá /login về /dashboard
    // vĩnh viễn. Tên cookie theo convention Better Auth: prefix __Secure- khi
    // chạy https (production). Bản __Secure- PHẢI set kèm secure:true — spec
    // cookie prefix bắt browser VỨT mọi Set-Cookie __Secure-* thiếu Secure,
    // tức delete() trần sẽ no-op im lặng đúng trên môi trường cần nó nhất.
    response.cookies.delete('better-auth.session_token');
    response.cookies.set('__Secure-better-auth.session_token', '', {
      maxAge: 0,
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
    });
  }
  return response;
}
