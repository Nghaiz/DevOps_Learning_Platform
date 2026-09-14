import { t } from '@devops-platform/copy';
import { problemVerdictOf, type ProblemSubmission } from '@devops-platform/games';

/**
 * Nhãn verdict cho MỘT DÒNG LỊCH SỬ nộp bài. §18.C, việc 3.
 *
 * ⛔ Hàm này gọi `problemVerdictOf` chứ không viết lại `passed.length === total`.
 * Cùng luật đã ghi ở `verdict-view.ts`: §18.C.3 đem so verdict client với server,
 * và hai phép suy khác nhau thì một lệch nhau nói về hai hàm chứ không nói gì về
 * engine. Chỗ này là tầng HIỂN THỊ, nên nó được phép dịch verdict thành chữ.
 * Nó không được phép tự suy ra verdict.
 *
 * ## Vì sao `CE` không bao giờ hiện ra ở đây, dù `problemVerdictOf` có trả `CE`
 *
 * `problemVerdictOf(_, 0)` trả `CE`, và quyết định đó GIỮ NGUYÊN: lúc chấm, một
 * bài không có testcase nào thì chưa chấm được, và `CE` là nhãn duy nhất trong
 * ba nhãn mang đúng tính chất "hai con số kia không nói lên gì".
 *
 * Nhưng lịch sử là một ngữ cảnh khác. Cột `total` mặc định `0`, nên một dòng
 * `total === 0` gộp BA nguyên nhân vào một biểu hiện:
 *
 *  1. lượt thật sự không chấm được, đúng nghĩa `CE`;
 *  2. dòng ghi TRƯỚC 18.C, khi hai cột `passed`/`total` chưa tồn tại;
 *  3. bài chưa có testcase nào.
 *
 * `CE` nghĩa là lỗi cú pháp. In `CE` cho ca 2 hoặc ca 3 là nói với người chơi
 * rằng bài của họ sai cú pháp trong khi không hề, tức là hệ thống đổ lỗi cho
 * người dùng về một thiếu sót của chính nó. Một nhãn sai theo hướng đó tệ hơn
 * hẳn một nhãn mờ, nên `total <= 0` đọc ra thành một câu chỉ nói đúng thứ nó
 * biết: lượt này chưa được chấm theo testcase.
 *
 * ⚠ ĐỪNG đọc hàm này thành "lịch sử không bao giờ sai". Nó CÒN một khe nữa mà
 * lane này không vá được: một lượt `CE` thật sự được `submit.ts` ghi xuống với
 * `passed = []` và `total = <số testcase của bài>`, tức `total > 0`. Đọc lại,
 * `problemVerdictOf(0, 5)` trả `WA`, nên dòng đó hiện ra là `WA (0/5)` chứ không
 * phải `CE`. Phân biệt được hai thứ cần một cột thứ ba (lý do hỏng), và
 * `failedReason` là một câu tiếng Việt chứ không phải dữ liệu nên không lưu
 * thẳng được. Đã báo lead. Đừng vá bằng cách đoán từ `passed.length === 0`:
 * một lượt `WA (0/5)` thật cũng có `passed` rỗng.
 */
export function submissionVerdictLabel(
  submission: Pick<ProblemSubmission, 'passed' | 'total'>,
): string {
  const verdict = problemVerdictOf(submission.passed.length, submission.total);
  if (verdict === 'CE') {
    return t('catalog.problem.subs-verdict-ungraded');
  }
  if (verdict === 'AC') {
    return t('catalog.problem.verdict-ac');
  }
  return t('catalog.problem.verdict-wa', {
    passed: submission.passed.length,
    total: submission.total,
  });
}
