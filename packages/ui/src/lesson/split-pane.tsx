'use client';

import { useCallback, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from 'react';
import { cn } from '../cn.ts';

const DEFAULT_MIN_RATIO = 0.2;
const DEFAULT_MAX_RATIO = 0.8;
const DEFAULT_RATIO = 0.5;
/** Mỗi lần nhấn phím mũi tên đổi 2 điểm phần trăm — đủ thô để cảm nhận được,
 * đủ mịn để không nhảy cóc qua vùng làm việc mong muốn. */
const KEYBOARD_STEP = 0.02;

export interface SplitPaneProps {
  readonly left: ReactNode;
  readonly right: ReactNode;
  /** Tỉ lệ bề rộng khoang TRÁI, 0..1. Mặc định 0.5. */
  readonly defaultRatio?: number;
  /** Khoá localStorage để nhớ tỉ lệ giữa các lần vào. Bỏ trống = không lưu. */
  readonly storageKey?: string;
  readonly minRatio?: number; // mặc định 0.2
  readonly maxRatio?: number; // mặc định 0.8
  readonly className?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Đọc tỉ lệ đã lưu từ localStorage. Bọc try/catch vì `localStorage` NÉM trong
 * một số chế độ riêng tư (Safari private mode, iframe sandbox mất quyền
 * storage, v.v.) — một component bố cục thuần không được phép sập cả trang vì
 * một API lưu-trữ vốn chỉ mang tính "tiện thêm".
 */
function readStoredRatio(
  storageKey: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!storageKey) return fallback;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return fallback;
    const parsed = Number.parseFloat(raw);
    if (Number.isNaN(parsed)) return fallback;
    return clamp(parsed, min, max);
  } catch {
    return fallback;
  }
}

function writeStoredRatio(storageKey: string | undefined, ratio: number): void {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, String(ratio));
  } catch {
    // Storage bị chặn/đầy — bỏ qua, layout vẫn dùng được trong phiên hiện tại,
    // chỉ là không nhớ được tỉ lệ cho lần sau.
  }
}

/**
 * Khoang chia đôi màn hình: bài học markdown bên trái, terminal xterm bên
 * phải. Terminal tự cài `ResizeObserver` riêng và tự fit lại (debounce 50ms —
 * xem `packages/terminal/src/terminal-core.ts`), nên component này CHỈ có
 * nhiệm vụ cấp một CSS box thật cho từng khoang; không được tự vẽ lại nội
 * dung terminal hay tự ước lượng cols/rows.
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
  } = props;

  const [ratio, setRatio] = useState<number>(() =>
    readStoredRatio(storageKey, minRatio, maxRatio, clamp(defaultRatio, minRatio, maxRatio)),
  );
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const commitRatio = useCallback(
    (next: number): number => {
      const clamped = clamp(next, minRatio, maxRatio);
      setRatio(clamped);
      return clamped;
    },
    [minRatio, maxRatio],
  );

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    // `setPointerCapture` thay vì mousedown + listener trên `window`: giữ được
    // luồng sự kiện drag ngay cả khi con trỏ rời khỏi thanh chia lúc kéo
    // nhanh, và hoạt động luôn cho cảm ứng (không cần code touchmove riêng).
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      commitRatio((event.clientX - rect.left) / rect.width);
    },
    [isDragging, commitRatio],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      setIsDragging(false);
      // Ghi localStorage ĐÚNG một lần lúc thả — `pointermove` bắn hàng chục
      // lần/giây, ghi ở mỗi lần là I/O đồng bộ thừa vô ích.
      writeStoredRatio(storageKey, ratio);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Đã tự nhả (phần tử unmount giữa chừng khi đang kéo) — bỏ qua.
      }
    },
    [isDragging, ratio, storageKey],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      let next: number;
      switch (event.key) {
        case 'ArrowLeft':
          next = ratio - KEYBOARD_STEP;
          break;
        case 'ArrowRight':
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
      // Chặn cuộn trang mặc định của Home/End/mũi tên khi thanh chia đang focus.
      event.preventDefault();
      const clamped = commitRatio(next);
      // Mỗi lần nhấn phím là một bước "chốt" rời rạc (khác `pointermove` liên
      // tục), nên ghi lưu ngay tại đây — không cần đợi một sự kiện "thả" riêng.
      writeStoredRatio(storageKey, clamped);
    },
    [ratio, minRatio, maxRatio, commitRatio, storageKey],
  );

  const percent = Math.round(ratio * 100);

  return (
    <div
      ref={containerRef}
      className={cn('flex h-full min-h-0 w-full min-w-0', isDragging && 'select-none', className)}
    >
      <div
        className="min-h-0 min-w-0 overflow-auto"
        style={{ flexBasis: `${percent}%`, flexGrow: 0, flexShrink: 0 }}
      >
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={percent}
        aria-valuemin={Math.round(minRatio * 100)}
        aria-valuemax={Math.round(maxRatio * 100)}
        aria-label="Kéo để đổi tỉ lệ hai khoang"
        tabIndex={0}
        className="w-1.5 shrink-0 grow-0 cursor-col-resize touch-none bg-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
      />
      {/* `min-w-0` là BẮT BUỘC: mặc định một flex item không co được xuống dưới
          bề rộng nội dung của nó, và terminal xterm bên trong đặt bề rộng nội
          dung cố định (số cột × bề rộng font). Thiếu dòng này thì khoang phải
          "đứng lì" ở một mức tối thiểu khi kéo — bẫy flexbox kinh điển. `min-h-0`
          tương tự cho trục dọc, để `ResizeObserver` của terminal đo đúng chiều
          cao thay vì bị nội dung đẩy tràn ra ngoài khung. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{right}</div>
    </div>
  );
}
