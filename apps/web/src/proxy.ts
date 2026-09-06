import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { applySecurityHeaders } from './server/security/headers';
import { applyCorsHeaders, applyCorsPreflightHeaders } from './server/security/cors';
import { checkRateLimit } from './server/security/rate-limit';
import { exceedsBodyLimit } from './server/security/body-limit';
import { rateLimitTrustProxy } from './server/env';

// `/labs` + `/playgrounds` thêm ở P8. Mỗi trang dưới hai nhánh đó ĐÃ tự gọi
// `getAuth().api.getSession()` rồi `redirect('/login')`, nên thiếu chúng ở đây
// không phải một lỗ hổng — nhưng để chúng ngoài danh sách thì lớp phòng thủ
// sớm (chuyển hướng ngay khi vắng cookie) chỉ áp cho `/lessons` mà không áp cho
// hai nhánh cùng loại, và sự bất đối xứng đó là thứ người sau sẽ đọc nhầm
// thành "hai nhánh này cố ý công khai".
// 13.B/C6 thêm `/paths /quiz /me /settings /author /admin`. `/dashboard` và
// `/session` ở lại dù nay chỉ còn là redirect 308 sang `/me` (D12): bỏ chúng ra
// thì một khách chưa đăng nhập gõ `/dashboard` sẽ đi qua 308 rồi mới bị `/me`
// đẩy về `/login` — hai lượt điều hướng, và lượt đầu tiết lộ rằng đường đó tồn
// tại. Giữ lại là chặn ngay từ lượt đầu.
//
// ⛔ **Vai trò KHÔNG gác ở đây.** `/author` và `/admin` nằm trong danh sách này
// chỉ để chặn khách vãng lai; phân biệt user/author/admin là việc của
// `layout.tsx` phía server của chính hai nhánh đó (`getSession` + role →
// `redirect('/me')`, hợp đồng C6). Lý do: proxy chạy trên MỌI request và cố ý
// KHÔNG đụng DB (xem chú thích ở đoạn session-gate bên dưới), mà vai trò thì
// chỉ có ở DB — kiểm vai trò tại đây sẽ hoặc là phải đọc DB mỗi request, hoặc
// là phải tin một giá trị nằm trong cookie do client giữ.
const PROTECTED_PATHS = [
  '/dashboard',
  '/session',
  '/lessons',
  '/labs',
  '/playgrounds',
  '/paths',
  '/quiz',
  '/me',
  '/settings',
  '/author',
  '/admin',
];
const AUTH_ONLY_PATHS = ['/login'];

/**
 * Nơi đưa người đã đăng nhập tới khi họ mở `/login`.
 *
 * D12 gộp `/dashboard` vào `/me`. Trỏ thẳng `/me` chứ không để `/dashboard` tự
 * 308 tiếp: một chuỗi hai lần chuyển hướng cho mỗi lần mở nhầm trang đăng nhập,
 * và cái đích thật thì không đọc được từ đoạn mã này.
 */
const SIGNED_IN_HOME = '/me';

/**
 * Khớp chính đường đó HOẶC đường con của nó.
 *
 * `PROTECTED_PATHS.includes(pathname)` (bản cũ) là khớp CHÍNH XÁC, và nó đủ
 * đúng chừng nào mọi trang được gác đều không có đường con — `/dashboard` và
 * `/session` đều vậy. `/lessons/<id>` phá vỡ giả định đó: `includes` trả false,
 * nên trang chi tiết bài học sẽ KHÔNG được gác trong khi trang danh sách thì
 * có. Một lỗ authz mở ra bởi việc thêm một route, không bởi việc sửa dòng nào.
 *
 * Nối `/` trước khi so tiền tố là phần bắt buộc: `startsWith('/lessons')` trần
 * sẽ nuốt cả `/lessons-public` hay `/lessonsfoo` — gác nhầm thứ không định gác.
 */
export function matchesProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// Cảnh báo skip-rate-limit chỉ log MỘT lần mỗi process — không spam mỗi request,
// nhưng cũng không im lặng (development-principles: fallback phải có tín hiệu).
let warnedNoClientKey = false;

/**
 * Khoá định danh client cho rate limit. `null` = không định danh được → SKIP
 * limit (log 1 lần), KHÔNG BAO GIỜ gộp về một bucket chung.
 *
 * - Tin `x-forwarded-for` CHỈ khi RATE_LIMIT_TRUST_PROXY=1 (sau Traefik ở P3).
 *   XFF là header client tự đặt được: tin bừa thì attacker xoay giá trị mỗi
 *   request là né limit; còn bucket chung 'unknown' thì NGƯỢC LẠI — một client
 *   spam 120 request khoá TẤT CẢ user còn lại (self-DoS). Cả hai đều tệ hơn skip.
 * - Node runtime (proxy.ts, Next 16): server Next TỰ ĐẶT x-forwarded-for = IP
 *   socket peer khi client KHÔNG gửi header này, nhưng client gửi sẵn XFF thì
 *   giá trị đó đi qua NGUYÊN VẸN (đo thật 2026-08-09: curl thường → "::1", curl
 *   -H "x-forwarded-for: 6.6.6.6" → "6.6.6.6"). Tức là vẫn giả mạo được — điều
 *   kiện TRUST_PROXY giữ nguyên; nguồn IP chỉ đáng tin khi Traefik (P3) strip/
 *   ghi đè XFF ở biên. Ghi nhận tại plans/devops-learning-platform/phase-3.md.
 */
function clientKey(request: NextRequest): string | null {
  if (!rateLimitTrustProxy()) {
    return null;
  }
  const forwardedFor = request.headers.get('x-forwarded-for');
  const nearest = forwardedFor?.split(',')[0]?.trim();
  return nearest !== undefined && nearest !== '' ? nearest : null;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get('origin');

  // Luật 9: nonce sinh TRƯỚC mọi early-return để 413/429/preflight/redirect cũng
  // mang đủ security header — response attacker nhìn thấy nhiều nhất chính là
  // mấy response bị chặn này.
  const nonce = btoa(crypto.randomUUID());

  function secured(response: NextResponse): NextResponse {
    applySecurityHeaders(response.headers, nonce);
    applyCorsHeaders(response.headers, origin);
    return response;
  }

  // Luật 5: body cap trước mọi thứ khác — request quá khổ thì chặn ngay, khỏi tốn
  // rate-limit slot hay redirect logic cho một request sẽ bị từ chối.
  if (exceedsBodyLimit(request.headers.get('content-length'))) {
    return secured(
      new NextResponse(JSON.stringify({ error: 'payload_too_large' }), {
        status: 413,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }

  // Luật 5: rate limit theo IP — chỉ khi có nguồn IP đáng tin (xem clientKey).
  const key = clientKey(request);
  if (key === null) {
    if (!warnedNoClientKey) {
      warnedNoClientKey = true;
      console.warn(
        '[rate-limit] SKIP: không có nguồn IP đáng tin (RATE_LIMIT_TRUST_PROXY chưa bật). Giới hạn thật đến ở Traefik (P3).',
      );
    }
  } else if (!checkRateLimit(key)) {
    return secured(
      new NextResponse(JSON.stringify({ error: 'too_many_requests' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }

  // Luật 2: CORS preflight cho API — trả sớm, kèm Allow-Methods/Headers (thiếu là
  // preflight fail dù origin được phép).
  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    const preflight = new NextResponse(null, { status: 204 });
    applySecurityHeaders(preflight.headers, nonce);
    applyCorsPreflightHeaders(
      preflight.headers,
      origin,
      request.headers.get('access-control-request-headers'),
    );
    return preflight;
  }

  // Luật 8/session-gate: chỉ kiểm SỰ TỒN TẠI của cookie session ở proxy (không
  // đụng DB — proxy chạy trên MỌI request nên phải rẻ) — page/layout tự kiểm
  // session thật qua auth.api.getSession làm phòng thủ lớp hai (dashboard/page.tsx).
  const hasSession = getSessionCookie(request) !== null;
  if (hasSession && AUTH_ONLY_PATHS.includes(pathname)) {
    return secured(NextResponse.redirect(new URL(SIGNED_IN_HOME, request.url)));
  }
  if (!hasSession && matchesProtected(pathname)) {
    return secured(NextResponse.redirect(new URL('/login', request.url)));
  }

  // Luật 9: CSP nonce theo request, gắn vào cả header request (root layout đọc lại
  // qua headers()) lẫn header response.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return secured(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
