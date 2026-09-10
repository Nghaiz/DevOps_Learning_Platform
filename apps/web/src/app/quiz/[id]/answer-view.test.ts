import { describe, expect, it } from 'vitest';
import {
  QUIZ_MULTIPLE_ANSWER_RULE,
  type QuizForLearner,
  type QuizFull,
  type QuizQuestionResult,
} from '@devops-platform/shared-types/quiz';
import { renderCopy, type CopyRef } from '@devops-platform/copy';
import { MULTIPLE_ANSWER_RULE_KEYS, choiceReveal, summarizeAnswers } from './answer-view';

/**
 * `label` và `caveat` nay là `CopyRef` chứ không phải câu (§1.6 của
 * `p16-copy.md`), nên mọi khẳng định về CHỮ phải đi qua `renderCopy`. Dựng ra
 * câu thật cũng là thứ bù lại phần kiểm THAM SỐ mà `CopyRef` bỏ ở tầng biên
 * dịch: một tham số sai tên hiện ra ngay dưới dạng chuỗi thiếu chỗ.
 */
function say(ref: CopyRef | null): string {
  return ref === null ? '' : renderCopy(ref);
}

function outcome(over: Partial<QuizQuestionResult> = {}): QuizQuestionResult {
  return {
    questionId: 'q1',
    correct: false,
    selectedChoiceIds: [],
    correctChoiceIds: ['a'],
    explanation: null,
    ...over,
  };
}

function learnerQuiz(questionIds: readonly string[]): Pick<QuizForLearner, 'questions'> {
  return {
    questions: questionIds.map((id, index) => ({
      id,
      ordinal: index,
      kind: 'single' as const,
      markdown: `Câu ${String(index + 1)}`,
      choices: [
        { id: 'a', markdown: 'A' },
        { id: 'b', markdown: 'B' },
      ],
    })),
  };
}

describe('choiceReveal — đáp án KHÔNG tới client trước khi nộp', () => {
  it('CHƯA NỘP (outcome null) ⇒ mọi lựa chọn đều "none", kể cả lựa chọn đã chọn', () => {
    // Đây là ô AC. Một hiện thực rò rỉ sẽ tô sẵn đáp án đúng trước khi nộp; nếu
    // nó làm thế, dòng này đỏ.
    expect(choiceReveal(null, 'a', [])).toBe('none');
    expect(choiceReveal(null, 'a', ['a'])).toBe('none');
    expect(choiceReveal(undefined, 'b', ['a', 'b'])).toBe('none');
  });

  it('SAU KHI NỘP: bốn vai trò tách bạch, không gộp "bỏ lỡ" với "chọn sai"', () => {
    const result = outcome({ correctChoiceIds: ['a', 'b'], selectedChoiceIds: ['a', 'c'] });
    expect(choiceReveal(result, 'a', ['a', 'c'])).toBe('correct');
    expect(choiceReveal(result, 'b', ['a', 'c'])).toBe('missed');
    expect(choiceReveal(result, 'c', ['a', 'c'])).toBe('wrong-pick');
    expect(choiceReveal(result, 'd', ['a', 'c'])).toBe('none');
  });

  it('id lựa chọn KHÔNG có trong đáp án và cũng không được chọn ⇒ "none", không phải "wrong-pick"', () => {
    expect(choiceReveal(outcome({ correctChoiceIds: ['a'] }), 'z', [])).toBe('none');
  });
});

describe('rào compile — đáp án không lọt vào mô hình hiển thị', () => {
  it('`QuizFull` KHÔNG gán được vào tham số kiểu người-học của `summarizeAnswers`', () => {
    // Khẳng định NGƯỢC: `tsc` gãy nếu dòng dưới KHÔNG còn lỗi nữa — tức là khi
    // ai đó nới kiểu tham số ra thành `QuizFull` (hay `any`) thì cổng này tự báo
    // động, thay vì lặng lẽ xanh tiếp. Cùng khuôn `quiz-dto-leak.test.ts` của
    // `packages/shared-types`, nhưng đặt ở ĐÚNG biên mà trang này đọc dữ liệu.
    const full: Pick<QuizFull, 'questions'> = {
      questions: [
        {
          id: 'q1',
          ordinal: 0,
          kind: 'single',
          markdown: 'Câu 1',
          explanation: 'vì kubectl get pods -A mới liệt kê mọi namespace',
          choices: [
            { id: 'a', markdown: 'A', isCorrect: true },
            { id: 'b', markdown: 'B', isCorrect: false },
          ],
        },
      ],
    };

    // @ts-expect-error — `isCorrect: boolean` không gán được vào `never`.
    const progress = summarizeAnswers(full, {});
    expect(progress.questionCount).toBe(1);
  });
});

describe('summarizeAnswers — nhãn đếm câu ĐÃ CHỌN, không phải câu ĐÚNG', () => {
  it('làm dở ⇒ nhãn nói đúng số câu đã chọn và nhắc luật bỏ trống', () => {
    const progress = summarizeAnswers(learnerQuiz(['q1', 'q2', 'q3']), { q1: ['a'], q3: ['b'] });
    expect(progress.answeredCount).toBe(2);
    expect(progress.unansweredCount).toBe(1);
    expect(say(progress.label)).toBe('Đã chọn đáp án cho 2/3 câu');
    expect(say(progress.caveat)).toContain('Còn 1 câu chưa chọn');
    expect(say(progress.caveat)).toContain('tính là sai');
    // ⛔ Nhãn KHÔNG được khẳng định gì về đúng/sai — client chưa biết.
    expect(say(progress.label)).not.toContain('đúng');
  });

  it('mảng rỗng KHÔNG tính là đã trả lời (bỏ chọn hết phải quay về chưa trả lời)', () => {
    const progress = summarizeAnswers(learnerQuiz(['q1', 'q2']), { q1: [], q2: [] });
    expect(progress.answeredCount).toBe(0);
    expect(say(progress.label)).toBe('Đã chọn đáp án cho 0/2 câu');
  });

  it('trả lời hết ⇒ không còn câu nhắc thừa', () => {
    const progress = summarizeAnswers(learnerQuiz(['q1']), { q1: ['a'] });
    expect(progress.unansweredCount).toBe(0);
    expect(progress.caveat).toBeNull();
  });
});

describe('MULTIPLE_ANSWER_RULE_KEYS — câu chữ lấy theo luật TRONG PAYLOAD', () => {
  it('phủ đúng luật server đang khai, và nói ra "không có điểm một phần"', () => {
    // Dựng ra CÂU chứ không chỉ so khoá: một khoá trỏ đúng chỗ nhưng chữ bên
    // kia đã bị viết lại thành thứ khác vẫn là hỏng, và chỉ phép dựng câu mới
    // thấy được.
    const text = renderCopy({ key: MULTIPLE_ANSWER_RULE_KEYS[QUIZ_MULTIPLE_ANSWER_RULE] });
    expect(text).toContain('ĐÚNG và ĐỦ');
    expect(text).toContain('không có điểm một phần');
  });
});
