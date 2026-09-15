import {
  problemVerdictOf,
  type GradeResult,
  type ProblemFailureCode,
  type ProblemVerdict,
  type TestcaseTeaser,
} from './problem.ts';
import type { VerifyStatus } from './verify.ts';

/**
 * Suy verdict và dựng mô hình hiển thị. §18.B.3 và §18.B.5.
 *
 * ⛔ `problemVerdictOf` ở `./problem.ts` là NGUỒN SỰ THẬT DUY NHẤT cho phép suy
 * verdict, và file này gọi nó chứ không viết lại `passed === total`. Lý do nằm ở
 * §18.C.3: phép so verdict client-với-server chỉ có nghĩa khi hai bên dùng chung
 * một hàm; hai phép suy khác nhau thì một lệch nhau nói về hai hàm chứ không nói
 * gì về engine.
 *
 * ## Vì sao file này ở `packages/games` chứ không ở `apps/web/src/server/`
 *
 * Nó đã ở đó tới 2026-09-14, và chỗ đó SAI TẦNG theo đúng nghĩa đen. Cả hai phía
 * dùng nó: máy chủ dựng `GradeResult` lúc chấm, còn `use-problem-submit.ts` là
 * một file `'use client'` import THẲNG giá trị `toVerdictView` từ
 * `src/server/problems/`. Đã đo hôm đó: đúng MỘT file `'use client'` trong cả
 * `apps/web` làm điều ấy, và `next build` xanh chỉ nhờ một điều kiện mong manh
 * là file này tình cờ thuần. Thêm một dòng `import 'server-only'` vào nó, bất kỳ
 * lúc nào, là đỏ ngay lập tức, và đỏ ở phía người khác chứ không ở phía người
 * vừa gõ dòng đó.
 *
 * Chỗ đúng là cạnh `problemVerdictOf`, vì đây là **phép suy dùng chung cho cả
 * hai phía** chứ không phải mã máy chủ. §18.C.3 sẽ đem verdict hai bên ra so, và
 * lúc đó "cùng một hàm" phải là một sự thật của cấu trúc thư mục, không phải một
 * lời hứa trong chú thích.
 *
 * ⛔ Ràng buộc kèm theo, đừng phá: package này chạy TRONG bundle client, nên
 * file này không được `import node:*` và không được chạm React. Cả hai thứ chỉ
 * làm `next build` đỏ, còn typecheck/lint/test vẫn xanh. Xem `//exports` ở
 * `packages/games/package.json`.
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
  const code = compileErrorCode(status, total);
  return code === null ? null : problemFailureMessage(code);
}

/**
 * Cùng phép phân nhánh với `compileErrorReason`, nhưng trả MÃ thay vì câu chữ.
 *
 * Hai hàm đi cặp và `compileErrorReason` gọi hàm này chứ không tự phân nhánh
 * lần nữa — nếu không thì sửa một nhánh ở một chỗ là đủ để câu chữ và mã lưu
 * xuống DB nói hai điều khác nhau về cùng một lượt, và không cổng nào bắt được.
 */
export function compileErrorCode(
  status: VerifyStatus,
  total: number,
): ProblemFailureCode | null {
  if (status === 'da-xac-minh') {
    // `total <= 0` vẫn ra `CE` qua `problemVerdictOf`, và nó KHÔNG phải lỗi của
    // người làm — bài chưa có testcase nào thì chưa chấm được.
    return total <= 0 ? 'chua-co-testcase' : null;
  }
  // Bốn nhánh còn lại trùng tên với chính `VerifyStatus`, có chủ ý — xem khối
  // chú thích `PROBLEM_FAILURE_CODES` ở `core/problem.ts`.
  return status;
}

/**
 * Mã hỏng → câu tiếng Việt. **SSOT của mọi câu đi kèm `CE`.**
 *
 * Tách ra để một lượt đọc-lại-từ-DB dựng lại đúng câu mà lượt nộp đã hiện: chỗ
 * ghi lưu mã, chỗ đọc tra lại câu, và không có bản sao thứ hai của bảng chữ.
 *
 * ⚠ `sai-game` ở đây là bản CHUNG. Đường trực tiếp (`problem-plugins.ts`) dựng
 * một câu chi tiết hơn có kèm tên hai game, vì lúc đó nó còn cầm hai cái tên;
 * đọc lại từ cột thì không còn, nên câu ngắn là thứ trung thực nhất nói được.
 */
export function problemFailureMessage(code: ProblemFailureCode): string {
  switch (code) {
    case 'log-hong':
      return 'Nhật ký của lượt chơi sai hình dạng nên không phát lại được.';
    case 'phat-lai-loi':
      return 'Bộ mô phỏng dừng giữa chừng khi phát lại lượt chơi này.';
    case 'engine-khong-tat-dinh':
      return 'Hai lần phát lại cùng một nhật ký cho hai kết quả khác nhau.';
    case 'khong-khop':
      return 'Phát lại ra kết quả khác với kết quả trình duyệt gửi lên, nên không chấm được lượt này.';
    case 'chua-co-testcase':
      return 'Bài này chưa có testcase nào nên chưa chấm được.';
    case 'sai-game':
      return 'Nhật ký của lượt chơi thuộc một game khác với game của bài.';
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
    failedCode: verdict === 'CE' ? compileErrorCode(status, total) : null,
  };
}

/**
 * Dựng lại `GradeResult` từ một dòng LỊCH SỬ — §18.C, việc 3.
 *
 * Đây là chỗ *"lịch sử nộp bài hiện `WA (n/m)`"* được tính, và nó chỉ tính được
 * vì hai cột `passed`/`total` đã chốt tại thời điểm nộp. Đọc lại từ bài NGÀY HÔM
 * NAY sẽ cho một mẫu số khác. Chú thích cột `total` ở
 * `apps/web/src/server/db/schema.ts` nói rõ vì sao, và `ProblemSubmission` ở
 * `../k8s/problem.ts` chở cùng lời khai đó qua dây.
 *
 * ⛔ Verdict suy qua `problemVerdictOf`, không phải `passed.length === total`
 * viết tay. Cùng lý do đã ghi ở đầu file: §18.C.3 đem so verdict hai bên, và hai
 * phép suy khác nhau thì một lệch nhau nói về hai hàm chứ không nói gì về engine.
 *
 * ## Cột thứ ba đã có — `failedCode` (migration 0015)
 *
 * Trước 0015 hàm này chỉ có `passed`/`total`, và hai khe dưới đây là hậu quả.
 * Cả hai nay đóng được, nên ghi lại cả khe lẫn cách đóng:
 *
 *  · **`CE` thật đọc ra `WA (0/5)`.** `submit.ts` ở nhánh `engine-khong-tat-dinh`
 *    ghi `passed = []` với `total = <số testcase>`, tức `total > 0`. Suy bằng
 *    `problemVerdictOf(0, 5)` thì ra `WA`. ⛔ Không sửa được bằng cách đoán từ
 *    `passed.length === 0` — một `WA (0/5)` THẬT cũng có `passed` rỗng. Nay
 *    `failedCode !== null` là lời khai chốt lúc nộp và nó THẮNG phép suy.
 *  · **`total === 0` gộp ba nguyên nhân** (lượt không chấm được · dòng ghi TRƯỚC
 *    18.C · bài chưa có testcase nào). Nay `chua-co-testcase` tách được ca thứ
 *    ba, còn dòng cũ thì mang `failedCode === null` — xem bảng hai-nghĩa-của-null
 *    ở `PROBLEM_FAILURE_CODES`.
 *
 * `failedReason` vẫn KHÔNG được lưu (nó là câu tiếng Việt, không phải dữ liệu);
 * nó được **dựng lại** từ mã qua `problemFailureMessage`, nên lịch sử hiện đúng
 * câu mà lượt nộp đã hiện chứ không phải một câu chung chung.
 */
export function gradeFromSubmission(submission: {
  readonly passed: readonly string[];
  readonly total: number;
  readonly failedCode: ProblemFailureCode | null;
}): GradeResult {
  // Mã hỏng thắng phép suy: nó là thứ máy chủ CHỐT lúc nộp, còn `passed`/`total`
  // ở một lượt `CE` vốn đã được hợp đồng tuyên là "không nói lên gì".
  const verdict: ProblemVerdict =
    submission.failedCode !== null
      ? 'CE'
      : problemVerdictOf(submission.passed.length, submission.total);
  return {
    verdict,
    passed: verdict === 'CE' ? [] : submission.passed,
    total: submission.total,
    failedReason:
      verdict !== 'CE'
        ? null
        : submission.failedCode !== null
          ? problemFailureMessage(submission.failedCode)
          : // `CE` mà không có mã ⇒ dòng ghi trước 0015. Nói đúng cái biết được.
            'Lượt này không chấm được, và lịch sử không lưu lý do.',
    failedCode: submission.failedCode,
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
