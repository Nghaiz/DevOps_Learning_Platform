import type {
  QuizForLearner,
  QuizMultipleAnswerRule,
  QuizQuestionResult,
} from '@devops-platform/shared-types/quiz';

/**
 * Mô hình hiển thị của trang làm quiz — hàm THUẦN, tách khỏi cây component.
 *
 * `apps/web` chạy vitest ở `environment: 'node'` theo MẶC ĐỊNH, nên thứ gì đáng
 * khẳng định phải sống được ngoài JSX.
 *
 * ⚠ Từ `727af45` mặc định đó KHÔNG còn là ràng buộc cứng: jsdom + RTL bật được
 * theo TỪNG FILE bằng docblock `// @vitest-environment jsdom` (`environmentMatchGlobs`
 * đã bị bỏ ở vitest 4, đừng dùng). Việc tách hàm thuần ở đây vẫn đúng — nó rẻ và
 * ổn định hơn một lượt render — nhưng đừng đọc câu trên thành "không kiểm được". Hai thứ ở file này đáng
 * khẳng định, và cả hai đều là ô AC chứ không phải lựa chọn giao diện:
 *
 * 1. **Trước khi nộp, client KHÔNG có gì để tô đúng/sai.** `choiceReveal` nhận
 *    `outcome: QuizQuestionResult | null` và trả `'none'` cho MỌI lựa chọn khi
 *    `outcome === null`. Đó là cổng ở tầng dữ liệu; tầng type đã chặn ở trên
 *    (`QuizChoiceForLearner.isCorrect?: never`) và hai lớp phục vụ hai mối lo
 *    khác nhau — type chặn đáp án RỜI SERVER, hàm này chặn client suy ra một
 *    kết luận nó không có dữ liệu để suy.
 * 2. **Nhãn tiến độ chỉ nói thứ nó biết.** Client biết đúng một điều trước khi
 *    nộp: câu nào đã chọn ít nhất một lựa chọn. Nó KHÔNG biết câu nào đúng, nên
 *    không nhãn nào ở đây được nói "đã làm đúng N câu".
 *
 * ⛔ Đừng thêm tham số nào có `isCorrect` vào các hàm dưới đây. Test
 * `answer-view.test.ts` dùng `@ts-expect-error` để khẳng định `QuizFull` KHÔNG
 * gán được vào tham số `QuizForLearner` — nới kiểu ra là làm dòng đó hết lỗi và
 * `tsc` gãy, tức cổng tự báo động khi chính nó bị tháo.
 */

/**
 * Câu chữ của quy tắc chấm, chọn theo `quiz.multipleAnswerRule` TRONG PAYLOAD.
 *
 * `Record<QuizMultipleAnswerRule, …>` chứ không một chuỗi viết cứng: server sở
 * hữu luật chấm, và một câu chữ FE tự viết sẽ trôi khỏi cách chấm thật ở lần
 * đầu tiên server đổi luật (`docs/quiz-format.md` § "Quy tắc này hiện trên UI
 * TRƯỚC khi làm"). Kiểu `Record` trên union còn làm việc thêm một luật chấm
 * thứ hai ĐỎ ở typecheck thay vì lặng lẽ hiện chuỗi rỗng.
 */
export const MULTIPLE_ANSWER_RULE_TEXT: Record<QuizMultipleAnswerRule, string> = {
  'all-or-nothing':
    'Câu nhiều đáp án: phải chọn ĐÚNG và ĐỦ mọi đáp án đúng mới được tính điểm — không có điểm một phần.',
};

/**
 * Vai trò hiển thị của MỘT lựa chọn, SAU khi đã có kết quả.
 *
 * Bốn nhánh chứ không hai: "đáp án đúng mà tôi bỏ lỡ" (`missed`) và "tôi chọn
 * nhưng sai" (`wrong-pick`) là hai thông tin khác nhau, và gộp chúng lại thành
 * "sai" bỏ mất đúng thứ người học cần để hiểu mình sai ở đâu.
 */
export type ChoiceReveal = 'none' | 'correct' | 'missed' | 'wrong-pick';

export function choiceReveal(
  outcome: QuizQuestionResult | null | undefined,
  choiceId: string,
  selectedChoiceIds: readonly string[],
): ChoiceReveal {
  // ⛔ Cổng. Chưa nộp ⇒ chưa có kết quả ⇒ KHÔNG lộ gì, kể cả gián tiếp qua màu.
  if (outcome === null || outcome === undefined) {
    return 'none';
  }

  const isAnswer = outcome.correctChoiceIds.includes(choiceId);
  const picked = selectedChoiceIds.includes(choiceId);

  if (isAnswer) {
    return picked ? 'correct' : 'missed';
  }
  return picked ? 'wrong-pick' : 'none';
}

export interface AnswerProgress {
  /** Câu đã chọn ít nhất một lựa chọn. */
  readonly answeredCount: number;
  readonly questionCount: number;
  readonly unansweredCount: number;
  /** Nhãn hiện cho người học. Nói đúng thứ client biết trước khi nộp. */
  readonly label: string;
  /** `null` khi đã trả lời hết — không có gì để nhắc thêm. */
  readonly caveat: string | null;
}

/**
 * Tiến độ TRẢ LỜI (không phải tiến độ ĐÚNG).
 *
 * Bẫy P2 ở dạng quiz: một nhãn "đã làm 5/5 câu" cạnh nút Nộp rất dễ bị đọc
 * thành "5/5 đúng". Câu chữ dưới đây nói rõ nó đếm câu ĐÃ CHỌN, và câu phụ nhắc
 * luật đã ghi ở `docs/quiz-format.md`: bỏ trống tính là sai và vẫn nằm ở mẫu số.
 */
export function summarizeAnswers(
  quiz: Pick<QuizForLearner, 'questions'>,
  selected: Readonly<Record<string, readonly string[]>>,
): AnswerProgress {
  const questionCount = quiz.questions.length;
  const answeredCount = quiz.questions.filter(
    (question) => (selected[question.id] ?? []).length > 0,
  ).length;
  const unansweredCount = questionCount - answeredCount;

  return {
    answeredCount,
    questionCount,
    unansweredCount,
    label: `Đã chọn đáp án cho ${String(answeredCount)}/${String(questionCount)} câu`,
    caveat:
      unansweredCount > 0
        ? `Còn ${String(unansweredCount)} câu chưa chọn — câu bỏ trống tính là sai và vẫn nằm ở mẫu số.`
        : null,
  };
}
