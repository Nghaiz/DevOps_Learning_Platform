import type {
  Problem,
  ProblemHint,
  ProblemHintTeaser,
  ProblemStats,
  ProblemViewerStatus,
  TestcaseTeaser,
} from '@devops-platform/games';
import { problemTestcases, toAuthorTestcaseTeasers, toTestcaseTeasers } from './testcases';

/**
 * Hình dạng bài tập mà NGƯỜI HỌC nhận qua dây.
 *
 * ⛔ KHÔNG có `objectives`, và đó là toàn bộ §18.B.4. Cho tới bản này,
 * `problems.byCode` và `problems.list` trả thẳng `Objective[]` — tức `check` và
 * `args` của MỌI điều kiện chấm — xuống trình duyệt. Trang `/problems/[code]`
 * không hề đọc chúng (kiểm bằng grep 2026-09-14: `problem-overview.tsx` vẽ mã,
 * tên, độ khó, chủ đề, tag, đề bài, hạn giờ; không một dòng nào chạm
 * `objectives`), nên đó là dữ liệu gửi đi mà không ai dùng — và ai mở tab công
 * cụ nhà phát triển đều đọc được cách chấm. Trang DANH SÁCH còn rộng hơn: nó
 * gửi cách chấm của cả hai mươi bài mỗi lần tải.
 *
 * `core/problem.ts` § `TestcaseTeaser` đảo lại quyết định cũ của
 * `k8s/problem.ts` một cách tường minh: *"`check` và `args` KHÔNG có mặt trong
 * kiểu này ở bất kỳ trường hợp nào — kể cả với testcase hiện. Nhãn là đề bài;
 * tên vị từ và tham số là cách chấm, và cách chấm không phải thứ người làm cần
 * để làm bài."*
 *
 * ── Vì sao kiểu này khai ở tầng web chứ không lấy từ `packages/games` ──
 *
 * `core/problem.ts` ĐÃ khai `ProblemForSolver<Spec>` đúng hình dạng cần, nhưng
 * barrel KHÔNG mở nó ra: cái tên đó đang bị bản cũ của `k8s/problem.ts` chiếm,
 * và khối chú thích "TRẠNG THÁI TRUNG GIAN CÓ CHỦ Ý" trong `index.ts` liệt kê
 * nó vào chín tên tồn tại ở cả hai chỗ. Lane này không sở hữu `packages/games`,
 * nên nó dựng kiểu tại đây TỪ các mảnh đã mở (`TestcaseTeaser`,
 * `ProblemHintTeaser`) thay vì khai lại một `Testcase` thứ hai.
 *
 * ⚠ Đây là chỗ dọn khi 18.A hợp nhất hai bản khai: lúc `ProblemForSolver` của
 * `core/` ra tới barrel, kiểu dưới đây bỏ đi và chỗ dùng đổi sang nó. Đã báo lead.
 */
export type SolverProblem = Omit<Problem, 'hints' | 'objectives'> & {
  readonly hints: readonly ProblemHintTeaser[];
  /**
   * Thay chỗ của `objectives`. Testcase ẩn giữ nguyên phần tử để mẫu số `n/m`
   * trung thực, chỉ `label` là `null` — xem `toTestcaseTeasers`.
   */
  readonly testcases: readonly TestcaseTeaser[];
};

/** Bài kèm số liệu, hình dạng mà trang danh sách và trang chi tiết nhận. */
export interface SolverProblemWithStats {
  readonly problem: SolverProblem;
  readonly stats: ProblemStats;
  /** Trạng thái của NGƯỜI ĐANG XEM. */
  readonly viewerStatus: ProblemViewerStatus | null;
}

export interface SolverProblemPage {
  readonly items: readonly SolverProblemWithStats[];
  readonly nextCursor: string | null;
}

/**
 * `Problem` → `SolverProblem`: cắt nội dung gợi ý CHƯA mở, và cắt `check`/`args`
 * của MỌI testcase.
 *
 * ⛔ Đây là chốt chặn thật, không phải một lớp trang trí trên UI. Nếu đường của
 * người học trả thẳng `Problem` thì toàn bộ `hints[].text` đi xuống trình duyệt
 * ngay từ lần tải đầu, và `revealHint` chỉ còn là hoạt cảnh: điểm vẫn bị trừ,
 * còn ai mở tab Network thì đọc gợi ý miễn phí. Giấu ở tầng hiển thị không cứu
 * được vì dữ liệu đã nằm trong phản hồi rồi. Testcase ẩn rò theo đúng đường đó.
 *
 * ⚠ `revealedIds` phải tới từ BẢNG `problem_hint_reveals` của chính người đang
 * gọi, không bao giờ từ input. Hợp đồng nói thẳng: *"Máy chủ quyết, không phải
 * client."* Nhận cờ này từ client là tự hỏi kẻ tấn công xem họ đã trả tiền chưa.
 *
 * `hasSubmitted` cùng luật đó: nó tới từ `viewerStatus` mà máy chủ gộp ra từ
 * bảng `problem_submissions`, không từ một cờ client gửi lên. Đây là thứ chặn
 * kiểu dò đáp án bằng cách nộp nhiều lần — nếu client tự khai "tôi nộp rồi" thì
 * nhãn testcase ẩn rơi ra ngay ở lần tải đầu tiên.
 *
 * Phần tử KHÔNG bị bỏ khỏi mảng gợi ý: người học cần biết có bao nhiêu gợi ý và
 * mỗi cái tốn bao nhiêu điểm để quyết định có mở hay không — đó chính là sự
 * đánh đổi mà `penaltyPoints` sinh ra để diễn đạt.
 */
export function toSolverProblem(
  problem: Problem,
  revealedIds: ReadonlySet<string>,
  hasSubmitted: boolean,
): SolverProblem {
  // Huỷ cấu trúc để `objectives` KHÔNG đi tiếp qua `rest`. Viết
  // `{ ...problem, testcases }` sẽ mang theo `objectives` nguyên vẹn và kiểu
  // vẫn xanh (thừa trường không phải lỗi ở một biểu thức không phải object
  // literal) — đúng cái bẫy mà `TestcaseTeaser` sinh ra để chặn.
  const { hints, objectives, ...rest } = problem;
  return {
    ...rest,
    hints: toHintTeasers(hints, revealedIds),
    testcases: toTestcaseTeasers(problemTestcases(objectives), hasSubmitted),
  };
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
 * Đường của NGƯỜI SOẠN: gợi ý nguyên văn, nhãn testcase hiện hết.
 *
 * Tách thành một hàm có tên thay vì để chỗ gọi tự dựng object: hai đường
 * (người học / người soạn) phải nhìn thấy được ở tên hàm, nếu không thì lần
 * sau ai đó "đơn giản hoá" hai nhánh thành một và lỗ rò quay lại.
 *
 * ⚠ `check`/`args` KHÔNG đi qua đây dù người gọi là tác giả. Trang chi tiết là
 * MỘT trang cho cả hai vai, nên nó có MỘT kiểu trả về; cho tác giả thêm trường
 * ở đúng chỗ này nghĩa là kiểu trên dây lại có chỗ chứa cách chấm, và phép che
 * quay về phụ thuộc vào một nhánh `if` chạy đúng. Người soạn cần bản đầy đủ thì
 * đi `problems.forEdit`, đường đó trả `Problem` và có cổng chủ sở hữu riêng.
 */
export function toAuthorProblem(problem: Problem): SolverProblem {
  const { hints, objectives, ...rest } = problem;
  return {
    ...rest,
    hints: hints.map((hint) => ({
      id: hint.id,
      penaltyPoints: hint.penaltyPoints,
      revealed: true,
      text: hint.text,
    })),
    testcases: toAuthorTestcaseTeasers(problemTestcases(objectives)),
  };
}
