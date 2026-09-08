import type { StatusToken } from './scene-tokens';

/**
 * Trạng thái pha bao nhiêu vào MÀU THÂN của tài nguyên.
 *
 * `0` = giữ nguyên sắc của LOẠI, `1` = thay hẳn bằng màu trạng thái.
 *
 * ## Vì sao là một bảng, không phải mấy câu `if`
 *
 * Bản trước có đúng hai nhánh trong `cluster-instances.tsx`:
 *
 * ```ts
 * if (entry.failing) COLOR.lerp(colors.glow[entry.token], 0.6);
 * if (entry.terminating) COLOR.lerp(colors.platform, 0.6);
 * ```
 *
 * Ba hệ quả đo được ở `/games/k8s`:
 *
 * 1. **`Pending` không đổi màu thân một chút nào.** `failing` chỉ đúng cho
 *    `destructive`/`warning`, nên một pod đang chờ xếp lịch trông y hệt một pod
 *    đang chạy khoẻ — dấu hiệu duy nhất là cái vòng nhỏ dưới chân, thứ bị chính
 *    thân vật che ở mọi góc nhìn từ trên xuống.
 * 2. **`Failed` và `warning` pha cùng một lượng** (0.6), nên một cảnh báo nhẹ
 *    kêu to ngang một pod đã chết.
 * 3. Không có chỗ nào để đọc ra thang độ ưu tiên — nó nằm rải trong hai dòng `if`.
 *
 * Bảng này đặt thang đó thành dữ liệu: càng khẩn cấp, sắc của loại càng nhường
 * chỗ cho sắc của trạng thái. Pod chạy khoẻ giữ nguyên màu loại (nhận dạng là
 * thứ quan trọng nhất khi mọi thứ đang ổn); pod chết thì gần như đỏ hẳn.
 *
 * `satisfies Record<StatusToken, number>` là cổng lúc biên dịch: engine thêm một
 * `statusToken` mới mà quên bảng này ⇒ đỏ ở typecheck, không phải đỏ ở mắt người dùng.
 */
export const STATUS_TINT = {
  /** Khoẻ: nhận dạng của loại là thứ đáng thấy, không phải trạng thái. */
  success: 0,
  /** Đang tiến triển (Pending, Progressing, rollout dở) — thấy rõ mà không báo động. */
  'status-progress': 0.48,
  warning: 0.62,
  /** Failed / CrashLoopBackOff: gần như thay hẳn màu. Đây là thứ phải nhìn thấy trước tiên. */
  destructive: 0.8,
  /** Bị khoá / chưa mở: rút hết sức sống, nhưng vẫn còn nhận ra loại. */
  'status-locked': 0.45,
} as const satisfies Record<StatusToken, number>;

/** Mức pha xám khi vật đang bị xoá. Áp SAU tint trạng thái. */
export const TERMINATING_FADE = 0.62;
