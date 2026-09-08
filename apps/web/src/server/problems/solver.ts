import type {
  Problem,
  ProblemForSolver,
  ProblemHint,
  ProblemHintTeaser,
} from '@devops-platform/games';

/**
 * `Problem` → `ProblemForSolver`: cắt nội dung gợi ý CHƯA mở.
 *
 * ⛔ Đây là chốt chặn thật, không phải một lớp trang trí trên UI. Nếu đường của
 * người học trả thẳng `Problem` thì toàn bộ `hints[].text` đi xuống trình duyệt
 * ngay từ lần tải đầu, và `revealHint` chỉ còn là hoạt cảnh: điểm vẫn bị trừ,
 * còn ai mở tab Network thì đọc gợi ý miễn phí. Giấu ở tầng hiển thị không cứu
 * được vì dữ liệu đã nằm trong phản hồi rồi.
 *
 * ⚠ `revealedIds` phải tới từ BẢNG `problem_hint_reveals` của chính người đang
 * gọi, không bao giờ từ input. Hợp đồng nói thẳng: *"Máy chủ quyết, không phải
 * client."* Nhận cờ này từ client là tự hỏi kẻ tấn công xem họ đã trả tiền chưa.
 *
 * Phần tử KHÔNG bị bỏ khỏi mảng: người học cần biết có bao nhiêu gợi ý và mỗi
 * cái tốn bao nhiêu điểm để quyết định có mở hay không — đó chính là sự đánh đổi
 * mà `penaltyPoints` sinh ra để diễn đạt.
 */
export function toSolverProblem(
  problem: Problem,
  revealedIds: ReadonlySet<string>,
): ProblemForSolver {
  const { hints, ...rest } = problem;
  return { ...rest, hints: toHintTeasers(hints, revealedIds) };
}

export function toHintTeasers(
  hints: readonly ProblemHint[],
  revealedIds: ReadonlySet<string>,
): readonly ProblemHintTeaser[] {
  return hints.map((hint) => {
    const revealed = revealedIds.has(hint.id);
    return {
      id: hint.id,
      penaltyPoints: hint.penaltyPoints,
      revealed,
      // `null` chứ không phải chuỗi rỗng: hợp đồng khai `text: string | null` và
      // một gợi ý mở ra mà nội dung rỗng là một dữ liệu hỏng khác hẳn "chưa mở".
      // Hai nghĩa, hai giá trị.
      text: revealed ? hint.text : null,
    };
  });
}

/**
 * Đường của NGƯỜI SOẠN: không che gì cả.
 *
 * Tách thành một hàm có tên thay vì để chỗ gọi tự dựng object: hai đường
 * (người học / người soạn) phải nhìn thấy được ở tên hàm, nếu không thì lần
 * sau ai đó "đơn giản hoá" hai nhánh thành một và lỗ rò quay lại.
 */
export function toAuthorProblem(problem: Problem): ProblemForSolver {
  return {
    ...problem,
    hints: problem.hints.map((hint) => ({
      id: hint.id,
      penaltyPoints: hint.penaltyPoints,
      revealed: true,
      text: hint.text,
    })),
  };
}
