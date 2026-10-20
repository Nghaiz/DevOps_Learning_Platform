import type { ReactElement } from 'react';
import { Icon, LevelBars, cn, type IconName } from '@devops-platform/ds';
import { PROBLEM_DIFFICULTY_LABELS, type ProblemDifficulty, type ProblemViewerStatus } from '@devops-platform/games';
import { PROBLEM_DIFFICULTY_LEVEL, PROBLEM_VIEWER_STATUS_LABELS } from './problem-labels';

/**
 * Hai dấu dùng chung của màn bài tập: độ khó (bốn vạch + chữ) và kết quả của chính
 * người xem (biểu tượng + chữ, không chỉ màu).
 */
export function ProblemDifficultyMark({
  value,
  className,
}: {
  readonly value: ProblemDifficulty;
  readonly className?: string;
}): ReactElement {
  return <LevelBars level={PROBLEM_DIFFICULTY_LEVEL[value]} max={4} label={PROBLEM_DIFFICULTY_LABELS[value]} className={className} />;
}

const STATUS_ICON: Readonly<Record<ProblemViewerStatus, IconName>> = {
  solved: 'success',
  attempted: 'circle-dot',
  untouched: 'circle',
};

const STATUS_TONE: Readonly<Record<ProblemViewerStatus, string>> = {
  solved: 'text-ok-ink',
  attempted: 'text-warn-ink',
  untouched: 'text-ink-3',
};

/** `null` = chưa đăng nhập hoặc máy chủ không trả trạng thái: không vẽ gì, không đoán. */
export function ViewerStatusMark({
  value,
  className,
  compact = false,
}: {
  readonly value: ProblemViewerStatus | null;
  readonly className?: string;
  /** Chỉ biểu tượng (nhãn vẫn đọc được bằng trình đọc màn hình). */
  readonly compact?: boolean;
}): ReactElement | null {
  if (value === null) return null;
  return (
    <span
      data-status={value}
      title={compact ? PROBLEM_VIEWER_STATUS_LABELS[value] : undefined}
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-sm', STATUS_TONE[value], className)}
    >
      <Icon name={STATUS_ICON[value]} size={18} className="shrink-0" />
      <span className={compact ? 'sr-only' : undefined}>{PROBLEM_VIEWER_STATUS_LABELS[value]}</span>
    </span>
  );
}

/** Chỉ biểu tượng kết quả, cho chip lọc vốn đã có chữ (không đọc lại nhãn hai lần). */
export function ViewerStatusGlyph({ value }: { readonly value: ProblemViewerStatus }): ReactElement {
  return <Icon name={STATUS_ICON[value]} size={16} className={cn('shrink-0', STATUS_TONE[value])} />;
}

/** Chỉ các vạch độ khó, cho chip lọc vốn đã có chữ. */
export function DifficultyBars({ value }: { readonly value: ProblemDifficulty }): ReactElement {
  const level = PROBLEM_DIFFICULTY_LEVEL[value];
  return (
    <span aria-hidden="true" className="flex items-end gap-[2px]">
      {[1, 2, 3, 4].map((step, index) => (
        <span
          key={step}
          className={cn('w-[3px] rounded-[1px]', ['h-1.5', 'h-2', 'h-2.5', 'h-3.5'][index], step <= level ? 'bg-acc-solid' : 'bg-rule-2')}
        />
      ))}
    </span>
  );
}

