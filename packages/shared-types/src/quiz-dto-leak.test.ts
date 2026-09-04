import { describe, expect, it } from 'vitest';
import {
  quizChoiceForLearnerSchema,
  quizForLearnerSchema,
  quizQuestionForLearnerSchema,
  QUIZ_MULTIPLE_ANSWER_RULE,
  type QuizChoiceForLearner,
  type QuizChoiceFull,
  type QuizForLearner,
  type QuizFull,
  type QuizQuestionForLearner,
  type QuizQuestionFull,
} from './quiz.ts';

/**
 * Ô AC #4: *"DTO quiz gửi client KHÔNG có `isCorrect` — và đó là điều **compile**
 * chặn, không phải một `if`."*
 *
 * File này là BẰNG CHỨNG của ô đó, và nó chứng minh bằng hai lớp:
 *
 * ## Lớp compile — các dòng `@ts-expect-error` dưới đây
 *
 * `@ts-expect-error` là một khẳng định NGƯỢC: `tsc` báo lỗi nếu dòng ngay sau nó
 * **không** có lỗi. Nên nếu một ngày ai đó gỡ `isCorrect?: never` khỏi
 * `QuizChoiceForLearner`, các phép gán dưới đây trở nên hợp lệ, chỉ thị thành
 * thừa, và `pnpm --filter @devops-platform/shared-types typecheck` GÃY.
 *
 * Đó là tính chất khiến test này khác một test thường: **cổng tự báo động khi
 * chính nó bị tháo**. Một test runtime kiểm "payload không có field isCorrect"
 * sẽ lặng lẽ tiếp tục xanh sau khi rào compile biến mất.
 *
 * ⚠ Điều kiện để lớp này có hiệu lực: file phải nằm trong `include` của
 * `tsconfig.json` (`src/**\/*.ts` — đúng, tests ở cùng `src/`). Chuyển test ra
 * ngoài `src/` là vô hiệu hoá cổng mà không ai nhận ra.
 *
 * ## Lớp runtime — `.strict()`
 *
 * Chặn ca dữ liệu tới từ ngoài hệ thống (JSON đã parse, hàng DB) mà TypeScript
 * không nhìn thấy được.
 */

const fullChoice: QuizChoiceFull = { id: 'a', markdown: 'A', isCorrect: true };

const fullQuestion: QuizQuestionFull = {
  id: 'cau-1',
  ordinal: 0,
  kind: 'single',
  markdown: 'Câu hỏi',
  explanation: 'Giải thích này TIẾT LỘ đáp án nên cũng không được đi ra sớm.',
  choices: [fullChoice, { id: 'b', markdown: 'B', isCorrect: false }],
};

const fullQuiz: QuizFull = {
  id: 'quiz-thu',
  title: 'Quiz thử',
  description: null,
  passThresholdPercent: 70,
  multipleAnswerRule: QUIZ_MULTIPLE_ANSWER_RULE,
  questions: [fullQuestion],
};

describe('rào COMPILE — đáp án không gán được vào cây người học', () => {
  it('không gán được một lựa chọn ĐẦY ĐỦ vào QuizChoiceForLearner', () => {
    // @ts-expect-error `isCorrect: boolean` không gán được vào `never` — đây LÀ cái rào.
    const leaked: QuizChoiceForLearner = fullChoice;
    expect(leaked.id).toBe('a');
  });

  it('không dựng được literal có isCorrect ở kiểu người học', () => {
    // @ts-expect-error thêm `isCorrect` vào literal là lỗi compile, không phải review may mắn.
    const leaked: QuizChoiceForLearner = { id: 'a', markdown: 'A', isCorrect: true };
    expect(leaked.markdown).toBe('A');
  });

  /**
   * Ô chống-xanh-giả quan trọng nhất của file: MẢNG không phải object literal
   * tươi, nên lượt kiểm "field thừa" của TypeScript KHÔNG chạy trên nó. Nếu
   * `QuizQuestionForLearner.choices` chỉ gõ `{id, markdown}[]` thì dòng dưới sẽ
   * hợp lệ — cả một mảng đáp án đi thẳng ra client mà không gì phản đối.
   */
  it('không gán được MẢNG lựa chọn đầy đủ (chỗ excess-property check không tới)', () => {
    // @ts-expect-error mảng đáp án không gán được vào `readonly QuizChoiceForLearner[]`.
    const leaked: readonly QuizChoiceForLearner[] = fullQuestion.choices;
    expect(leaked).toHaveLength(2);
  });

  it('không gán được một CÂU HỎI đầy đủ vào kiểu người học', () => {
    // @ts-expect-error `explanation: string` không gán được vào `never`.
    const leaked: QuizQuestionForLearner = fullQuestion;
    expect(leaked.id).toBe('cau-1');
  });

  it('không gán được cả QUIZ đầy đủ vào QuizForLearner', () => {
    // @ts-expect-error cây đầy đủ không gán được vào cây người học ở bất kỳ tầng nào.
    const leaked: QuizForLearner = fullQuiz;
    expect(leaked.id).toBe('quiz-thu');
  });
});

describe('rào RUNTIME — .strict() từ chối field đáp án', () => {
  it('lựa chọn có isCorrect bị từ chối', () => {
    expect(quizChoiceForLearnerSchema.safeParse(fullChoice).success).toBe(false);
  });

  it('câu hỏi có explanation bị từ chối', () => {
    expect(quizQuestionForLearnerSchema.safeParse(fullQuestion).success).toBe(false);
  });

  it('quiz đầy đủ bị từ chối ở schema người học', () => {
    expect(quizForLearnerSchema.safeParse(fullQuiz).success).toBe(false);
  });

  /**
   * Đối chứng DƯƠNG: nếu mọi thứ đều bị từ chối thì ba khẳng định trên không
   * chứng minh gì (`green-that-proves-nothing`). Bản đã bóc đáp án PHẢI qua.
   */
  it('bản đã bóc đáp án thì QUA — đối chứng dương', () => {
    const learner = {
      id: 'quiz-thu',
      title: 'Quiz thử',
      description: null,
      passThresholdPercent: 70,
      multipleAnswerRule: QUIZ_MULTIPLE_ANSWER_RULE,
      questions: [
        {
          id: 'cau-1',
          ordinal: 0,
          kind: 'single',
          markdown: 'Câu hỏi',
          choices: [
            { id: 'a', markdown: 'A' },
            { id: 'b', markdown: 'B' },
          ],
        },
      ],
    };
    expect(quizForLearnerSchema.safeParse(learner).success).toBe(true);
  });

  /**
   * Rào cuối, và nó bắt ca mà cả hai lớp trên bỏ lọt: một payload đã SERIALIZE
   * (đi qua dây tRPC) không còn type nào cả. Ô AC dùng đúng phép kiểm này trên
   * response thật (`jq '..|.isCorrect? // empty'` phải rỗng); ở đây làm cùng
   * phép kiểm trên chuỗi JSON, không cần cụm đang chạy.
   */
  it('JSON của DTO người học không chứa chuỗi "isCorrect" ở bất kỳ tầng nào', () => {
    const learner = quizForLearnerSchema.parse({
      id: 'quiz-thu',
      title: 'Quiz thử',
      description: null,
      passThresholdPercent: 70,
      multipleAnswerRule: QUIZ_MULTIPLE_ANSWER_RULE,
      questions: [
        {
          id: 'cau-1',
          ordinal: 0,
          kind: 'single',
          markdown: 'Câu hỏi',
          choices: [
            { id: 'a', markdown: 'A' },
            { id: 'b', markdown: 'B' },
          ],
        },
      ],
    });
    const wire = JSON.stringify(learner);
    expect(wire).not.toContain('isCorrect');
    expect(wire).not.toContain('explanation');
  });
});
