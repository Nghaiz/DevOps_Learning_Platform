/**
 * Security headers (luật 9 — phase-0.md 0.D task 17).
 *
 * `buildCsp` nhận `nonce` do proxy sinh mỗi request — script-src dùng nonce
 * thay vì `unsafe-inline` (Next tự áp nonce vào script nó chèn khi thấy `headers()`
 * đọc `x-nonce` trong root layout — xem apps/web/src/app/layout.tsx).
 */
export function buildCsp(nonce: string, requestUrl?: URL): string {
  // Local production previews use HTTP. Upgrading a protected-route redirect
  // would send the browser to an HTTPS port that does not exist. Keep the
  // directive everywhere else, including HTTPS loopback and the default API.
  const isHttpLoopback =
    requestUrl?.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(requestUrl.hostname);
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    /*
     * ⚠ NỢ KỸ THUẬT ĐÃ BIẾT — 'unsafe-inline' còn ở đây, và S3 (P13) đã soi lại
     * chứ không bỏ qua. Nó là vế thứ hai của chuỗi tấn công mà S3 cắt vế thứ
     * nhất: với 'unsafe-inline', một lỗ chèn HTML KHÔNG CẦN script vẫn nhét được
     * <style> để dò dữ liệu qua CSS attribute selector + background:url. Bỏ được
     * nó thì lớp phòng thủ dày hẳn lên.
     *
     * VÌ SAO CHƯA BỎ ĐƯỢC — hai chỗ dùng style ATTRIBUTE với giá trị tính lúc
     * chạy, không chuyển sang class Tailwind được:
     *   - packages/ui/src/lesson/progress-bar.tsx:34  → style={{ width: `${percent}%` }}
     *   - packages/ui/src/lesson/split-pane.tsx:171   → style={{ flexBasis: `${percent}%`, … }}
     * `style-src 'unsafe-inline'` chi phối CẢ <style> lẫn thuộc tính style="",
     * và một thuộc tính style KHÔNG BAO GIỜ nonce hoá được. Bỏ thẳng ⇒ thanh
     * tiến độ bài học về 0% và khung chia đôi của lab sập layout.
     *
     * ĐƯỜNG ĐI TIẾP (chưa làm, cần đo trước): tách `style-src-attr 'unsafe-inline'`
     * (giữ đúng cho hai chỗ trên) khỏi `style-src-elem 'self' 'nonce-…'` (siết
     * <style>). Vế sau phụ thuộc việc Next/React có gắn nonce vào MỌI style tag
     * chúng tự chèn hay không — chưa kiểm chứng được ở lane này (không có build
     * để đo), và một CSP siết nhầm làm trắng trang. Phải xác nhận trên HTML THẬT
     * (`e2e/csp.spec.ts`) trước khi đổi, đừng đổi rồi hi vọng.
     */
    "style-src 'self' 'unsafe-inline'",
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
    ...(isHttpLoopback ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

export function applySecurityHeaders(headers: Headers, nonce: string, requestUrl?: URL): void {
  headers.set('Content-Security-Policy', buildCsp(nonce, requestUrl));
  // preload cần domain đăng ký ở hstspreload.org — max-age dài là điều kiện cần,
  // chưa submit preload list nên không tự ý claim preload xong ở P0.
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}
