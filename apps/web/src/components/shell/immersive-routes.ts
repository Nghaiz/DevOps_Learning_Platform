/**
 * Route "immersive" — trang chiếm trọn viewport, vỏ ứng dụng thu về tối thiểu.
 *
 * §12.3 của `phase-14-exec.md`. Game 3D cần toàn bộ chiều cao màn hình; một
 * thanh đầu trang cao 56px cộng thanh cuộn trang làm canvas không bao giờ tràn
 * hết được.
 *
 * ⛔ Cách SAI đã bị loại tường minh: phủ `fixed inset-0 z-50` lên vỏ. Nó để
 * `ShellHeader` nằm nguyên trong DOM phía dưới — nghĩa là link điều hướng vẫn
 * nhận Tab trong khi mắt không thấy chúng, và phải bẫy focus thủ công để chữa.
 * Ẩn đúng thứ cần ẩn thì rẻ hơn, và giữ nguyên hợp đồng "đúng MỘT `<main>`".
 *
 * Hàm thuần, tách khỏi `app-shell.tsx` để test được mà không phải dựng cả vỏ.
 */

/** Tiền tố route chạy ở chế độ immersive. So khớp CHÍNH XÁC hoặc theo đoạn con. */
const IMMERSIVE_PREFIXES: readonly string[] = ['/games/k8s'];

export function isImmersiveRoute(pathname: string | null): boolean {
  if (pathname === null || pathname === '') {
    return false;
  }
  return IMMERSIVE_PREFIXES.some(
    // So theo ĐOẠN, không phải `startsWith` trần: `startsWith('/games/k8s')`
    // cũng khớp một route tương lai tên `/games/k8s-nang-cao`, và trang đó sẽ
    // mất thanh điều hướng mà không ai hiểu vì sao.
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
