import type { AttemptClock } from './clock';
import { isAttemptClosed } from './clock';

/**
 * Cổng NỘP BÀI TRONG KỲ THI (§18.G, "cổng số 1") — hàm thuần.
 *
 * ## Vì sao nó chỉ gác TRONG một `exam_attempt`, không gác ở mọi lượt nộp
 *
 * Chốt bởi chủ dự án 2026-09-15, phương án (b), và lý do là một phép đo chứ
 * không phải một sở thích. Bản "hiển nhiên" của cổng này — đòi seed bằng một
 * hằng cho bài `seedable: false` — sẽ **từ chối MỌI lượt nộp K8s**:
 * `components/k8s-arena/arena-session.ts` sinh seed NGẪU NHIÊN mỗi phiên
 * (`Math.floor(Math.random() * 2 ** 31)`), nên xác suất qua là 1 trên 2³¹. Đó
 * đúng là thảm hoạ mà `core/problem.ts` § `Submission.seed` mô tả: *"nhìn từ
 * phía người dùng, nó giống hệt một hệ thống từ chối người chơi ngẫu nhiên."*
 *
 * Và seed ấy không phải rác: `classifyObjectives(level, seed)` phân loại mục
 * tiêu theo chính nó, nên ép nó về một hằng là đổi lối chơi chứ không phải
 * siết bảo mật.
 *
 * Ngoài kỳ thi, seed do người nộp mang lên vẫn là hành vi CỐ Ý của hợp đồng.
 * Trong kỳ thi thì máy chủ đã tự cấp seed lúc mở lượt, nên ở đây — và chỉ ở
 * đây — có một con số để SO.
 *
 * ## ⚠ Phạm vi thật của cổng này, nói cho đúng
 *
 * Đo 2026-09-15: `GameProblemPlugin.seedSpec` là tuỳ chọn và **không plugin
 * nào khai nó**. Nghĩa là hôm nay seed KHÔNG đổi `initialState` của bài — nó
 * chỉ đổi dòng ngẫu nhiên của mô phỏng. Nên câu "người nộp tự chọn thế giới
 * đầu" chưa đúng theo nghĩa đen; thứ họ chọn được là **dòng sự cố**, vẫn làm
 * bài dễ đi nhưng là một mối nguy khác và nhỏ hơn. Ghi ra để người đọc sau
 * không đánh giá quá tay tác dụng của cổng này.
 */

export interface ExamSubmissionContext {
  /** Bài trong đề của kỳ thi, theo thứ tự người ra đề xếp. */
  readonly problemCodes: readonly string[];
  /** Seed máy chủ đã cấp cho lượt của chính người này. */
  readonly attemptSeed: number;
  readonly attempt: AttemptClock;
  readonly closesAt: Date | null;
}

export interface ExamSubmissionAttempt {
  readonly problemCode: string;
  /** Seed người nộp gửi lên. */
  readonly seed: number;
}

/**
 * `null` = cho qua. Chuỗi = lý do từ chối, viết cho người học đọc.
 *
 * Trả CÂU chứ không trả mã lỗi vì mỗi ca ở đây cần một câu khác nhau, và ba
 * trong bốn ca là thứ người học phải hiểu ngay để biết mình nên làm gì.
 */
export function examSubmissionRejection(
  context: ExamSubmissionContext,
  submission: ExamSubmissionAttempt,
  now: Date,
): string | null {
  if (!context.problemCodes.includes(submission.problemCode)) {
    return `Bài ${submission.problemCode} không nằm trong đề của kỳ thi này`;
  }

  /*
   * Hết giờ thì từ chối. Đây là vế máy chủ của AC-7: không có tiến trình nền
   * nào "khoá" lượt thi — trạng thái hết giờ suy ra lúc đọc, và đường ghi từ
   * chối dựa trên chính phép suy đó. Nên đóng tab hay mở tab không đổi gì.
   */
  if (isAttemptClosed(context.attempt, context.closesAt, now)) {
    return 'Lượt thi đã kết thúc, bài nộp này không được tính';
  }

  /*
   * ⛔ Cổng seed. So BẰNG với seed máy chủ đã cấp.
   *
   * Không nới thành "seed nào cũng được miễn là hợp lệ": cả điểm của cột
   * `exam_attempts.seed` là để mọi người trong cùng một kỳ thi làm cùng một đề
   * (hoặc, với `per-student`, làm đúng đề đã cấp cho mình). Một lượt nộp mang
   * seed khác là một lượt làm trên một thế giới khác thứ máy chủ giao.
   */
  if (submission.seed !== context.attemptSeed) {
    return 'Bài nộp mang seed khác seed máy chủ đã cấp cho lượt thi này';
  }

  return null;
}
