/**
 * Hợp đồng điểm ngắt của vỏ ứng dụng (plan 13.B mục 8 + C6).
 *
 * Ba con số, ba ý nghĩa khác nhau — đừng gộp:
 *
 * | Hằng | Nghĩa |
 * |---|---|
 * | `DESKTOP_TARGET_MIN_PX` | Mục tiêu chính. Bố cục đầy đủ được thiết kế cho mức này. |
 * | `NAV_COLLAPSE_MAX_PX`   | ≤ mức này thì điều hướng chính thu vào ngăn kéo. |
 * | `TERMINAL_MIN_WIDTH_PX` | < mức này thì KHÔNG mở terminal — hiện `NarrowScreenNotice` thay thế. |
 *
 * ⚠ `NAV_COLLAPSE_MAX_PX` (768) và `TERMINAL_MIN_WIDTH_PX` (1024) **cố ý khác
 * nhau**: khoảng 769–1023px vẫn có nav ngang đầy đủ nhưng vẫn quá hẹp cho một
 * terminal 80 cột cạnh nội dung. Gộp về một số sẽ hoặc là thu nav quá sớm, hoặc
 * là mở terminal vào một khung không đọc nổi.
 *
 * Lớp Tailwind tương ứng dùng biến thể tuỳ ý (`min-[769px]:`, `max-[768px]:`)
 * chứ KHÔNG dùng `md:`: `md:` là `min-width: 768px`, tức ở đúng 768px nav vẫn
 * mở — lệch một pixel so với câu "≤768px thu vào ngăn kéo" của hợp đồng.
 */

export const DESKTOP_TARGET_MIN_PX = 1280;
export const NAV_COLLAPSE_MAX_PX = 768;
export const TERMINAL_MIN_WIDTH_PX = 1024;

/** Khung hiện tại có đủ rộng để mở terminal không. */
export function meetsTerminalWidth(viewportWidthPx: number): boolean {
  return viewportWidthPx >= TERMINAL_MIN_WIDTH_PX;
}
