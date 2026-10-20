'use client';

import type { ReactElement } from 'react';
import { Archive, CircleCheck, LoaderCircle, PencilLine } from 'lucide-react';
import { cn } from '@devops-platform/ui';

/**
 * Hợp của hai union trạng thái: `ContentState` (bài học, lab, sân chơi; có
 * `publishing`) và `ProblemState` (đề bài; không có). Một ô cho cả hai để danh
 * sách bài học và danh sách đề trông như một hệ, không như hai trang của hai đội.
 */
export type StudioContentState = 'draft' | 'publishing' | 'published' | 'archived';

const TONE: Readonly<Record<StudioContentState, string>> = {
  draft: 'bg-muted text-foreground',
  publishing: 'bg-signal text-signal-foreground',
  published: 'bg-success text-success-foreground',
  archived: 'border border-border text-muted-foreground',
};

const ICON = {
  draft: PencilLine,
  publishing: LoaderCircle,
  published: CircleCheck,
  archived: Archive,
} as const satisfies Record<StudioContentState, unknown>;

/** Ô trạng thái vuông, có biểu tượng. Nhãn do nơi gọi dịch, vì hai union mang hai bảng chữ. */
export function StateChip(props: {
  readonly state: StudioContentState;
  readonly label: string;
  readonly className?: string;
}): ReactElement {
  const Icon = ICON[props.state];
  return (
    <span
      data-state={props.state}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 px-2 font-mono text-xs font-medium',
        TONE[props.state],
        props.className,
      )}
    >
      <Icon
        aria-hidden
        className={cn('size-3.5', props.state === 'publishing' && 'motion-safe:animate-spin')}
      />
      {props.label}
    </span>
  );
}
