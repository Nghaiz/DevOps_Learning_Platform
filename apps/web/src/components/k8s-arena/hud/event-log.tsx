'use client';

import { useEffect, useRef, type ReactElement } from 'react';
import type { EventView } from '@devops-platform/games';
import { cn } from '@devops-platform/ui';
import { HIDDEN_SCROLL, PanelFrame } from './inspector-frame.tsx';
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
 * Nhật ký sự kiện cụm — bật bằng phím `L` (`ARENA_KEYS.toggleEventLog`).
 *
 * ## Bảng này KHÔNG phải vùng sống, và đó là chủ ý
 *
 * Bản đầu của lane C đặt `role="log"` + `aria-live="polite"` ngay trên `<ol>`
 * dưới đây. Hợp đồng đã chốt khác (`ARIA_LIVE_OWNER`, `arena-contract.ts`):
 * vùng thông báo là một vùng ẩn THƯỜNG TRỰC do `arena-root` dựng, vì nhật ký
 * mặc định TẮT — để vùng sống duy nhất nằm trong nó thì cụm chạy hoàn toàn câm
 * với trình đọc màn hình cho tới khi người dùng tự bấm `L`, mà họ không có cách
 * nào biết là cần bấm.
 *
 * ⚠ `role="log"` bị gỡ chứ không chỉ gỡ `aria-live`: vai `log` NGỤ Ý
 * `aria-live="polite"`, nên giữ nó lại là giữ nguyên vùng sống thứ hai dưới một
 * cái tên khác, và trình đọc màn hình sẽ đọc lặp mỗi dòng sự kiện.
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
        chẩn đoán sự cố. Đặt `overflow` + `tabIndex` lên chính `<ol>`
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
        aria-label="Nhật ký sự kiện của cụm"
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-1 px-3 py-2',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          HIDDEN_SCROLL,
        )}
      >
        {recent.map((event, index) => (
          // Khoá gồm cả chỉ số: hai sự kiện cùng tick với cùng nội dung là chuyện
          // bình thường (hai pod hỏng cùng lúc vì cùng một nguyên nhân), và khoá
          // trùng sẽ làm React bỏ qua dòng thứ hai — vùng sống khi đó im lặng
          // đúng lúc có nhiều tin nhất.
          <li
            key={`${String(event.tick)}-${String(index)}-${event.message}`}
            className="flex gap-2 text-xs"
          >
            <span
              aria-hidden="true"
              className="shrink-0 font-mono text-[11px] text-muted-foreground"
            >
              t{event.tick}
            </span>
            <span className="sr-only">{EVENT_LEVEL_LABEL[event.level]}:</span>
            {/* `wrap-break-word`: một thông điệp có từ đơn dài hơn cả bảng sẽ đẩy
                dòng rộng ra và đẻ thanh cuộn ngang — thứ bảng này không được có. */}
            <span className={cn('min-w-0 wrap-break-word', EVENT_LEVEL_CLASS[event.level])}>
              {event.message}
            </span>
          </li>
        ))}
      </ol>
      {recent.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-muted-foreground">Chưa có sự kiện nào.</p>
      ) : null}
    </PanelFrame>
  );
}
