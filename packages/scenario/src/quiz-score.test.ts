import { describe, expect, it } from 'vitest';
import {
  QUIZ_MULTIPLE_ANSWER_RULE,
  type QuizFull,
  type QuizQuestionFull,
} from '@devops-platform/shared-types/quiz';
import { correctChoiceIdsOf, gradeQuiz, isAnswerCorrect } from './quiz-score.ts';

/**
 * Chấm quiz — luật `all-or-nothing` (task 10) và mốc đạt (task 4 của 10.A).
 *
 * Test viết theo HÀNH VI người học quan sát được, không theo cấu trúc hàm: mỗi
 * `it` dưới đây mô tả một tình huống có thật ở màn hình chấm bài.
 */

function question(over: Partial<QuizQuestionFull> = {}): QuizQuestionFull {
  return {
    id: 'cau-1',
    ordinal: 0,
    kind: 'single',
    markdown: 'Lệnh nào liệt kê pod ở mọi namespace?',
    explanation: null,
    choices: [
      { id: 'a', markdown: 'kubectl get pods', isCorrect: false },
      { id: 'b', markdown: 'kubectl get pods -A', isCorrect: true },
    ],
    ...over,
  };
}

function quiz(questions: readonly QuizQuestionFull[], passThresholdPercent = 70): QuizFull {
  return {
    id: 'quiz-thu',
    title: 'Quiz thử',
    description: null,
    passThresholdPercent,
    multipleAnswerRule: QUIZ_MULTIPLE_ANSWER_RULE,
    // `QuizFull.questions` là mảng KHẢ BIẾN (z.infer của z.array), nên helper
    // nhận `readonly` phải sao chép — không `as` để khỏi nuốt một lỗi thật.
    questions: [...questions],
  };
}

describe('isAnswerCorrect — một luật cho cả hai kiểu câu hỏi', () => {
  it('câu một-đáp-án: chọn đúng lựa chọn đúng thì đạt', () => {
    expect(isAnswerCorrect(question(), ['b'])).toBe(true);
    expect(isAnswerCorrect(question(), ['a'])).toBe(false);
  });

  it('không chọn gì là SAI, không phải "chưa chấm"', () => {
    expect(isAnswerCorrect(question(), [])).toBe(false);
  });

  const multi = question({
    kind: 'multiple',
    choices: [
      { id: 'a', markdown: 'A', isCorrect: true },
      { id: 'b', markdown: 'B', isCorrect: true },
      { id: 'c', markdown: 'C', isCorrect: false },
    ],
  });

  it('nhiều đáp án: đúng HOÀN TOÀN mới tính điểm', () => {
    expect(isAnswerCorrect(multi, ['a', 'b'])).toBe(true);
    // Thiếu một đáp án đúng — `all-or-nothing`, không có nửa điểm.
    expect(isAnswerCorrect(multi, ['a'])).toBe(false);
    // Thừa một đáp án sai.
    expect(isAnswerCorrect(multi, ['a', 'b', 'c'])).toBe(false);
  });

  it('thứ tự chọn không đổi kết quả', () => {
    expect(isAnswerCorrect(multi, ['b', 'a'])).toBe(true);
  });

  it('chọn trùng một lựa chọn hai lần vẫn tính là chọn nó một lần', () => {
    expect(isAnswerCorrect(question(), ['b', 'b'])).toBe(true);
  });

  /**
   * Đây là ô chống-xanh-giả của `assertAnswersReferenceQuiz`: kể cả khi lớp
   * kiểm id ở router bị gỡ, một id bịa KHÔNG được biến câu sai thành câu đúng.
   */
  it('id lựa chọn KHÔNG tồn tại làm câu đó sai, không được bỏ qua', () => {
    expect(isAnswerCorrect(question(), ['b', 'khong-co-that'])).toBe(false);
  });

  it('correctChoiceIdsOf trả đúng tập đáp án', () => {
    expect(correctChoiceIdsOf(multi)).toEqual(['a', 'b']);
  });
});

describe('gradeQuiz — điểm TÍNH, không lưu', () => {
  const twoQuestions = [
    question({ id: 'cau-1', ordinal: 0 }),
    question({ id: 'cau-2', ordinal: 1 }),
  ];

  it('đúng cả hai câu ⇒ 100% và đạt', () => {
    const { score } = gradeQuiz(quiz(twoQuestions), [
      { questionId: 'cau-1', selectedChoiceIds: ['b'] },
      { questionId: 'cau-2', selectedChoiceIds: ['b'] },
    ]);
    expect(score).toEqual({ correctCount: 2, questionCount: 2, percent: 100, passed: true });
  });

  it('câu KHÔNG trả lời vẫn nằm ở mẫu số — bỏ dở luôn kéo điểm xuống', () => {
    const { score } = gradeQuiz(quiz(twoQuestions), [
      { questionId: 'cau-1', selectedChoiceIds: ['b'] },
    ]);
    expect(score.questionCount).toBe(2);
    expect(score.percent).toBe(50);
    expect(score.passed).toBe(false);
  });

  /**
   * Cùng quy ước `labScoreSchema.percent`: một quiz mốc 80% mà người học đạt
   * 79.6% phải hiện "79%" và trượt — không phải "80%" rồi vẫn trượt (một màn
   * hình nói "80%" cạnh chữ "trượt" là màn hình không giải thích được).
   */
  it('percent làm tròn XUỐNG', () => {
    const threeQuestions = [
      question({ id: 'c1', ordinal: 0 }),
      question({ id: 'c2', ordinal: 1 }),
      question({ id: 'c3', ordinal: 2 }),
    ];
    const { score } = gradeQuiz(quiz(threeQuestions, 80), [
      { questionId: 'c1', selectedChoiceIds: ['b'] },
      { questionId: 'c2', selectedChoiceIds: ['b'] },
    ]);
    expect(score.percent).toBe(66);
    expect(score.passed).toBe(false);
  });

  it('mốc đạt lấy từ CHÍNH quiz đó, không phải một hằng số toàn cục', () => {
    const answers = [{ questionId: 'cau-1', selectedChoiceIds: ['b'] }];
    expect(gradeQuiz(quiz(twoQuestions, 50), answers).score.passed).toBe(true);
    expect(gradeQuiz(quiz(twoQuestions, 51), answers).score.passed).toBe(false);
  });

  it('trả kết quả + giải thích của TỪNG câu (task 9)', () => {
    const withExplanation = quiz([
      question({ explanation: 'Cờ `-A` mở rộng ra mọi namespace.' }),
    ]);
    const { questions } = gradeQuiz(withExplanation, [
      { questionId: 'cau-1', selectedChoiceIds: ['a'] },
    ]);
    expect(questions).toEqual([
      {
        questionId: 'cau-1',
        correct: false,
        selectedChoiceIds: ['a'],
        correctChoiceIds: ['b'],
        explanation: 'Cờ `-A` mở rộng ra mọi namespace.',
      },
    ]);
  });

  /**
   * Nhánh phòng thủ, và nó KHÔNG thừa: `passed` mặc định của
   * `0 >= passThresholdPercent` là `true` khi mốc là 0 — một quiz rỗng sẽ "đạt"
   * và mở khoá item kế tiếp trong lộ trình `sequential`. `assertQuizPublishable`
   * chặn quiz 0 câu, nhưng một quiz bị xoá hết câu SAU khi xuất bản thì không
   * đi qua cổng đó lần nữa.
   */
  it('quiz 0 câu KHÔNG đạt, kể cả khi mốc là 0', () => {
    const { score } = gradeQuiz(quiz([], 0), []);
    expect(score).toEqual({ correctCount: 0, questionCount: 0, percent: 0, passed: false });
  });
});
