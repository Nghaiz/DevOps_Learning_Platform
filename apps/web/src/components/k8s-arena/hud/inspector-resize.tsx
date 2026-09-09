'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';
import { STORAGE_KEY_PREFIX } from '@devops-platform/games';
import { cn } from '@devops-platform/ui';

/**
 * Khoảng bề rộng của bảng thông số, đơn vị px.
 *
 * `fallback` 420 chọn theo phép đo chứ không theo cảm giác: khối căn cột của
 * `kubectl describe` rộng ~40–50 ký tự, ở `text-xs` mono (~7.2px/ký tự) là
 * ~360px nội dung; cộng viền bảng, `px-3` của tab và `p-2` của khối `<pre>` là
 * ~60px chrome. 420 vừa đủ để KHÔNG dòng căn cột nào phải xuống dòng — đúng thứ
 * làm `describe` đọc được. Bản đầu để 352px (`w-88`) và đó là lý do nó chật.
 *
 * `max` 720 chứ không phải "bao nhiêu cũng được": bảng rộng quá thì cảnh 3D —
 * thứ chính của màn hình — bị đẩy thành một dải hẹp.
 */
export const INSPECTOR_WIDTH = { min: 360, max: 720, fallback: 420, step: 24 } as const;

/** Chừa lại ngần này px cho cảnh khi màn hình hẹp hơn cả `max`. */
const VIEWPORT_RESERVE = 48;

const WIDTH_KEY = `${STORAGE_KEY_PREFIX}k8s.arena.inspectorWidth`;

function clamp(px: number): number {
  const ceiling =
    typeof window === 'undefined'
      ? INSPECTOR_WIDTH.max
      : Math.min(
          INSPECTOR_WIDTH.max,
          Math.max(INSPECTOR_WIDTH.min, window.innerWidth - VIEWPORT_RESERVE),
        );
  return Math.round(Math.min(ceiling, Math.max(INSPECTOR_WIDTH.min, px)));
}

/**
 * Bề rộng bảng, nhớ qua `localStorage`.
 *
 * Đọc trong `useEffect` chứ không trong bộ khởi tạo lười của `useState`: bộ khởi
 * tạo chạy CẢ trên máy chủ, nơi không có `localStorage`, nên client sẽ dựng ra
 * một cây khác server và React báo lệch hydrate. Cái giá là một khung hình ở bề
 * rộng mặc định trước khi giá trị đã nhớ áp vào — mà bảng chỉ xuất hiện sau một
 * cú bấm của người dùng, nên khung hình đó không ai thấy.
 *
 * Mọi truy cập bọc `try`: chế độ riêng tư và thiết lập chặn site-data làm
 * `localStorage` NÉM ngay khi đọc thuộc tính, không phải trả `null`. Không bọc
 * thì cả bảng thông số sập vì một tiện nghi.
 */
export function useInspectorWidth(): {
  readonly width: number;
  readonly setWidth: (px: number) => void;
} {
  const [width, setStored] = useState<number>(INSPECTOR_WIDTH.fallback);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WIDTH_KEY);
      const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
      if (Number.isFinite(parsed)) {
        setStored(clamp(parsed));
      }
    } catch {
      // Không đọc được thì giữ mặc định — không có gì để báo cho người dùng.
    }
  }, []);

  const setWidth = useCallback((px: number) => {
    const next = clamp(px);
    setStored(next);
    try {
      localStorage.setItem(WIDTH_KEY, String(next));
    } catch {
      // Ghi hỏng thì bề rộng vẫn đúng trong phiên này, chỉ là không nhớ sang lần sau.
    }
  }, []);

  return { width, setWidth };
}

export interface InspectorResizeHandleProps {
  readonly width: number;
  readonly onWidth: (px: number) => void;
}

/**
 * Mép trái kéo được để đổi bề rộng bảng.
 *
 * `role="separator"` + `aria-valuenow/min/max` + `tabIndex={0}` là khuôn "window
 * splitter" của WAI-ARIA. Có nó thì mũi tên trái/phải đổi bề rộng được bằng bàn
 * phím — không có thì đây là một tính năng chỉ người dùng chuột với tới, tức là
 * một nửa yêu cầu truy cập bàn phím của lane bị bỏ.
 *
 * `setPointerCapture` để con trỏ đi ra ngoài phần tử giữa lúc kéo vẫn tiếp tục
 * bắn `pointermove` về đây; không có nó thì kéo nhanh là mất dấu và bảng dừng
 * giữa chừng.
 */
export function InspectorResizeHandle({
  width,
  onWidth,
}: InspectorResizeHandleProps): ReactElement {
  const dragRef = useRef<{ readonly startX: number; readonly startWidth: number } | null>(null);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { startX: event.clientX, startWidth: width };
    },
    [width],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (drag !== null) {
        // Mép TRÁI: kéo sang trái ⇒ rộng ra, nên hiệu là `startX - clientX`.
        onWidth(drag.startWidth + (drag.startX - event.clientX));
      }
    },
    [onWidth],
  );

  const endDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }
      event.preventDefault();
      onWidth(width + (event.key === 'ArrowLeft' ? INSPECTOR_WIDTH.step : -INSPECTOR_WIDTH.step));
    },
    [onWidth, width],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Đổi bề rộng bảng thông số"
      aria-valuenow={width}
      aria-valuemin={INSPECTOR_WIDTH.min}
      aria-valuemax={INSPECTOR_WIDTH.max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      className={cn(
        'absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize touch-none',
        'transition-colors hover:bg-ring/40 focus-visible:bg-ring focus-visible:outline-none',
      )}
    />
  );
}
