/**
 * D8 — cổng quyết định "trang bài học có khoang IDE hay không".
 *
 * ⚠ Phép so sánh dưới đây phải TRÙNG BYTE với phép so ở server:
 * `apps/web/src/server/lessons/catalog.ts` →
 * `return interfaceLayout === 'ide' ? 'ide' : '';`
 *
 * Đó là chỗ chọn `profile` gửi cho orchestrator, tức chỗ quyết định pod CÓ chạy
 * Theia hay không. Hai bên lệch nhau một khoảng trắng hay một chữ hoa là hai
 * lỗi im lặng đối xứng: FE nới tay ⇒ iframe trỏ vào một pod không có IDE (trắng
 * mãi mãi); FE chặt tay ⇒ pod chạy IDE mà không ai mở được. Nên ở đây KHÔNG
 * trim, KHÔNG lowercase — bất kỳ "khoan dung" nào cũng là một lệch mới.
 */
export const IDE_LAYOUT = 'ide';

export function shouldShowIdePane(interfaceLayout: string | null | undefined): boolean {
  return interfaceLayout === IDE_LAYOUT;
}

/**
 * URL của IDE trong iframe. CÙNG ORIGIN có chủ ý (D8): cookie `dlp_sandbox`
 * được phát thêm một bản `Path=/ide`, và cookie phân biệt theo (name, path) nên
 * token vẫn KHÔNG đi tới `/` hay `/api`. CSP khai `frame-src 'self'`.
 */
export function ideSessionUrl(sessionId: string): string {
  return `/ide/session/${encodeURIComponent(sessionId)}/`;
}

/**
 * Hạn chờ IDE báo `load` trước khi hiện màn hình thất bại.
 *
 * 45s, không phải 20s: khởi động nguội Theia đo được ~20s ở P6, nên một hạn
 * 20-30s sẽ báo động giả trên đúng lượt mở bình thường. Và không phải 90s: quá
 * đó thì người học đã bỏ đi.
 *
 * ⚠ `load` của iframe KHÔNG chứng minh IDE chạy — một trang 404 của Traefik
 * cũng bắn `load`. `/ide` chưa từng đi qua Traefik trong repo này (mọi phép đo
 * P6 dùng `port-forward`), nên màn hình sau khi `load` vẫn phải để lại đường
 * thoát (mở tab mới, tải lại) thay vì khẳng định "xong".
 */
export const IDE_BOOT_TIMEOUT_MS = 45_000;
