import { t } from '@devops-platform/copy';
import type { BadgeVariant } from '@devops-platform/ui';
import type { LabAttemptStatus, LabScore } from '@devops-platform/shared-types/lab';
import type { QuizScore } from '@devops-platform/shared-types/quiz';

/**
 * Nhãn cho lịch sử lab/quiz trên `/me` — HÀM THUẦN.
 *
 * Cả `LabScore` lẫn `QuizScore` là field **TÍNH lúc đọc**: `lab_attempts` không
 * có cột `percent`/`status`/`duration`, `quiz_attempts` không có cột `score`, và
 * `quiz_answers` không có cột `is_correct` (xem chú thích ở
 * `packages/scenario/src/lab-score.ts` và `shared-types/src/quiz.ts`). Trang
 * này vì thế cũng KHÔNG được giữ một bản sao rồi khẳng định từ bản sao đó —
 * mọi con số dưới đây đi thẳng từ payload của lượt query hiện tại.
 *
 * ## Bẫy nhãn: điểm của một lần thử CHƯA NỘP không phải điểm cuối
 *
 * `computeLabStatus` trả `'in_progress'` khi `submittedAt === null`, nhưng
 * `computeLabScore` VẪN tính `percent` từ những task đã chấm. Hiện `"40%"` trần
 * trụi cạnh một lần thử đang dở đọc như một điểm số đã chốt — trong khi nó là
 * ảnh chụp giữa chừng và sẽ còn lên. Nhãn phải nói ra phạm vi đó.
 */

export interface LabAttemptSummary {
  readonly statusLabel: string;
  readonly statusVariant: BadgeVariant;
  readonly scoreLabel: string;
  readonly durationLabel: string;
}

/**
 * Ba trạng thái của `LabAttemptStatus`, khai bằng KHOÁ chứ không bằng câu.
 *
 * Bảng chạy ở tầng module nên nó được dựng đúng một lần lúc nạp; giữ khoá ở đây
 * và gọi `t()` trong thân hàm nghĩa là bản đồ vẫn là nguồn duy nhất, và một
 * khoá gõ sai là lỗi biên dịch chứ không phải một ô trống lúc chạy.
 */
const LAB_STATUS: Readonly<
  Record<LabAttemptStatus, { key: 'me.labs.status.in-progress' | 'me.labs.status.passed' | 'me.labs.status.failed'; variant: BadgeVariant }>
> = {
  in_progress: { key: 'me.labs.status.in-progress', variant: 'secondary' },
  passed: { key: 'me.labs.status.passed', variant: 'success' },
  failed: { key: 'me.labs.status.failed', variant: 'destructive' },
};

export function summarizeLabAttempt(input: {
  readonly status: LabAttemptStatus;
  readonly score: LabScore;
  readonly durationSeconds: number | null;
}): LabAttemptSummary {
  const status = LAB_STATUS[input.status];
  const percent = input.score.percent;

  return {
    statusLabel: t(status.key),
    statusVariant: status.variant,
    scoreLabel:
      input.status === 'in_progress'
        ? t('me.labs.score-partial', { percent })
        : t('me.labs.score-final', { percent, tasks: input.score.passedTaskIds.length }),
    durationLabel: formatDuration(input.durationSeconds),
  };
}

export interface QuizAttemptSummary {
  readonly statusLabel: string;
  readonly statusVariant: BadgeVariant;
  readonly scoreLabel: string;
}

export function summarizeQuizAttempt(input: { readonly score: QuizScore }): QuizAttemptSummary {
  const { correctCount, questionCount, percent, passed } = input.score;
  return {
    statusLabel: passed ? t('me.quizzes.status-passed') : t('me.quizzes.status-failed'),
    statusVariant: passed ? 'success' : 'destructive',
    scoreLabel: t('me.quizzes.score', { correct: correctCount, total: questionCount, percent }),
  };
}

/**
 * `null` = chưa nộp ⇒ KHÔNG có thời lượng (`computeAttemptDurationSeconds` trả
 * `null` đúng ở ca đó). Hiện `"0 giây"` cho một lần thử đang mở là bịa ra một
 * con số mà server cố ý từ chối trả.
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return t('me.duration.unsubmitted');
  }
  // `unit.second` / `unit.minute` là khoá của L0 ở `common.`, dùng chung với
  // các surface khác. Khai lại chúng dưới tiền tố `me.` sẽ là bản sao thứ hai
  // của cùng một câu, và hai bản sẽ trôi khỏi nhau ở lần sửa đầu tiên (§1.7).
  if (seconds < 60) {
    return t('unit.second', { n: seconds });
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return t('unit.minute', { n: minutes });
  }
  return t('me.duration.hours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}
