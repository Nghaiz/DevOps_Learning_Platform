'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  ReactNode,
} from 'react';
import { cn } from '../cn.ts';

const DEFAULT_MIN_RATIO = 0.2;
const DEFAULT_MAX_RATIO = 0.8;
const DEFAULT_RATIO = 0.5;
const KEYBOARD_STEP = 0.02;

/**
 * `horizontal` = hai khoang cạnh nhau (trái/phải). `vertical` = xếp chồng
 * (trên/dưới), cho màn hẹp.
 */
export type SplitOrientation = 'horizontal' | 'vertical';

export interface SplitPaneProps {
  /** Khoang đầu: bên trái khi `horizontal`, bên trên khi `vertical`. */
  readonly left: ReactNode;
  /** Khoang sau: bên phải khi `horizontal`, bên dưới khi `vertical`. */
  readonly right: ReactNode;
  readonly defaultRatio?: number;
  readonly storageKey?: string;
  readonly minRatio?: number; // mặc định 0.2
  readonly maxRatio?: number; // mặc định 0.8
  readonly className?: string;
  /** Mặc định `horizontal`. Đổi hướng KHÔNG dựng lại hai khoang. */
  readonly orientation?: SplitOrientation;
  /** Tên khả truy cập của thanh chia. */
  readonly separatorLabel?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readStoredRatio(storageKey: string, min: number, max: number): number | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return null;
    const parsed = Number.parseFloat(raw);
    if (Number.isNaN(parsed)) return null;
    return clamp(parsed, min, max);
  } catch {
    return null;
  }
}

function writeStoredRatio(storageKey: string | undefined, ratio: number): void {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, String(ratio));
  } catch {
    // Storage bị chặn hoặc đầy: bố cục vẫn chạy trong phiên này, chỉ không nhớ được.
  }
}

/**
 * Hai khoang chia bằng một thanh kéo được.
 *
 * ⛔ Cây DOM GIỐNG HỆT nhau ở cả hai hướng: [khoang đầu, thanh chia, khoang
 * sau]. Đổi hướng chỉ đổi class và trục của `flex-basis`, nên terminal nằm ở
 * khoang sau không bị React gỡ ra rồi gắn lại (gỡ ra là đóng WebSocket).
 *
 * Tỉ lệ đã lưu được đọc trong effect, không trong `useState(() => …)`: trang
 * render ở server trước, nơi không có `localStorage`, và đọc lúc dựng state là
 * hai cây khác nhau giữa server và client. Mỗi hướng nhớ một tỉ lệ riêng
 * (`<storageKey>:vertical`), vì tỉ lệ ngang không có nghĩa gì khi xếp chồng.
 */
export function SplitPane(props: SplitPaneProps): ReactElement {
  const {
    left,
    right,
    defaultRatio = DEFAULT_RATIO,
    storageKey,
    minRatio = DEFAULT_MIN_RATIO,
    maxRatio = DEFAULT_MAX_RATIO,
    className,
    orientation = 'horizontal',
    separatorLabel = 'Kéo để đổi cỡ hai khung',
  } = props;

  const vertical = orientation === 'vertical';
  const key = storageKey === undefined ? undefined : vertical ? `${storageKey}:vertical` : storageKey;
  const fallback = clamp(defaultRatio, minRatio, maxRatio);

  const [ratio, setRatio] = useState<number>(fallback);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRatio(key === undefined ? fallback : (readStoredRatio(key, minRatio, maxRatio) ?? fallback));
  }, [key, fallback, minRatio, maxRatio]);

  const commitRatio = useCallback(
    (next: number): number => {
      const clamped = clamp(next, minRatio, maxRatio);
      setRatio(clamped);
      return clamped;
    },
    [minRatio, maxRatio],
  );

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    // Pointer capture giữ luồng kéo khi con trỏ rời thanh chia, và chạy luôn cho cảm ứng.
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const span = vertical ? rect.height : rect.width;
      if (span <= 0) return;
      const offset = vertical ? event.clientY - rect.top : event.clientX - rect.left;
      commitRatio(offset / span);
    },
    [isDragging, commitRatio, vertical],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      setIsDragging(false);
      // Ghi một lần lúc thả: `pointermove` bắn hàng chục lần mỗi giây.
      writeStoredRatio(key, ratio);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Đã tự nhả (phần tử bị gỡ giữa lúc kéo).
      }
    },
    [isDragging, ratio, key],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const back = vertical ? 'ArrowUp' : 'ArrowLeft';
      const forward = vertical ? 'ArrowDown' : 'ArrowRight';
      let next: number;
      switch (event.key) {
        case back:
          next = ratio - KEYBOARD_STEP;
          break;
        case forward:
          next = ratio + KEYBOARD_STEP;
          break;
        case 'Home':
          next = minRatio;
          break;
        case 'End':
          next = maxRatio;
          break;
        default:
          return;
      }
      event.preventDefault();
      writeStoredRatio(key, commitRatio(next));
    },
    [ratio, minRatio, maxRatio, commitRatio, key, vertical],
  );

  const percent = Math.round(ratio * 100);

  return (
    <div
      ref={containerRef}
      data-orientation={orientation}
      className={cn(
        'flex h-full min-h-0 w-full min-w-0',
        vertical ? 'flex-col' : 'flex-row',
        isDragging && 'select-none',
        className,
      )}
    >
      <div
        className="min-h-0 min-w-0 overflow-auto"
        style={{ flexBasis: `${percent}%`, flexGrow: 0, flexShrink: 0 }}
      >
        {left}
      </div>
      <div
        role="separator"
        aria-orientation={vertical ? 'horizontal' : 'vertical'}
        aria-valuenow={percent}
        aria-valuemin={Math.round(minRatio * 100)}
        aria-valuemax={Math.round(maxRatio * 100)}
        aria-label={separatorLabel}
        tabIndex={0}
        className={cn(
          'shrink-0 grow-0 touch-none bg-border transition-colors duration-[var(--motion-fast)] ease-out',
          'hover:bg-foreground focus-visible:bg-ring focus-visible:outline-none',
          isDragging && 'bg-foreground',
          vertical ? 'h-1.5 w-full cursor-row-resize' : 'w-1.5 cursor-col-resize',
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
      />
      {/* `min-w-0`/`min-h-0` bắt buộc: xterm đặt bề rộng nội dung cố định, và thiếu
          hai lớp này thì khoang sau không co được dưới bề rộng đó. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{right}</div>
    </div>
  );
}
