/**
 * Lớp chuyển động dùng chung cho màn hình học.
 *
 * ## Vì sao là hằng số, không phải chuỗi class chép tay ở tám chỗ
 *
 * Cùng một cặp `duration` + `ease` xuất hiện ở StepNav, ProgressBar, khung
 * phiên, bảng kết quả chấm… Chép tay thì một chỗ nào đó sẽ lấy thời lượng khác,
 * và một hệ có ba tốc độ khác nhau cho cùng một hạng tương tác đọc ra là cẩu
 * thả chứ không ai chỉ được ra chỗ sai.
 *
 * Tailwind vẫn quét được: các chuỗi dưới đây là literal trong một file nằm
 * trong `@source` của `globals.css`, nên class được sinh bình thường (bẫy
 * "class chỉ có trong packages/* không vào bundle" đã đo 2026-08-13 — xem đầu
 * `apps/web/src/app/globals.css` — là bẫy về ĐƯỜNG QUÉT, không phải về việc
 * class nằm trong biến hay trong JSX).
 *
 * ## Hai điều KHÔNG có ở đây, cố ý
 *
 * 1. **Không `var(..., fallback)`.** `--motion-fast|base|slow` đã có thật trong
 *    `globals.css` kể từ commit nền `95efe1f` (150ms / 220ms / 320ms). Một
 *    fallback lúc này chỉ là một giá trị thứ hai âm thầm thế chỗ nếu token bị
 *    xoá — tức đúng dạng "silent fallback" mà `development-principles.md` cấm.
 *    Token mất thì chuyển động phải biến mất một cách nhìn thấy được, để có
 *    người đi sửa.
 *
 * 2. **Không `motion-reduce:transition-none`.** `globals.css` đã khai
 *    `@media (prefers-reduced-motion: reduce)` bằng bộ chọn phổ quát +
 *    `transition-duration: 0.01ms !important`, nên nó phủ CẢ tiện ích Tailwind
 *    lẫn `duration-[...]` ở đây. Thêm biến thể `motion-reduce:` từng chỗ là
 *    chép lại một luật đã có, và chép thì sẽ có chỗ quên — mà một chuyển động
 *    lọt lưới `prefers-reduced-motion` KHÔNG tự lộ ra: nó chỉ hại đúng nhóm
 *    người dùng đã tắt hiệu ứng, những người không ngồi cạnh ta lúc review.
 *
 * `--ease-out` trùng đúng tên biến theme của Tailwind v4, nên tiện ích
 * `ease-out` trần đã đọc thẳng token của hệ — không cần viết `var()` tay.
 */

/** Hover, đổi màu nút, đánh dấu bước — phải xong trước khi mắt kịp bám theo. */
export const MOTION_FAST = 'duration-[var(--motion-fast)] ease-out';

/** Đổi trạng thái khoang, hiện/ẩn lớp phủ chờ. */
export const MOTION_BASE = 'duration-[var(--motion-base)] ease-out';

/** Thanh tiến độ — đủ chậm để thấy nó ĐANG tiến, không chỉ đã nhảy. */
export const MOTION_SLOW = 'duration-[var(--motion-slow)] ease-out';
