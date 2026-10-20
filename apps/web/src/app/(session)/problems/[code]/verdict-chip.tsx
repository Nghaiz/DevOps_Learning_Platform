import type { ReactElement } from 'react';
import { Pill, type IconName, type Tone } from '@devops-platform/ds';
import type { ProblemSubmission } from '@devops-platform/games';
import {
  submissionVerdictKind,
  submissionVerdictLabel,
  type SubmissionVerdictKind,
} from './submission-verdict';

const ICON: Readonly<Record<SubmissionVerdictKind, IconName>> = {
  ac: 'success',
  wa: 'close',
  ce: 'warning',
  ungraded: 'circle',
};

/** Sắc của chip. Chữ luôn đi kèm, nên nghĩa không bao giờ chỉ do màu chuyển tải. */
const TONE: Readonly<Record<SubmissionVerdictKind, Tone>> = {
  ac: 'ok',
  wa: 'bad',
  ce: 'warn',
  ungraded: 'neutral',
};

/**
 * Chip verdict của MỘT lượt nộp trong lịch sử: AC / WA (n/m) / CE / chưa chấm.
 *
 * Chữ và màu cùng đi qua `submission-verdict.ts`, nên chip không thể tô xanh một
 * dòng mà chữ nói WA.
 *
 * ⛔ KHÔNG dùng cho kết quả vừa nộp trong đấu trường: chỗ đó là `ProblemVerdict`
 * (`problem-verdict.tsx`), thứ đấu trường K8s đóng băng đang gọi.
 */
export function VerdictChip({
  submission,
  className,
}: {
  readonly submission: Pick<ProblemSubmission, 'passed' | 'total' | 'failedCode'>;
  readonly className?: string;
}): ReactElement {
  const kind = submissionVerdictKind(submission);
  return (
    <Pill data-verdict={kind} tone={TONE[kind]} icon={ICON[kind]} className={className}>
      <span className="font-mono tabular-nums">{submissionVerdictLabel(submission)}</span>
    </Pill>
  );
}
