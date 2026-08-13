/**
 * Nhãn + số đo của thanh tiến độ bài học.
 *
 * ## Vì sao là một module riêng, không phải một template string trong JSX
 *
 * Nợ P2 §2. Nhãn cũ luôn là `"X/N bước đã đạt"`, và ở nhánh `completed` nó đặt
 * X = N từ ĐÚNG MỘT lượt chấm: server ghi `completedAt` khi step CUỐI đạt
 * (`min(index+1, last)` — task 12), nên nhảy thẳng tới step cuối rồi bấm "Kiểm
 * tra" một lần cho ra `"4/4 bước đã đạt"` trong khi đúng một bước từng được
 * chấm. Con số không sai với thứ nó đo (bài ĐÃ xong); cái sai là câu chữ —
 * nó khẳng định một TẬP bước đã đạt, thứ mà ta không lưu ở đâu cả.
 *
 * Đây là lỗi của NHÃN, không phải của lưu trữ, nên chỗ sửa là câu chữ. Lưu
 * hẳn tập bước đã đạt là một lựa chọn khác và nó cần đổi schema — thuộc về
 * chặng có UI tiến độ thật, không phải một bản vá nhãn.
 *
 * Tách thành hàm thuần để phép kiểm bám được vào nó: một chuỗi nội suy nằm
 * giữa JSX chỉ kiểm được bằng cách render cả trang, và khi đó ca "đạt mỗi bước
 * cuối" — đúng ca đẻ ra nợ này — là ca không ai viết.
 */

export interface ProgressSummary {
  /** Giá trị cho `ProgressBar.value`. */
  readonly value: number;
  /** Giá trị cho `ProgressBar.max`. */
  readonly max: number;
  /** Câu chữ hiện cho người học. */
  readonly label: string;
}

export interface ProgressInput {
  /** Tổng số step của scenario. */
  readonly stepCount: number;
  /**
   * Số step ĐÃ CHẤM ĐẠT trong phiên làm việc này.
   *
   * Chỉ sống ở state client (`passedSteps`), nên nó KHÔNG phải "từ trước tới
   * giờ" — mở lại bài là về 0. Nhãn phải nói ra phạm vi đó thay vì để người
   * học tự đoán, nếu không một bài đang dở sẽ hiện "0/4" và đọc như thể mọi
   * lượt chấm đạt trước đó đã mất.
   */
  readonly passedInSession: number;
  /** `progress.status === 'completed'` — server đã ghi `completedAt`. */
  readonly completed: boolean;
}

export function summarizeProgress(input: ProgressInput): ProgressSummary {
  const { stepCount, passedInSession, completed } = input;

  // Bài đã xong: thanh đầy, và nhãn nói ĐÚNG thứ ta biết — "xong bài" — chứ
  // không phải "đã đạt N bước", điều ta không có dữ liệu để khẳng định.
  if (completed) {
    return { value: stepCount, max: stepCount, label: 'Đã hoàn thành' };
  }

  return {
    value: passedInSession,
    max: stepCount,
    label: `${String(passedInSession)}/${String(stepCount)} bước đã đạt trong phiên này`,
  };
}
