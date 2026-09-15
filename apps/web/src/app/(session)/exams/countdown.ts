/**
 * Đếm ngược của màn thi, tách khỏi JSX để ĐO ĐƯỢC.
 *
 * ## ⛔ Đây là toàn bộ nội dung AC-7, và nó nằm ở một dòng
 *
 * *"Đổi giờ hệ thống máy khách lên 2 tiếng ⇒ đếm ngược KHÔNG đổi."*
 *
 * Cách duy nhất giữ được điều đó: máy chủ cấp một KHOẢNG (`remainingMs`), và
 * client trừ dần bằng `performance.now()` , một đồng hồ ĐƠN ĐIỆU không liên
 * quan gì tới giờ hệ thống. Người dùng chỉnh đồng hồ máy, đổi múi giờ, hay máy
 * đồng bộ NTP giữa chừng đều không tham gia vào phép tính nào.
 *
 * ⛔ KHÔNG dùng `deadline - Date.now()`. Nó đúng ở máy có giờ chuẩn và sai im
 * lặng ở mọi máy khác, và "sai im lặng" ở đây nghĩa là một sinh viên thấy còn
 * 20 phút trong khi máy chủ đã đóng bài. Memory dự án đã ghi hai vết đúng hình
 * dạng này: VM ngủ làm vỡ ô nghiệm thu treo theo đồng hồ, và đồng hồ VM lệch
 * ~59 giây so với máy chủ. Lệch NHỎ nguy hơn lệch lớn vì con số vẫn trông hợp
 * lý.
 *
 * `deadline` máy chủ gửi kèm chỉ để HIỆN ("hết hạn lúc 09:00"), không để trừ.
 */

export interface CountdownAnchor {
  /** Khoảng còn lại lúc máy chủ trả lời. */
  readonly remainingMsAtSync: number;
  /** `performance.now()` đọc NGAY khi nhận câu trả lời đó. */
  readonly monotonicAtSync: number;
}

/**
 * Còn lại bao nhiêu, tính từ một mốc neo và một lần đọc đồng hồ đơn điệu.
 *
 * Không bao giờ âm: hết giờ là `0`. Một số âm sẽ vẽ ra `-00:03` trên màn hình
 * và đọc như một lỗi hiển thị, trong khi thứ đang xảy ra là bài đã đóng.
 */
export function remainingFrom(anchor: CountdownAnchor, monotonicNow: number): number {
  const elapsed = monotonicNow - anchor.monotonicAtSync;
  const left = anchor.remainingMsAtSync - elapsed;
  return left > 0 ? left : 0;
}

/**
 * `mm:ss`, hoặc `h:mm:ss` khi còn trên một giờ.
 *
 * Luôn hai chữ số cho phút và giây: một chuỗi đổi ĐỘ DÀI mỗi lần qua mốc 10
 * giây làm cả khối chữ nhảy ngang, và trên một màn hình mà người ta liếc mỗi
 * vài giây thì chuyển động đó là thứ duy nhất mắt bắt được.
 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${String(hours)}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Nhịp cập nhật, mili-giây.
 *
 * 250ms chứ không phải 1000ms: một đồng hồ nhảy đúng mỗi giây sẽ trễ tới gần
 * một giây so với thật ngay sau lần đồng bộ, và ở ba mươi giây cuối thì độ trễ
 * đó là thứ người ta nhìn thấy. Bốn lần mỗi giây rẻ hơn hẳn một lần vẽ lại
 * React trung bình và không ai cảm nhận được về CPU.
 */
export const COUNTDOWN_TICK_MS = 250;

/**
 * Bao lâu thì hỏi lại máy chủ, mili-giây.
 *
 * Đồng hồ đơn điệu của trình duyệt có thể DỪNG khi tab bị treo hoặc máy ngủ,
 * và lúc tỉnh dậy nó tiếp tục từ chỗ dừng , tức đếm ngược sẽ thừa ra đúng
 * khoảng thời gian máy ngủ. Một lượt hỏi lại định kỳ kéo nó về đúng sự thật của
 * máy chủ. Ba mươi giây đủ chặt để sai lệch không kịp thành phút, và đủ thưa để
 * một phòng thi bốn mươi người không thành bốn mươi request mỗi giây.
 */
export const COUNTDOWN_RESYNC_MS = 30_000;
