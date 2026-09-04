import type {
  QuizAnswerInput,
  QuizFull,
  QuizQuestionFull,
  QuizQuestionResult,
  QuizScore,
} from '@devops-platform/shared-types/quiz';

/**
 * Chấm quiz — hàm THUẦN, KHÔNG chạm DB, KHÔNG chạm mạng (P10 10.C).
 *
 * Cùng lý lẽ `lab-score.ts`, và nó không chỉ là chuyện dễ test: tách phép tính
 * ra khỏi router là ĐIỀU KIỆN để "không lưu field suy ra được" còn đúng. Nếu
 * phép chấm nằm lẫn trong `quiz.submit`, không có gì ngăn một ngày nào đó ai đó
 * thêm lại cột `score` "cho nhanh" — vì lúc đó giá trị đã nằm sẵn trong tay,
 * ngay cạnh câu `insert`.
 *
 * SSOT của quy ước chấm: `docs/quiz-format.md`.
 *
 * ⚠ Đây là subpath AN TOÀN CHO TRÌNH DUYỆT (`@devops-platform/scenario/quiz-score`)
 * — thuần logic, không import Node built-in nào. Import nó qua barrel `.` sẽ kéo
 * `node:fs/promises` vào bundle trình duyệt rồi ĐỔ `next build`, đúng lỗi đã
 * dính thật ngày 2026-09-04 với `lab-score` (typecheck/lint/test đều xanh, chỉ
 * `next build` đỏ). Xem `packages/scenario/package.json` § "//exports".
 */

/**
 * Hai tập id BẰNG NHAU về nội dung, bỏ qua thứ tự và trùng lặp.
 *
 * Trùng lặp bị gộp trước khi so: một client gửi `['a','a']` cho câu một-đáp-án
 * đang mô tả cùng một lựa chọn hai lần, không phải hai lựa chọn.
 */
function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== right.size) {
    return false;
  }
  for (const id of left) {
    if (!right.has(id)) {
      return false;
    }
  }
  return true;
}

export function correctChoiceIdsOf(question: QuizQuestionFull): readonly string[] {
  return question.choices.filter((choice) => choice.isCorrect).map((choice) => choice.id);
}

/**
 * Chấm MỘT câu.
 *
 * **Một luật cho cả hai kiểu câu hỏi**, và đó là chủ đích: đúng ⇔ tập đã chọn
 * BẰNG tập đáp án. Với `single` (validate ép đúng một đáp án đúng) luật đó tự
 * thu về "chọn đúng một lựa chọn, và nó là lựa chọn đúng"; với `multiple` nó là
 * `all-or-nothing` mà task 10 chốt.
 *
 * Viết hai nhánh `if (kind === 'single')` sẽ là hai chỗ để sai thay vì một, và
 * nhánh nào ít chạy hơn sẽ là nhánh sai.
 *
 * Hệ quả PHỤ nhưng quan trọng: một id lựa chọn KHÔNG tồn tại trong câu hỏi làm
 * hai tập lệch nhau ⇒ câu đó sai. Không cần một nhánh "id lạ" riêng, và không
 * có đường nào để `['đáp-án-đúng', 'rác']` được tính là đúng.
 */
export function isAnswerCorrect(
  question: QuizQuestionFull,
  selectedChoiceIds: readonly string[],
): boolean {
  return sameIdSet(selectedChoiceIds, correctChoiceIdsOf(question));
}

export interface QuizGrading {
  readonly score: QuizScore;
  readonly questions: readonly QuizQuestionResult[];
}

/**
 * Chấm cả bài — nguồn DUY NHẤT của `score` và của `isCorrect` từng câu.
 *
 * Câu KHÔNG được trả lời (không có phần tử nào trong `answers`) tính là tập
 * rỗng ⇒ sai. Nó vẫn góp vào mẫu số, nên bỏ trống một câu luôn kéo điểm xuống
 * chứ không lặng lẽ biến mất khỏi phép chia — cùng quy ước `computeLabScore`
 * dùng cho task chưa chấm.
 *
 * `percent` làm tròn XUỐNG: một quiz mốc 80% mà người học đạt 79.6% phải hiện
 * "79%" và trượt, không phải "80%" rồi vẫn trượt.
 */
export function gradeQuiz(quiz: QuizFull, answers: readonly QuizAnswerInput[]): QuizGrading {
  const selectedByQuestion = new Map<string, readonly string[]>();
  for (const answer of answers) {
    selectedByQuestion.set(answer.questionId, answer.selectedChoiceIds);
  }

  const questions: QuizQuestionResult[] = quiz.questions.map((question) => {
    const selectedChoiceIds = selectedByQuestion.get(question.id) ?? [];
    return {
      questionId: question.id,
      correct: isAnswerCorrect(question, selectedChoiceIds),
      selectedChoiceIds: [...selectedChoiceIds],
      correctChoiceIds: [...correctChoiceIdsOf(question)],
      explanation: question.explanation,
    };
  });

  const questionCount = quiz.questions.length;
  const correctCount = questions.filter((result) => result.correct).length;

  /**
   * Nhánh PHÒNG THỦ: `assertQuizPublishable` không cho xuất bản quiz 0 câu, nên
   * đường thật không tới đây. Nó vẫn phải đúng, vì `passed` mặc định của
   * `0 >= passThresholdPercent` là `true` khi mốc là 0 — tức một quiz rỗng sẽ
   * "đạt" và mở khoá item kế tiếp trong một lộ trình `sequential`. Trả `false`
   * tường minh thay vì để phép so quyết định.
   */
  if (questionCount === 0) {
    return {
      score: { correctCount: 0, questionCount: 0, percent: 0, passed: false },
      questions,
    };
  }

  const percent = Math.floor((correctCount / questionCount) * 100);
  return {
    score: {
      correctCount,
      questionCount,
      percent,
      passed: percent >= quiz.passThresholdPercent,
    },
    questions,
  };
}
