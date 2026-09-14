import { t } from '@devops-platform/copy';
import { gradeFromSubmission, type ProblemSubmission } from '@devops-platform/games';

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
 * ## ✅ KHE ĐÃ VÁ 2026-09-15 — cột thứ ba đã có
 *
 * Bản trước ghi ở đây một khe không vá được: một lượt `CE` thật được `submit.ts`
 * ghi xuống với `passed = []` và `total = <số testcase của bài>`, tức
 * `total > 0`, nên `problemVerdictOf(0, 5)` đọc lại thành `WA (0/5)`. Chẩn đoán
 * lúc đó đúng và đã nêu đúng cái cần: *"phân biệt được hai thứ cần một cột thứ
 * ba (lý do hỏng)"*.
 *
 * Cột đó nay tồn tại — `ProblemSubmission.failedCode` (migration 0015) — nên
 * hàm này đi qua `gradeFromSubmission`, thứ đọc CẢ BA trường. Hợp đồng nói rõ vì
 * sao `failedCode` không phải một trường suy ra được: `passed = []` với
 * `total = 5` xảy ra ở cả một lượt `CE` do engine không tất định LẪN một lượt
 * `WA (0/5)` thật. Hai nguyên nhân, dữ liệu giống hệt.
 *
 * ⛔ VẪN đừng đoán từ `passed.length === 0` — lời cảnh báo cũ còn nguyên hiệu
 * lực, nó chỉ không còn là lựa chọn duy nhất nữa.
 *
 * ⚠ Và `subs-verdict-ungraded` KHÔNG bị `CE` nuốt mất: `gradeFromSubmission` trả
 * `CE` cho CẢ hai ca — `failedCode` khác `null` (hỏng thật) và `total <= 0`
 * (dòng cũ / bài chưa có testcase). Chỉ ca ĐẦU mới được in ra chữ `CE`; ca sau
 * giữ nguyên câu mờ, đúng lý lẽ ở khối trên và đúng như `packages/copy` đã ghi
 * cạnh khoá đó. Gộp hai ca lại là quay về đúng lỗi mà cả khối chú thích này
 * sinh ra để tránh: đổ lỗi sai cú pháp cho người chơi vì một thiếu sót của hệ
 * thống.
 */
export function submissionVerdictLabel(
  submission: Pick<ProblemSubmission, 'passed' | 'total' | 'failedCode'>,
): string {
  const { verdict } = gradeFromSubmission(submission);
  if (verdict === 'CE') {
    return submission.failedCode === null
      ? t('catalog.problem.subs-verdict-ungraded')
      : t('catalog.problem.verdict-ce');
  }
  if (verdict === 'AC') {
    return t('catalog.problem.verdict-ac');
  }
  return t('catalog.problem.verdict-wa', {
    passed: submission.passed.length,
    total: submission.total,
  });
}
