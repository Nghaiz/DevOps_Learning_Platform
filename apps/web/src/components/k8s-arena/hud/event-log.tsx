'use client';

import { useEffect, useRef, type ReactElement } from 'react';
import type { EventView } from '@devops-platform/games';
import { cn } from '@devops-platform/ui';
import { PanelFrame } from './inspector-frame.tsx';
import { EVENT_LEVEL_CLASS, EVENT_LEVEL_LABEL } from './inspector-types.ts';

/** Bao nhiêu dòng gần nhất còn giữ. Nhật ký dài vô hạn là một rò rỉ bộ nhớ chậm. */
const MAX_LINES = 60;

/** Coi là "đang ở đáy" nếu còn cách đáy dưới ngần này pixel. */
const PIN_THRESHOLD_PX = 24;

export interface EventLogProps {
  readonly events: readonly EventView[];
  readonly onClose: () => void;
  readonly className?: string;
}

/**
 * Nhật ký sự kiện cụm — bật bằng phím `L` (`ARENA_KEYS.toggleEventLog`), VÀ là
 * vùng `aria-live` của cả màn chơi.
 *
 * ## Một vùng sống, không phải hai
 *
 * Cám dỗ ở đây là dựng thêm một `<div class="sr-only" aria-live>` riêng để đọc
 * thông báo, bên cạnh nhật ký nhìn thấy được. Đó là một lỗi: hai vùng sống cùng
 * mang một nội dung thì trình đọc màn hình đọc mọi thứ HAI LẦN. Nhật ký này
 * chính là vùng sống, và mỗi dòng chỉ tồn tại một bản. Bản cũ đã chốt đúng như
 * vậy và có test e2e gác (`playground.flow.spec.ts` khẳng định trang chỉ có
 * ĐÚNG MỘT `[aria-live="polite"]`) — lane nào định thêm vùng sống thứ hai vào
 * khu vực HUD phải đổi chỗ này trước, không thêm song song.
 *
 * `role="log"` là vai đúng cho một dòng chảy chỉ-thêm theo thời gian; nó ngụ ý
 * `aria-live="polite"` nhưng vẫn khai tường minh vì `aria-relevant` mặc định của
 * `log` khác nhau giữa các bộ đọc.
 */
export function EventLog({ events, onClose, className }: EventLogProps): ReactElement {
  const scrollRef = useRef<HTMLOListElement>(null);
  const pinnedRef = useRef(true);

  const recent = events.length > MAX_LINES ? events.slice(events.length - MAX_LINES) : events;

  useEffect(() => {
    const el = scrollRef.current;
    // Chỉ tự cuộn khi người dùng ĐANG ở đáy. Cuộn lên đọc một sự kiện cũ rồi bị
    // giật xuống đáy sau mỗi tick là cách nhanh nhất làm một nhật ký thành vô dụng.
    if (el !== null && pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [recent.length]);

  return (
    <PanelFrame
      title="Nhật ký sự kiện"
      closeLabel="Đóng nhật ký sự kiện"
      onClose={onClose}
      className={cn(
        'absolute bottom-3 left-1/2 z-20 h-56 w-128 max-w-[calc(100%-1.5rem)] -translate-x-1/2',
        className,
      )}
    >
      {/*
        ⚠ `tabIndex={0}` trên CHÍNH vùng cuộn — axe `scrollable-region-focusable`.
        Một khối cuộn được mà không focus được thì người chỉ dùng bàn phím không
        bao giờ đọc tới được phần dưới của nó, và nhật ký chính là chỗ người chơi
        chẩn đoán sự cố. Đặt `overflow` + `tabIndex` lên chính `<ol role="log">`
        chứ không lên một div bọc ngoài: `<ol>` đã có tên khả truy sẵn, nên không
        phải bịa thêm một vai và một nhãn thứ hai chỉ để làm hài lòng luật.
      */}
      <ol
        ref={scrollRef}
        tabIndex={0}
        onScroll={(event) => {
          const el = event.currentTarget;
          pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD_PX;
        }}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label="Nhật ký sự kiện của cụm"
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {recent.map((event, index) => (
          // Khoá gồm cả chỉ số: hai sự kiện cùng tick với cùng nội dung là chuyện
          // bình thường (hai pod hỏng cùng lúc vì cùng một nguyên nhân), và khoá
          // trùng sẽ làm React bỏ qua dòng thứ hai — vùng sống khi đó im lặng
          // đúng lúc có nhiều tin nhất.
          <li key={`${String(event.tick)}-${String(index)}-${event.message}`} className="flex gap-2 text-xs">
            <span aria-hidden="true" className="shrink-0 font-mono text-[11px] text-muted-foreground">
              t{event.tick}
            </span>
            <span className="sr-only">{EVENT_LEVEL_LABEL[event.level]}:</span>
            <span className={cn('min-w-0', EVENT_LEVEL_CLASS[event.level])}>{event.message}</span>
          </li>
        ))}
      </ol>
      {recent.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-muted-foreground">Chưa có sự kiện nào.</p>
      ) : null}
    </PanelFrame>
  );
}
