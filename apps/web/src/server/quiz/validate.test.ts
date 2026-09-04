import { describe, expect, it } from 'vitest';
import {
  QUIZ_MULTIPLE_ANSWER_RULE,
  type QuizFull,
  type QuizQuestionFull,
} from '@devops-platform/shared-types/quiz';
import { assertQuizPublishable, validateQuizForPublish } from './validate';

/**
 * Cổng xuất bản quiz (P10 10.D task 13 / AC #8).
 *
 * Ba luật của task 13 (≥2 lựa chọn, ≥1 đúng, không phải tất cả đều đúng) cộng
 * một luật thứ tư mà `gradeQuiz` bắt buộc phải có (câu `single` chỉ được có một
 * đáp án đúng — xem lý do trong `validate.ts`).
 */

function question(over: Partial<QuizQuestionFull> = {}): QuizQuestionFull {
  return {
    id: 'cau-1',
    ordinal: 0,
    kind: 'single',
    markdown: 'Câu hỏi',
    explanation: null,
    choices: [
      { id: 'a', markdown: 'A', isCorrect: true },
      { id: 'b', markdown: 'B', isCorrect: false },
    ],
    ...over,
  };
}

function quiz(questions: readonly QuizQuestionFull[]): QuizFull {
  return {
    id: 'quiz-thu',
    title: 'Quiz thử',
    description: null,
    passThresholdPercent: 70,
    multipleAnswerRule: QUIZ_MULTIPLE_ANSWER_RULE,
    // `QuizFull.questions` khả biến (z.infer của z.array) — sao chép thay vì `as`.
    questions: [...questions],
  };
}

/** Đường dẫn của mọi vấn đề — AC đòi thông báo trỏ đúng ô người soạn phải sửa. */
function paths(quizToCheck: QuizFull): readonly string[] {
  return validateQuizForPublish(quizToCheck).map((issue) => issue.path);
}

describe('validateQuizForPublish', () => {
  /**
   * Đối chứng DƯƠNG, đứng đầu có chủ ý: nếu một quiz hợp lệ cũng bị từ chối thì
   * mọi khẳng định "bị từ chối" bên dưới không chứng minh gì.
   */
  it('quiz hợp lệ KHÔNG có vấn đề nào', () => {
    expect(validateQuizForPublish(quiz([question()]))).toEqual([]);
  });

  it('quiz 0 câu bị từ chối', () => {
    expect(paths(quiz([]))).toEqual(['questions']);
  });

  it('câu có 1 lựa chọn bị từ chối (task 13: ≥2)', () => {
    const issues = validateQuizForPublish(
      quiz([question({ choices: [{ id: 'a', markdown: 'A', isCorrect: true }] })]),
    );
    expect(issues.map((issue) => issue.path)).toContain('questions[0].choices');
    expect(issues.some((issue) => issue.message.includes('ít nhất 2 lựa chọn'))).toBe(true);
  });

  it('câu không có đáp án đúng nào bị từ chối', () => {
    const issues = validateQuizForPublish(
      quiz([
        question({
          choices: [
            { id: 'a', markdown: 'A', isCorrect: false },
            { id: 'b', markdown: 'B', isCorrect: false },
          ],
        }),
      ]),
    );
    expect(issues.some((issue) => issue.message.includes('ít nhất 1 đáp án đúng'))).toBe(true);
  });

  /**
   * Task 13: một câu mà mọi lựa chọn đều đúng không đo được gì — chọn bừa cũng
   * đúng. Nó âm thầm nâng điểm mọi người và không phân biệt được ai hiểu bài.
   */
  it('câu có TẤT CẢ lựa chọn đúng bị từ chối', () => {
    const issues = validateQuizForPublish(
      quiz([
        question({
          kind: 'multiple',
          choices: [
            { id: 'a', markdown: 'A', isCorrect: true },
            { id: 'b', markdown: 'B', isCorrect: true },
          ],
        }),
      ]),
    );
    expect(issues.some((issue) => issue.message.includes('không đo được gì'))).toBe(true);
  });

  /**
   * Không nằm trong task 13, và vẫn phải chặn: `gradeQuiz` chấm bằng phép so
   * TẬP, nên một câu `single` với hai đáp án đúng là câu không ai đạt được —
   * người học chỉ chọn được một lựa chọn. Triệu chứng ("ai cũng mất điểm câu
   * 3") không trỏ về nguyên nhân, nên chặn lúc tác giả còn sửa được.
   */
  it('câu MỘT-đáp-án mà có hai đáp án đúng bị từ chối', () => {
    const issues = validateQuizForPublish(
      quiz([
        question({
          kind: 'single',
          choices: [
            { id: 'a', markdown: 'A', isCorrect: true },
            { id: 'b', markdown: 'B', isCorrect: true },
            { id: 'c', markdown: 'C', isCorrect: false },
          ],
        }),
      ]),
    );
    expect(issues.some((issue) => issue.message.includes('không lượt trả lời nào đạt được'))).toBe(
      true,
    );
  });

  it('câu NHIỀU-đáp-án có hai đáp án đúng là hợp lệ', () => {
    expect(
      validateQuizForPublish(
        quiz([
          question({
            kind: 'multiple',
            choices: [
              { id: 'a', markdown: 'A', isCorrect: true },
              { id: 'b', markdown: 'B', isCorrect: true },
              { id: 'c', markdown: 'C', isCorrect: false },
            ],
          }),
        ]),
      ),
    ).toEqual([]);
  });

  it('đường dẫn trỏ đúng câu thứ mấy, không chỉ nói "có lỗi"', () => {
    // Câu hỏng theo ĐÚNG một cách (không đáp án đúng) để phép khẳng định này
    // nói về việc đánh số câu, chứ không về số lượng luật bị vi phạm.
    const bad = question({
      id: 'cau-2',
      ordinal: 1,
      choices: [
        { id: 'a', markdown: 'A', isCorrect: false },
        { id: 'b', markdown: 'B', isCorrect: false },
      ],
    });
    expect(paths(quiz([question(), bad]))).toEqual(['questions[1].choices']);
  });

  /**
   * Một câu hỏng theo NHIỀU cách báo cáo hết, không dừng ở luật đầu tiên: người
   * soạn sửa xong một lỗi rồi gặp lỗi kế tiếp là hai vòng round-trip cho một
   * câu hỏi.
   */
  it('báo cáo mọi luật bị vi phạm của cùng một câu, không dừng ở luật đầu', () => {
    const issues = validateQuizForPublish(
      quiz([question({ choices: [{ id: 'a', markdown: 'A', isCorrect: true }] })]),
    );
    expect(issues.length).toBeGreaterThan(1);
    expect(issues.every((issue) => issue.path === 'questions[0].choices')).toBe(true);
  });
});

describe('assertQuizPublishable', () => {
  it('quiz hợp lệ không ném', () => {
    expect(() => {
      assertQuizPublishable(quiz([question()]));
    }).not.toThrow();
  });

  it('quiz sai ném BAD_REQUEST kèm TÊN FIELD', () => {
    expect(() => {
      assertQuizPublishable(quiz([]));
    }).toThrow(/questions/);
  });
});
