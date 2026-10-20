import type { ReactElement } from 'react';
import { CircleAlert, CircleCheck, CircleDashed, CircleX } from 'lucide-react';
import { cn } from '@devops-platform/ui';
import type { ProblemSubmission } from '@devops-platform/games';
import {
  submissionVerdictKind,
  submissionVerdictLabel,
  type SubmissionVerdictKind,
} from './submission-verdict';

const ICON = {
  ac: CircleCheck,
  wa: CircleX,
  ce: CircleAlert,
  ungraded: CircleDashed,
} as const satisfies Record<SubmissionVerdictKind, unknown>;

/**
 * Mỗi sắc là một cặp đã qua cổng token: nền đặc với `-foreground` của nó, hoặc
 * viền + chữ trên mặt trong suốt. Bản trước đặt chữ màu lên chính nền pha 10–15%
 * của màu đó (`text-warning` trên `warning/15`, `text-destructive` trên
 * `destructive/10`): dưới 4.5:1.
 *
 * WA không dùng nền đỏ đặc: đỏ `destructive` lệch `primary` 2.3° nên một khối
 * đỏ đặc trông y như nút chính (xem chú thích biến thể `destructive` ở
 * `packages/ui/src/badge.tsx`).
 */
const TONE: Readonly<Record<SubmissionVerdictKind, string>> = {
  ac: 'bg-success text-success-foreground',
  wa: 'border border-destructive text-destructive',
  ce: 'bg-warning text-warning-foreground',
  ungraded: 'bg-muted text-muted-foreground',
};

/**
 * Chip verdict của MỘT lượt nộp trong lịch sử: AC / WA (n/m) / CE / chưa chấm.
 *
 * Chữ và màu cùng đi qua `submission-verdict.ts`, nên chip không thể tô xanh một
 * dòng mà chữ nói WA. Chữ nằm trong chip, biểu tượng `aria-hidden`: nghĩa không
 * bao giờ chỉ do màu chuyển tải.
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
  const Icon = ICON[kind];
  return (
    <span
      data-verdict={kind}
      className={cn(
        'inline-flex h-6 items-center gap-1.5 px-2 font-mono text-xs font-semibold whitespace-nowrap tabular-nums',
        TONE[kind],
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {submissionVerdictLabel(submission)}
    </span>
  );
}
