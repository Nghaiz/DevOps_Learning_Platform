/**
 * Security headers (luật 9 — phase-0.md 0.D task 17).
 *
 * `buildCsp` nhận `nonce` do proxy sinh mỗi request — script-src dùng nonce
 * thay vì `unsafe-inline` (Next tự áp nonce vào script nó chèn khi thấy `headers()`
 * đọc `x-nonce` trong root layout — xem apps/web/src/app/layout.tsx).
 */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'", // Tailwind/Next inject style tag lúc build, chưa nonce hoá ở P0.
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    // D8 (phase-13) — iframe IDE (`src="/ide/session/{id}/"`) là CÙNG ORIGIN;
    // `default-src 'self'` đã phủ nó, nhưng khai TƯỜNG MINH để ai đọc CSP cũng
    // thấy đây là quyết định có chủ ý, không phải một khoảng trống rơi về mặc
    // định. `csp.spec.ts` (13.H) phải chứng minh một iframe origin KHÁC bị chặn.
    "frame-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function applySecurityHeaders(headers: Headers, nonce: string): void {
  headers.set('Content-Security-Policy', buildCsp(nonce));
  // preload cần domain đăng ký ở hstspreload.org — max-age dài là điều kiện cần,
  // chưa submit preload list nên không tự ý claim preload xong ở P0.
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}
