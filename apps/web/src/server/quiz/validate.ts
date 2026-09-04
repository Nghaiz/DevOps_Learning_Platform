import { TRPCError } from '@trpc/server';
import type { QuizFull, QuizQuestionFull } from '@devops-platform/shared-types/quiz';
import type { ContentIssue } from '../content/validate';

/**
 * Cổng XUẤT BẢN của quiz (P10 10.D task 13).
 *
 * Đối xứng với `content/validate.ts`: bản NHÁP được lưu tự do (0 câu, thiếu
 * lựa chọn, viết dở) — bắt một bản nháp phải hợp lệ là bắt người soạn viết xong
 * mới được lưu. Hàm này là cổng của `quiz.publish`, chỗ quiz rời khỏi tay tác
 * giả và bắt đầu là hợp đồng với người học.
 *
 * ## Vì sao ba luật này, và không phải một `CHECK` trong Postgres
 *
 * Cả ba đều là ràng buộc GIỮA các dòng của nhiều bảng (`quiz_questions` ×
 * `quiz_choices`), không phải ràng buộc trong một dòng. Diễn đạt chúng bằng
 * `CHECK` cần trigger, và một trigger là bản sao thứ hai của luật — nó sẽ lệch
 * khỏi bản này ở lần đầu tiên ai đó đổi một trong hai. Kiểm ở BIÊN GHI, một
 * chỗ, đúng khuôn `validateContentBody`.
 */

/** Không quiz nào xuất bản được mà không có câu hỏi nào. */
const MIN_QUESTIONS = 1;
/** Task 13 — ≥2 lựa chọn. Một câu một lựa chọn không phải câu hỏi. */
const MIN_CHOICES = 2;

function issuesForQuestion(question: QuizQuestionFull, at: string): readonly ContentIssue[] {
  const issues: ContentIssue[] = [];
  const correct = question.choices.filter((choice) => choice.isCorrect);

  if (question.choices.length < MIN_CHOICES) {
    issues.push({
      path: `${at}.choices`,
      message: `cần ít nhất ${String(MIN_CHOICES)} lựa chọn, đang có ${String(question.choices.length)}`,
    });
  }

  if (correct.length === 0) {
    issues.push({ path: `${at}.choices`, message: 'cần ít nhất 1 đáp án đúng' });
  }

  /**
   * Task 13: *"không câu nào 100% lựa chọn đúng (một câu như thế không đo được
   * gì)"*. Chọn tất cả là đúng, chọn bừa cũng là đúng — câu hỏi không phân biệt
   * được ai hiểu bài. Chặn ở đây thay vì để nó âm thầm nâng điểm mọi người.
   */
  if (question.choices.length > 0 && correct.length === question.choices.length) {
    issues.push({
      path: `${at}.choices`,
      message: 'mọi lựa chọn đều đúng — câu hỏi này không đo được gì',
    });
  }

  /**
   * `single` phải có ĐÚNG một đáp án đúng.
   *
   * Không nằm trong task 13, và vẫn phải có: `gradeQuiz` chấm cả hai kiểu bằng
   * MỘT luật (tập đã chọn bằng tập đáp án). Một câu `single` với hai đáp án
   * đúng khi đó không thể đạt — người học chỉ chọn được một lựa chọn trên UI,
   * nên tập của họ không bao giờ bằng tập hai phần tử. Đó là một câu hỏi luôn
   * sai với mọi người, và triệu chứng ("ai cũng mất điểm câu 3") không trỏ về
   * nguyên nhân. Chặn lúc xuất bản, nơi tác giả còn sửa được.
   */
  if (question.kind === 'single' && correct.length > 1) {
    issues.push({
      path: `${at}.choices`,
      message: `câu một-đáp-án có ${String(correct.length)} đáp án đúng — không lượt trả lời nào đạt được`,
    });
  }

  return issues;
}

/** Mọi vấn đề chặn xuất bản, kèm ĐƯỜNG DẪN tới đúng ô người soạn phải sửa. */
export function validateQuizForPublish(quiz: QuizFull): readonly ContentIssue[] {
  const issues: ContentIssue[] = [];

  if (quiz.questions.length < MIN_QUESTIONS) {
    issues.push({ path: 'questions', message: 'cần ít nhất 1 câu hỏi' });
  }

  for (const question of quiz.questions) {
    issues.push(...issuesForQuestion(question, `questions[${String(question.ordinal)}]`));
  }

  return issues;
}

/**
 * Ném BAD_REQUEST kèm ĐÚNG tên field sai — cùng khuôn `assertNoIssues` của
 * đường soạn P9, nên thông báo lỗi hai bên đọc giống nhau.
 */
export function assertQuizPublishable(quiz: QuizFull): void {
  const issues = validateQuizForPublish(quiz);
  if (issues.length === 0) {
    return;
  }
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: `Quiz không hợp lệ: ${issues.map((issue) => `${issue.path} — ${issue.message}`).join('; ')}`,
  });
}
