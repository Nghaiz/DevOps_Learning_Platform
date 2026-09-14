import {
  problemVerdictOf,
  type GradeResult,
  type ProblemVerdict,
  type Testcase,
  type TestcaseTeaser,
  type VerifyStatus,
} from '@devops-platform/games';

/**
 * Suy verdict và dựng mô hình hiển thị — §18.B.3 và §18.B.5.
 *
 * ⛔ `problemVerdictOf` của `packages/games` là NGUỒN SỰ THẬT DUY NHẤT cho phép
 * suy verdict, và file này gọi nó chứ không viết lại `passed === total`. Lý do
 * nằm ở §18.C.3: phép so verdict client-với-server chỉ có nghĩa khi hai bên
 * dùng chung một hàm; hai phép suy khác nhau thì một lệch nhau nói về hai hàm
 * chứ không nói gì về engine.
 */

// ── Verdict của một lượt đã chấm ────────────────────────────────────────────

/**
 * Trạng thái xác minh → verdict.
 *
 * `verifyRun` phân biệt NĂM trạng thái; `ProblemVerdict` chỉ có BA giá trị. Ánh
 * xạ vì thế không một-một, và mỗi nhánh dưới đây là một quyết định:
 *
 * | `VerifyStatus` | Verdict | Vì sao |
 * |---|---|---|
 * | `da-xac-minh` | `problemVerdictOf(...)` | Phát lại khớp ⇒ `passed`/`total` là số thật ⇒ `AC` hoặc `WA (n/m)` |
 * | `log-hong` | `CE` | Nhật ký sai hình dạng: lượt chơi KHÔNG chạy tới nơi |
 * | `phat-lai-loi` | `CE` | Reducer ném giữa chừng: cũng không chạy tới nơi |
 * | `engine-khong-tat-dinh` | `CE` | Hai lần phát lại ra hai kết quả ⇒ không có con số nào đáng tin |
 * | `khong-khop` | `CE` | Xem khối cảnh báo ngay dưới |
 *
 * ⚠ `khong-khop` là NHÁNH GƯỢNG, và ghi lại ở đây thay vì để người sau tự đoán.
 * Lượt đó CHẠY TỚI NƠI — đúng nghĩa thì nó không phải `CE`. Nhưng máy chủ không
 * cầm được tập `passed` của chính mình từ `verifyRun` (hàm đó trả `mismatches`
 * dạng chuỗi, không trả `objectivesMet` đã phát lại), nên con số duy nhất trong
 * tay là lời khai của client — thứ vừa bị chứng minh là không khớp. In
 * `WA (4/5)` từ một lời khai đã trượt xác minh là nói dối; in `WA (0/5)` cũng
 * nói dối theo chiều ngược lại.
 *
 * `CE` được chọn vì nó là nhãn DUY NHẤT trong ba nhãn mang đúng tính chất cần
 * có: *"`passed`/`total` không nói lên gì"* ⇒ không in phân số. Đổi lại, nhãn
 * đọc hơi sai với người dùng, nên `failedReason` phải nói rõ chuyện gì đã xảy
 * ra thay vì để họ đoán là đề của họ hỏng.
 *
 * ⛔ Đây là một KHE TRONG HỢP ĐỒNG, không phải một lựa chọn cài đặt: mã này có
 * BỐN trạng thái thật (đạt · chưa đạt · không chạy được · chạy được nhưng không
 * xác minh được) trong khi `ProblemVerdict` chỉ khai ba. Đã báo lead.
 */
export function verdictFromVerify(
  status: VerifyStatus,
  passedCount: number,
  total: number,
): ProblemVerdict {
  return status === 'da-xac-minh' ? problemVerdictOf(passedCount, total) : 'CE';
}

/**
 * Câu tiếng Việt đi kèm `CE`. `null` khi verdict không phải `CE`.
 *
 * ⚠ Không câu nào ở đây được nói "gian lận", cùng luật mà `verifyLabel` đã ghi:
 * một bản lưu hỏng vì đổi phiên bản rơi vào ĐÚNG nhánh `khong-khop` như một bản
 * bị sửa tay, và buộc tội người dùng dựa trên một tín hiệu không phân biệt được
 * hai thứ đó là sai.
 */
export function compileErrorReason(status: VerifyStatus, total: number): string | null {
  if (status === 'da-xac-minh') {
    // `total <= 0` vẫn ra `CE` qua `problemVerdictOf`, và nó KHÔNG phải lỗi của
    // người làm — bài chưa có testcase nào thì chưa chấm được.
    return total <= 0 ? 'Bài này chưa có testcase nào nên chưa chấm được.' : null;
  }
  switch (status) {
    case 'log-hong':
      return 'Nhật ký của lượt chơi sai hình dạng nên không phát lại được.';
    case 'phat-lai-loi':
      return 'Bộ mô phỏng dừng giữa chừng khi phát lại lượt chơi này.';
    case 'engine-khong-tat-dinh':
      return 'Hai lần phát lại cùng một nhật ký cho hai kết quả khác nhau.';
    case 'khong-khop':
      return 'Phát lại ra kết quả khác với kết quả trình duyệt gửi lên, nên không chấm được lượt này.';
  }
}

/**
 * Dựng `GradeResult` cho một lượt vừa nộp.
 *
 * `passed` chỉ được giữ ở nhánh ĐÃ XÁC MINH. Ở mọi nhánh khác nó rỗng, đúng bất
 * biến mà `core/problem.ts` § `GradeResult` khai: *"`CE` mang `passed` rỗng và
 * `failedReason` khác `null`; hai verdict còn lại thì ngược lại."*
 */
export function gradeOf(
  status: VerifyStatus,
  passed: readonly string[],
  total: number,
): GradeResult {
  const verdict = verdictFromVerify(status, passed.length, total);
  return {
    verdict,
    passed: verdict === 'CE' ? [] : passed,
    total,
    failedReason: verdict === 'CE' ? compileErrorReason(status, total) : null,
  };
}

// ── Mô hình hiển thị ────────────────────────────────────────────────────────

/**
 * Một testcase ĐỎ, ở dạng hiển thị được.
 *
 * `label` là `string | null` chứ không phải `string`: một testcase ẩn mà người
 * làm CHƯA nộp thì chưa có nhãn để hiện. Sau khi nộp thì có — và một lượt nộp
 * chính là lúc mô hình này được dựng, nên trong thực tế `null` chỉ xảy ra khi
 * chỗ gọi truyền nhầm bộ teaser chưa mở khoá. Tầng hiển thị phải xử được cả
 * hai, không được `!`.
 */
export interface FailedTestcaseView {
  readonly id: string;
  readonly label: string | null;
}

/**
 * Thứ tầng giao diện cần để vẽ một verdict — §18.B.3.
 *
 * ⛔ `fraction` là `null` khi verdict là `CE`, và đó là cả điểm của §18.B.5:
 * lượt chơi không chạy tới nơi thì `passed`/`total` không nói lên gì, nên hiển
 * thị KHÔNG được in `0/5`. Ép điều đó bằng kiểu thay vì bằng kỷ luật của người
 * viết component.
 */
export interface VerdictView {
  readonly verdict: ProblemVerdict;
  /** `null` với `CE`. `{ passed, total }` với `AC` và `WA`. */
  readonly fraction: { readonly passed: number; readonly total: number } | null;
  /** Rỗng với `AC` và `CE`. Với `WA` là đúng những testcase chưa qua. */
  readonly failed: readonly FailedTestcaseView[];
  /** `null` trừ khi `CE`. */
  readonly failedReason: string | null;
}

/**
 * `GradeResult` + danh sách testcase → mô hình hiển thị.
 *
 * Đây là chỗ *"kèm chỉ rõ testcase nào đỏ"* của §18.B.3 được tính. Phép trừ chạy
 * trên `id`, KHÔNG trên chỉ số: hợp đồng `Submission.passed` nói thẳng *"Id chứ
 * không phải chỉ số — chỉ số vỡ khi tác giả đổi thứ tự."*
 *
 * Nhận `TestcaseTeaser[]` chứ không nhận `Testcase[]`, và đó là chủ ý: mô hình
 * hiển thị không được cầm `check`/`args`, kể cả ở tầng máy chủ. Một hàm nhận
 * kiểu đầy đủ là một hàm mà lần sau ai đó sẽ trả thẳng ra dây.
 *
 * Thứ tự `failed` theo thứ tự testcase của bài, không theo thứ tự `passed`:
 * người làm đọc danh sách đỏ cạnh đề bài, nên nó phải khớp thứ tự họ đã đọc.
 */
export function toVerdictView(
  grade: GradeResult,
  testcases: readonly TestcaseTeaser[],
): VerdictView {
  if (grade.verdict === 'CE') {
    return { verdict: 'CE', fraction: null, failed: [], failedReason: grade.failedReason };
  }
  const passed = new Set(grade.passed);
  return {
    verdict: grade.verdict,
    // `grade.total` chứ không phải `testcases.length`: `total` là sự thật lịch
    // sử chốt lúc nộp, còn `testcases` là bài NGÀY HÔM NAY. Hai số bằng nhau
    // cho tới lần đầu tác giả thêm một case, và lúc đó chỉ một trong hai đúng.
    fraction: { passed: grade.passed.length, total: grade.total },
    failed: testcases
      .filter((testcase) => !passed.has(testcase.id))
      .map((testcase) => ({ id: testcase.id, label: testcase.label })),
    failedReason: null,
  };
}
