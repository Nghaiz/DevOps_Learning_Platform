'use client';

/**
 * Zoom + pan của cảnh 2D, **bằng cả bàn phím lẫn chuột** (19.D.2.1).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ZOOM BẰNG `transform` CỦA MỘT `<g>`, KHÔNG BẰNG CÁCH SỬA `viewBox`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `viewBox` giữ nguyên bằng `bounds` của phép đặt chỗ (D.2.1 đòi "viewBox tự
 * khớp bounds"), còn zoom/pan là một `translate(tx ty) scale(s)` trên nhóm nội
 * dung. Hai hệ quả:
 *
 * 1. `preserveAspectRatio` vẫn làm việc của nó — cảnh luôn vừa khung ở mức
 *    zoom 1, kể cả khi khung đổi cỡ, mà không cần đo lại gì.
 * 2. Trạng thái zoom là ba con số ĐỘC LẬP với cỡ khung. Sửa `viewBox` thì mỗi
 *    lần cửa sổ đổi cỡ phải tính lại cả bốn số, và một lần tính sai làm cảnh
 *    nhảy — lỗi chỉ lộ khi có người kéo cửa sổ.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ `getScreenCTM()` KHÔNG CÓ TRONG jsdom
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Phép đổi toạ độ chuột → toạ độ SVG cần `getScreenCTM()`, và jsdom không cài
 * nó (nó cũng trả `null` khi phần tử chưa được bố trí). Không có đường lùi thì
 * mọi test DOM chạm tới zoom sẽ ném — và cái ném đó xảy ra trong một handler
 * sự kiện, nơi React nuốt nó thành một lỗi khó lần.
 *
 * Đường lùi: zoom quanh TÂM khung. Nó không đúng bằng zoom-quanh-con-trỏ nhưng
 * nó đúng về mặt chức năng, và nó là thứ phím `+`/`-` vẫn dùng kể cả trên trình
 * duyệt thật (bàn phím không có con trỏ).
 */

import { useCallback, useMemo, useState, type PointerEvent, type WheelEvent } from 'react';
import type { ViewBox } from './cicd-scene-geometry';

export const MIN_SCALE = 0.35;
export const MAX_SCALE = 3.5;
/** Một nấc zoom bàn phím. */
export const ZOOM_STEP = 1.2;
/** Một nấc pan bàn phím, theo đơn vị `viewBox`. */
export const PAN_STEP = 90;

export interface Viewport {
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
}

const IDENTITY: Viewport = { scale: 1, tx: 0, ty: 0 };

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/** Zoom giữ nguyên điểm `(ax, ay)` (toạ độ `viewBox`) dưới con trỏ. */
export function zoomAround(current: Viewport, factor: number, ax: number, ay: number): Viewport {
  const scale = clampScale(current.scale * factor);
  if (scale === current.scale) return current;
  const wx = (ax - current.tx) / current.scale;
  const wy = (ay - current.ty) / current.scale;
  return { scale, tx: ax - wx * scale, ty: ay - wy * scale };
}

export interface SceneViewportApi {
  readonly viewport: Viewport;
  /** Chuỗi `transform` của nhóm nội dung. */
  readonly transform: string;
  readonly onWheel: (event: WheelEvent<SVGSVGElement>) => void;
  readonly onPointerDown: (event: PointerEvent<SVGSVGElement>) => void;
  readonly onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  readonly onPointerUp: (event: PointerEvent<SVGSVGElement>) => void;
  readonly panning: boolean;
  /** `true` khi phím đã được xử lý — bên gọi gọi `preventDefault()`. */
  readonly handleKey: (key: string) => boolean;
  readonly zoomBy: (factor: number) => void;
  readonly reset: () => void;
}

/**
 * ⚠ `box` chỉ dùng để tìm TÂM khung cho đường lùi zoom. Hook này cố ý không
 * đọc cỡ pixel thật của `<svg>` — đọc nó buộc phải có `ResizeObserver`, và
 * `viewBox` đã làm phép đổi tỉ lệ đó rồi.
 */
export function useSceneViewport(box: ViewBox): SceneViewportApi {
  const [viewport, setViewport] = useState<Viewport>(IDENTITY);
  const [panning, setPanning] = useState(false);

  const centre = useMemo<readonly [number, number]>(
    () => [box.x + box.width / 2, box.y + box.height / 2],
    [box.x, box.y, box.width, box.height],
  );

  /** Toạ độ `viewBox` của một sự kiện chuột, hoặc tâm khung khi không đổi được. */
  const toSvg = useCallback(
    (event: { clientX: number; clientY: number; currentTarget: SVGSVGElement }): readonly [number, number] => {
      const svg = event.currentTarget;
      const ctm = typeof svg.getScreenCTM === 'function' ? svg.getScreenCTM() : null;
      if (ctm === null || typeof svg.createSVGPoint !== 'function') return centre;
      const pt = svg.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const mapped = pt.matrixTransform(ctm.inverse());
      return [mapped.x, mapped.y];
    },
    [centre],
  );

  const onWheel = useCallback(
    (event: WheelEvent<SVGSVGElement>) => {
      const [ax, ay] = toSvg(event);
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      setViewport((v) => zoomAround(v, factor, ax, ay));
    },
    [toSvg],
  );

  const onPointerDown = useCallback((event: PointerEvent<SVGSVGElement>) => {
    // Chỉ nút trái, và chỉ khi bấm vào NỀN — bấm vào một node là chọn nó.
    if (event.button !== 0) return;
    if (event.target !== event.currentTarget) return;
    setPanning(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!panning) return;
      setViewport((v) => ({ ...v, tx: v.tx + event.movementX, ty: v.ty + event.movementY }));
    },
    [panning],
  );

  const onPointerUp = useCallback((event: PointerEvent<SVGSVGElement>) => {
    setPanning(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const [ax, ay] = centre;
      setViewport((v) => zoomAround(v, factor, ax, ay));
    },
    [centre],
  );

  const reset = useCallback(() => setViewport(IDENTITY), []);

  const handleKey = useCallback(
    (key: string): boolean => {
      if (key === '+' || key === '=') {
        zoomBy(ZOOM_STEP);
        return true;
      }
      if (key === '-' || key === '_') {
        zoomBy(1 / ZOOM_STEP);
        return true;
      }
      if (key === '0') {
        reset();
        return true;
      }
      if (key === 'ArrowLeft') {
        setViewport((v) => ({ ...v, tx: v.tx + PAN_STEP }));
        return true;
      }
      if (key === 'ArrowRight') {
        setViewport((v) => ({ ...v, tx: v.tx - PAN_STEP }));
        return true;
      }
      if (key === 'ArrowUp') {
        setViewport((v) => ({ ...v, ty: v.ty + PAN_STEP }));
        return true;
      }
      if (key === 'ArrowDown') {
        setViewport((v) => ({ ...v, ty: v.ty - PAN_STEP }));
        return true;
      }
      return false;
    },
    [reset, zoomBy],
  );

  return {
    viewport,
    transform: `translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    panning,
    handleKey,
    zoomBy,
    reset,
  };
}
