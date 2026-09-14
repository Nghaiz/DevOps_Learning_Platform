'use client';

import { type ReactElement } from 'react';
import type { EventView } from '@devops-platform/games';
import { cn } from '@devops-platform/ui';
import { PanelFrame } from './inspector-frame.tsx';
import { InspectorEvents } from './inspector-events.tsx';
import './events.css';

const MAX_LINES = 60;

export interface EventLogProps {
  readonly events: readonly EventView[];
  readonly onClose: () => void;
  readonly className?: string;
}

/** Bounded cluster history. ArenaRoot remains the sole live announcement owner. */
export function EventLog({ events, onClose, className }: EventLogProps): ReactElement {
  const recent = events.slice(-MAX_LINES);
  return (
    <PanelFrame
      title="Nhật ký sự kiện"
      closeLabel="Đóng nhật ký sự kiện"
      onClose={onClose}
      className={cn(
        'arena-event-window absolute bottom-3 left-1/2 z-20 -translate-x-1/2',
        className,
      )}
    >
      <div className="arena-event-intro">
        <p>Theo dõi những gì vừa xảy ra trong cụm.</p>
        <span>
          Hiển thị tối đa {MAX_LINES} sự kiện gần nhất. Lỗi trong nhật ký có thể đã được xử lý.
        </span>
      </div>
      <InspectorEvents events={recent} tick={recent.at(-1)?.tick ?? 0} scope="cluster" />
    </PanelFrame>
  );
}
