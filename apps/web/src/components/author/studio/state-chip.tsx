'use client';

import type { ReactElement } from 'react';
import { Pill, cn, type IconName, type Tone } from '@devops-platform/ds';

/**
 * Hợp của hai union trạng thái: `ContentState` (bài học, lab, sân chơi; có `publishing`)
 * và `ProblemState` (đề bài; không có). Một ô cho cả hai để danh sách bài học và danh
 * sách đề trông như một hệ, không như hai trang của hai đội.
 */
export type StudioContentState = 'draft' | 'publishing' | 'published' | 'archived';

const TONE: Readonly<Record<StudioContentState, Tone>> = {
  draft: 'neutral',
  publishing: 'info',
  published: 'ok',
  archived: 'neutral',
};

const ICON: Readonly<Record<StudioContentState, IconName>> = {
  draft: 'edit',
  publishing: 'upload',
  published: 'success',
  archived: 'archive',
};

/** Ô trạng thái có biểu tượng. Nhãn do nơi gọi dịch, vì hai union mang hai bảng chữ. */
export function StateChip(props: {
  readonly state: StudioContentState;
  readonly label: string;
  readonly className?: string;
}): ReactElement {
  return (
    <Pill
      data-state={props.state}
      tone={TONE[props.state]}
      icon={ICON[props.state]}
      className={cn(props.state === 'publishing' && 'animate-breathe', props.className)}
    >
      {props.label}
    </Pill>
  );
}
