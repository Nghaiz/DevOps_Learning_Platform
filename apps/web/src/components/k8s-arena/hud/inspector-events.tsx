'use client';

import type { ReactElement } from 'react';
import type { EventView } from '@devops-platform/games';
import { cn } from '@devops-platform/ui';
import { EVENT_LEVEL_CLASS, EVENT_LEVEL_LABEL } from './inspector-types.ts';

export interface InspectorEventsProps {
  /**
   * Sự kiện ĐÃ được lọc về đúng object đang chọn.
   *
   * Việc lọc nằm ở cha chứ không ở đây, và đó không phải sự lười: `EventView`
   * của hợp đồng chỉ có `{tick, level, message}` — nó ĐÃ ĐÁNH RƠI `involvedUid`
   * mà `ClusterEvent` bên trong engine vẫn giữ. Lọc tại đây thì cách duy nhất là
   * dò tên object trong câu chữ, và cách đó sai một cách im lặng: hai pod tên
   * `web` và `web-2` sẽ ăn sự kiện của nhau. Xem `inspector-types.ts` phần bảng
   * chỗ lệch hợp đồng.
   */
  readonly events: readonly EventView[];
}

/** Tab Sự kiện của bảng thông số. Mới nhất lên trên — chẩn đoán đọc từ hiện tại lùi về. */
export function InspectorEvents({ events }: InspectorEventsProps): ReactElement {
  if (events.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        Chưa có sự kiện nào gắn với tài nguyên này.
      </p>
    );
  }

  const newestFirst = [...events].reverse();

  return (
    <ol className="flex flex-col divide-y divide-border">
      {newestFirst.map((event, index) => (
        // Khoá gồm cả chỉ số: hai sự kiện cùng tick với cùng nội dung là chuyện
        // bình thường (hai container của một pod hỏng cùng lúc vì cùng nguyên
        // nhân), và khoá trùng sẽ làm React bỏ hẳn dòng thứ hai.
        <li
          key={`${String(event.tick)}-${String(index)}-${event.message}`}
          className="flex gap-2 py-1.5 text-xs"
        >
          <span aria-hidden="true" className="shrink-0 font-mono text-[11px] text-muted-foreground">
            t{event.tick}
          </span>
          <span className="sr-only">{EVENT_LEVEL_LABEL[event.level]}:</span>
          <span className={cn('min-w-0', EVENT_LEVEL_CLASS[event.level])}>{event.message}</span>
        </li>
      ))}
    </ol>
  );
}
