'use client';

import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { ArenaSceneProps } from '../arena-contract';
import { layoutLabels, type LabelBox } from './label-layout';
import {
  LABEL_CHAR_WIDTH,
  LABEL_HALF_HEIGHT,
  LABEL_MAX_NUDGES,
  LABEL_NUDGE_STEP,
  MAX_LABELS,
} from './scene-constants';
import type { SceneRuntime } from './scene-entry';

const TMP_PROJECT = new THREE.Vector3();
/** Ứng viên nhãn, cấp phát một lần và dùng lại — vòng lặp vẽ không tạo object mới. */
const BOXES: LabelBox[] = [];
/** Trần số ứng viên. Gấp đôi số nhãn hiện được: đủ dư cho bước giãn, đủ ít để sắp xếp rẻ. */
const MAX_CANDIDATES = MAX_LABELS * 2;
const MAX_TEXT = 26;

const PRIORITY_SELECTED = 1000;
const PRIORITY_HOVERED = 900;
const PRIORITY_FAILING = 600;
const PRIORITY_OTHER_KIND = 400;
const PRIORITY_POD = 200;

export interface SceneLabelsProps {
  readonly runtime: SceneRuntime;
  readonly propsRef: RefObject<ArenaSceneProps>;
  /**
   * Phần tử chứa nhãn, truyền dưới dạng GIÁ TRỊ chứ không phải ref.
   *
   * Một `RefObject` có thể còn `null` đúng lúc effect dưới đây chạy, và effect
   * đó sẽ không bao giờ chạy lại — nhãn biến mất vĩnh viễn mà không có lỗi nào.
   * Giá trị thì đánh thức được effect khi nó xuất hiện.
   */
  readonly layer: HTMLDivElement | null;
}

function box(index: number): LabelBox {
  let existing = BOXES[index];
  if (existing === undefined) {
    existing = {
      uid: '',
      text: '',
      x: 0,
      y: 0,
      priority: 0,
      halfWidth: 0,
      halfHeight: 0,
      visible: false,
    };
    BOXES[index] = existing;
  }
  return existing;
}

function shorten(text: string): string {
  return text.length <= MAX_TEXT ? text : `${text.slice(0, MAX_TEXT - 1)}…`;
}

/**
 * Nhãn tên, chiếu ra toạ độ màn hình rồi GIÃN cho không chồng nhau.
 *
 * Nhãn là `<span>` trong một lớp DOM nổi chứ không phải sprite trong cảnh: chữ
 * DOM sắc nét ở mọi mức phóng, đọc được bằng trình đọc màn hình, và không tốn
 * một texture atlas nào. Vòng lặp chỉ GHI `transform` — kích thước khung lấy từ
 * `useThree(size)`, nên không có lần đọc bố cục nào trong lúc vẽ.
 */
export function SceneLabels({ runtime, propsRef, layer }: SceneLabelsProps): null {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const poolRef = useRef<HTMLSpanElement[]>([]);

  useEffect(() => {
    if (layer === null) {
      return;
    }
    const pool: HTMLSpanElement[] = [];
    for (let i = 0; i < MAX_LABELS; i += 1) {
      const span = document.createElement('span');
      span.className =
        'pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-sm bg-slate-950/70 px-1 ' +
        'py-px font-mono text-[10px] leading-4 text-slate-100 ring-1 ring-white/10';
      span.style.display = 'none';
      span.style.willChange = 'transform';
      layer.appendChild(span);
      pool.push(span);
    }
    poolRef.current = pool;
    return () => {
      for (const span of pool) {
        span.remove();
      }
      poolRef.current = [];
    };
  }, [layer]);

  useFrame(() => {
    const pool = poolRef.current;
    if (pool.length === 0 || size.width === 0 || size.height === 0) {
      return;
    }
    const current = propsRef.current;
    let count = 0;

    const push = (
      uid: string,
      text: string,
      x: number,
      y: number,
      z: number,
      base: number,
    ): void => {
      if (count >= MAX_CANDIDATES) {
        return;
      }
      TMP_PROJECT.set(x, y, z).project(camera);
      if (TMP_PROJECT.z > 1) {
        return;
      }
      const target = box(count);
      target.uid = uid;
      target.text = shorten(text);
      target.x = (TMP_PROJECT.x * 0.5 + 0.5) * size.width;
      target.y = (-TMP_PROJECT.y * 0.5 + 0.5) * size.height;
      target.halfWidth = (target.text.length * LABEL_CHAR_WIDTH) / 2 + 4;
      target.halfHeight = LABEL_HALF_HEIGHT;
      // Vật ở gần thắng vật ở xa khi cùng hạng: nhãn của thứ đang che mặt tiền
      // mà bị ẩn để nhường cho thứ khuất phía sau thì đọc ra là lỗi.
      target.priority = base - TMP_PROJECT.z * 100;
      count += 1;
    };

    // Hai lượt: lượt đầu lấy thứ QUAN TRỌNG (đang chọn, đang rê, đang lỗi, và
    // mọi tài nguyên không phải Pod), lượt sau mới lấp bằng Pod bình thường.
    // Không có bước này thì 200 pod khoẻ mạnh chiếm hết chỗ và pod đang hỏng —
    // thứ duy nhất người chơi cần thấy tên — bị đẩy ra ngoài.
    for (let pass = 0; pass < 2; pass += 1) {
      for (const entry of runtime.visible) {
        const important =
          entry.uid === current.selectedUid ||
          entry.uid === current.hoveredUid ||
          entry.failing ||
          entry.kind !== 'Pod';
        if ((pass === 0) !== important) {
          continue;
        }
        const base =
          entry.uid === current.selectedUid
            ? PRIORITY_SELECTED
            : entry.uid === current.hoveredUid
              ? PRIORITY_HOVERED
              : entry.failing
                ? PRIORITY_FAILING
                : entry.kind === 'Pod'
                  ? PRIORITY_POD
                  : PRIORITY_OTHER_KIND;
        push(entry.uid, entry.label, entry.x, entry.drawY + entry.drawScale * 0.8, entry.z, base);
      }
    }

    layoutLabels(BOXES, count, {
      maxLabels: MAX_LABELS,
      viewWidth: size.width,
      viewHeight: size.height,
      nudgeStep: LABEL_NUDGE_STEP,
      maxNudges: LABEL_MAX_NUDGES,
    });

    let shown = 0;
    for (let i = 0; i < count && shown < pool.length; i += 1) {
      const candidate = BOXES[i];
      if (candidate === undefined || !candidate.visible) {
        continue;
      }
      const span = pool[shown];
      if (span === undefined) {
        break;
      }
      if (span.textContent !== candidate.text) {
        span.textContent = candidate.text;
      }
      span.style.display = 'block';
      span.style.transform = `translate3d(${candidate.x.toFixed(1)}px, ${candidate.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      shown += 1;
    }
    for (let i = shown; i < pool.length; i += 1) {
      const span = pool[i];
      if (span !== undefined && span.style.display !== 'none') {
        span.style.display = 'none';
      }
    }
  });

  return null;
}
