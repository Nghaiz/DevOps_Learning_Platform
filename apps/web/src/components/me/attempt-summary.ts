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

const LAB_STATUS: Readonly<Record<LabAttemptStatus, { label: string; variant: BadgeVariant }>> = {
  in_progress: { label: 'Đang làm dở', variant: 'secondary' },
  passed: { label: 'Đạt', variant: 'success' },
  failed: { label: 'Chưa đạt', variant: 'destructive' },
};

export function summarizeLabAttempt(input: {
  readonly status: LabAttemptStatus;
  readonly score: LabScore;
  readonly durationSeconds: number | null;
}): LabAttemptSummary {
  const status = LAB_STATUS[input.status];
  const percent = `${String(input.score.percent)}%`;

  return {
    statusLabel: status.label,
    statusVariant: status.variant,
    scoreLabel:
      input.status === 'in_progress'
        ? `${percent} tính tới lúc này (chưa nộp)`
        : `${percent} · đạt ${String(input.score.passedTaskIds.length)} task`,
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
    statusLabel: passed ? 'Đạt' : 'Chưa đạt',
    statusVariant: passed ? 'success' : 'destructive',
    scoreLabel: `${String(correctCount)}/${String(questionCount)} câu đúng · ${String(percent)}%`,
  };
}

/**
 * `null` = chưa nộp ⇒ KHÔNG có thời lượng (`computeAttemptDurationSeconds` trả
 * `null` đúng ở ca đó). Hiện `"0 giây"` cho một lần thử đang mở là bịa ra một
 * con số mà server cố ý từ chối trả.
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return 'chưa nộp';
  }
  if (seconds < 60) {
    return `${String(seconds)} giây`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${String(minutes)} phút`;
  }
  return `${String(Math.floor(minutes / 60))} giờ ${String(minutes % 60)} phút`;
}
