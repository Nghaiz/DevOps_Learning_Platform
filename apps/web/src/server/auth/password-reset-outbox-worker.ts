import { deliverQueuedPasswordResetMail } from './password-reset-mail';
import { PASSWORD_RESET_OUTBOX_BATCH } from './password-reset-outbox';

/**
 * Lượt quét ĐỊNH KỲ cho hàng đợi thư đặt lại mật khẩu.
 *
 * Đường gửi bình thường là `after()` ngay trong request đã nhận việc — nhanh, và
 * độ trễ y như trước khi có hàng đợi. Lượt quét này tồn tại cho đúng một tình
 * huống mà `after()` không với tới được: tiến trình nhận việc đã CHẾT trước khi
 * gửi xong. Dòng của nó nằm lại trong DB và không request nào của nó sẽ chạy nữa;
 * chỉ một tiến trình khác quét lên mới thấy.
 *
 * ⚠ GIỚI HẠN 1, ghi thẳng ra chứ không gọi đây là "đảm bảo gửi": nếu MỌI replica
 * web đều chết thì không còn ai quét. Dòng vẫn nằm nguyên trong DB và được gửi
 * khi có replica sống lại — không mất, nhưng cũng không có mốc thời gian nào được
 * hứa hẹn. Việc chạy quét ở mọi replica là an toàn: `SKIP LOCKED` trong
 * `drainPasswordResetOutbox` lo phần không gửi trùng.
 *
 * ⚠ GIỚI HẠN 2, ĐO ĐƯỢC chứ không suy ra: `register()` của Next KHÔNG chạy lúc
 * tiến trình khởi động — nó chạy ở REQUEST ĐẦU TIÊN. Nên một replica chưa phục
 * vụ request nào thì chưa hề bắt đầu đếm chu kỳ, và đồng hồ 60 giây dưới đây
 * tính từ lượt truy cập đầu chứ không từ lúc pod Ready.
 *
 * Phép đo, 2026-09-13, build `sm_yNBJEbf9NkB1GRCWkF`: nhét một dòng có
 * `expires_at` trong quá khứ rồi `next start` trên một cổng riêng. Sau 87 giây
 * KHÔNG có request nào, dòng vẫn còn và không có dòng log nào. Gửi đúng một
 * `GET /login` thì log `sweep: sent=0 failed=0 expired=1` hiện ngay và dòng
 * biến mất. Nếu `register()` chạy lúc boot thì nhịp 60 giây đã dọn nó ở mốc 60.
 *
 * Hệ quả thực tế nhỏ (replica web nào cũng nhận traffic), nhưng nó bác bỏ cách
 * đọc "cứ có tiến trình sống là có người quét" — và đó là cách đọc mà một người
 * đang truy một thư chưa tới sẽ dùng.
 */
export const PASSWORD_RESET_OUTBOX_SWEEP_MS = 60_000;

let timer: NodeJS.Timeout | null = null;
let inFlight = false;

/** Khởi động lượt quét. Gọi nhiều lần không tạo thêm timer; trả về hàm dừng. */
export function startPasswordResetOutboxWorker(
  intervalMs: number = PASSWORD_RESET_OUTBOX_SWEEP_MS,
): () => void {
  if (timer === null) {
    timer = setInterval(() => void sweep(), intervalMs);
    // Timer này KHÔNG được giữ tiến trình sống: một lệnh chạy-rồi-thoát import
    // nhầm vào đây sẽ treo mãi mãi, và `next build` là một lệnh như vậy.
    timer.unref();
  }
  return stopPasswordResetOutboxWorker;
}

export function stopPasswordResetOutboxWorker(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Một lượt quét KHÔNG BAO GIỜ được ném ra ngoài: nó chạy trên timer, không có ai
 * `await` nó, nên một promise bị từ chối ở đây là một tiến trình bị hạ.
 */
async function sweep(): Promise<void> {
  // Lượt trước còn đang chạy (SMTP chậm) thì bỏ lượt này. Chồng lượt không sai —
  // SKIP LOCKED chặn gửi trùng — nhưng chỉ tốn thêm kết nối DB.
  if (inFlight) return;
  inFlight = true;
  try {
    // Lô ĐẦY ĐỦ ở đây, khác đường `after()`: lượt quét chạy trên timer, không
    // nằm trên đường của request nào, và chốt `inFlight` ở trên đã chặn chồng
    // lượt. Đây là chỗ duy nhất bù được tồn đọng — xem
    // `PASSWORD_RESET_REQUEST_BATCH`.
    const result = await deliverQueuedPasswordResetMail(PASSWORD_RESET_OUTBOX_BATCH);
    if (result.sent + result.failed + result.expired > 0) {
      // Chỉ ĐẾM, không có địa chỉ lẫn mã. Mức `warn` chứ không phải thông tin
      // thường: đường bình thường là `after()` gửi ngay trong request, nên một
      // lượt quét làm được việc nghĩa là có tiến trình đã chết giữa chừng (hoặc
      // SMTP đang hỏng) — đúng thứ vận hành cần thấy.
      console.warn(
        `[auth] Password reset outbox sweep: sent=${result.sent} failed=${result.failed} expired=${result.expired}`,
      );
    }
  } catch (error) {
    // Chỉ ghi TÊN lỗi: thông điệp của lỗi tầng DB có thể mang theo chuỗi kết nối,
    // và một dòng log thì đi xa hơn nhiều so với một biến môi trường. Bề mặt chẩn
    // đoán thật nằm ở `last_error` + `attempts` trong chính bảng outbox.
    console.error(
      `[auth] Password reset outbox sweep failed: ${error instanceof Error ? error.name : 'unknown'}`,
    );
  } finally {
    inFlight = false;
  }
}
