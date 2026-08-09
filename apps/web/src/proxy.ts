import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { applySecurityHeaders } from './server/security/headers';
import { applyCorsHeaders, applyCorsPreflightHeaders } from './server/security/cors';
import { checkRateLimit } from './server/security/rate-limit';
import { exceedsBodyLimit } from './server/security/body-limit';
import { rateLimitTrustProxy } from './server/env';

const PROTECTED_PATHS = ['/dashboard'];
const AUTH_ONLY_PATHS = ['/login'];

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
    return secured(NextResponse.redirect(new URL('/dashboard', request.url)));
  }
  if (!hasSession && PROTECTED_PATHS.includes(pathname)) {
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
