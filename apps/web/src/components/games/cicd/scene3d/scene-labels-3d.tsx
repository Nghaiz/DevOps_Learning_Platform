'use client';

/**
 * Nhãn tên job: pool `<span>` DOM chiếu tay, trần 64 (19.D.3.5).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ KHÔNG `drei <Html>`, KHÔNG `troika-three-text`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kế hoạch D.3.5 loại cả hai, mỗi cái một lý do đo được:
 *
 * - `<Html occlude="blending">` bị ẩn khi cảnh có pass hậu kỳ. Cảnh này hiện
 *   không có pass nào, nhưng ràng buộc vẫn giữ: một cái bẫy chỉ nổ khi ai đó
 *   thêm hậu kỳ về sau là một cái bẫy tệ hơn hẳn một cái nổ ngay.
 * - `troika-three-text` chưa có trong repo và cổng `pnpm bundle:check` đang gác
 *   kích thước bundle — thêm một thư viện chữ cho một việc mà `<span>` làm được
 *   là tự đi vào cổng đó.
 *
 * `<span>` DOM còn thắng ở hai chỗ mà sprite không có: chữ sắc nét ở mọi mức
 * phóng, và trình đọc màn hình thấy được. Canvas WebGL là một ô đen với trình
 * đọc màn hình — nếu tên job chỉ tồn tại trong texture thì nó không tồn tại với
 * người dùng đọc màn hình.
 *
 * ⛔ **Đây KHÔNG phải đường đếm node của AC-D1.** Pool có trần 64 và bước giãn
 * còn loại tiếp, nên số `<span>` KHÔNG bằng số node được vẽ. Thuộc tính
 * `data-cicd-node` đặt trên span là để e2e trỏ được vào MỘT nhãn cụ thể, không
 * phải để đếm. Bộ đếm nằm ở `cicd-scene-3d.tsx`.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { InstanceKey } from '@devops-platform/games';

import { CICD_NODE_ATTR, CICD_NODE_STATE_ATTR } from '../scene-props';
import { layoutLabels, type LabelBox } from '../../../k8s-arena/scene/label-layout';
import { NODE_HALF } from './scene-3d-math';
import {
  MAX_CICD_LABELS,
  MAX_CICD_LABEL_CANDIDATES,
  isPrimaryLabelPass,
  labelPriority,
  labelText,
} from './label-priority';
import type { SceneDraw } from './scene-draw';

const PROJECT = new THREE.Vector3();
/** Ứng viên nhãn, cấp phát một lần và dùng lại — vòng lặp vẽ không tạo object mới. */
const BOXES: LabelBox[] = [];
/** Bề rộng trung bình một ký tự ở cỡ chữ của nhãn, pixel. */
const CHAR_WIDTH = 6.4;
const HALF_HEIGHT = 9;
const NUDGE_STEP = 14;
const MAX_NUDGES = 4;
/** Nhãn nổi trên đỉnh khối bao nhiêu, đơn vị thế giới. */
const LABEL_LIFT = NODE_HALF.y + 0.26;

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

export interface SceneLabels3dProps {
  readonly draw: SceneDraw;
  readonly selectedId: InstanceKey | null;
  readonly hoveredId: InstanceKey | null;
  /**
   * Lớp DOM chứa nhãn, truyền dưới dạng GIÁ TRỊ chứ không phải ref.
   *
   * Một `RefObject` có thể còn `null` đúng lúc effect dưới đây chạy, và effect
   * đó sẽ không bao giờ chạy lại — nhãn biến mất vĩnh viễn mà không có lỗi nào.
   * Giá trị thì đánh thức được effect khi nó xuất hiện. (Bẫy này đã cắn arena.)
   */
  readonly layer: HTMLDivElement | null;
}

export function SceneLabels3d({
  draw,
  selectedId,
  hoveredId,
  layer,
}: SceneLabels3dProps): null {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const poolRef = useRef<HTMLSpanElement[]>([]);

  useEffect(() => {
    if (layer === null) {
      return;
    }
    const pool: HTMLSpanElement[] = [];
    for (let i = 0; i < MAX_CICD_LABELS; i += 1) {
      const span = document.createElement('span');
      span.className =
        'pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-sm bg-background/80 ' +
        'px-1 py-px font-mono text-[10px] leading-4 text-foreground ring-1 ring-border';
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
    let count = 0;

    /*
     * Hai lượt: lượt đầu lấy thứ ĐÒI HÀNH ĐỘNG, lượt sau mới lấp bằng phần còn
     * lại. Không có bước này thì ở một level lớn, 128 ứng viên đầu tiên có thể
     * toàn node `passed` và node đang đỏ — thứ duy nhất người chơi cần thấy tên
     * — không bao giờ lọt vào danh sách.
     */
    for (let pass = 0; pass < 2; pass += 1) {
      for (const node of draw.nodes) {
        if (count >= MAX_CICD_LABEL_CANDIDATES) {
          break;
        }
        const input = { id: node.id, state: node.state, selectedId, hoveredId };
        if (isPrimaryLabelPass(input) !== (pass === 0)) {
          continue;
        }
        PROJECT.set(node.world.x, node.world.y + LABEL_LIFT, node.world.z).project(camera);
        if (PROJECT.z > 1) {
          continue;
        }
        const target = box(count);
        target.uid = node.id;
        target.text = labelText(node.icon, node.name);
        target.x = (PROJECT.x * 0.5 + 0.5) * size.width;
        target.y = (-PROJECT.y * 0.5 + 0.5) * size.height;
        target.halfWidth = (target.text.length * CHAR_WIDTH) / 2 + 4;
        target.halfHeight = HALF_HEIGHT;
        target.priority = labelPriority(input);
        count += 1;
      }
    }

    layoutLabels(BOXES, count, {
      maxLabels: MAX_CICD_LABELS,
      viewWidth: size.width,
      viewHeight: size.height,
      nudgeStep: NUDGE_STEP,
      maxNudges: MAX_NUDGES,
    });

    const stateById = draw.nodes;
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
      if (span.getAttribute(CICD_NODE_ATTR) !== candidate.uid) {
        span.setAttribute(CICD_NODE_ATTR, candidate.uid);
        const node = stateById.find((n) => n.id === candidate.uid);
        if (node !== undefined) {
          span.setAttribute(CICD_NODE_STATE_ATTR, node.state);
          span.title = node.ariaLabel;
        }
      }
      if (span.style.display !== 'block') {
        span.style.display = 'block';
      }
      const transform = `translate3d(${candidate.x.toFixed(1)}px, ${candidate.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      if (span.style.transform !== transform) {
        span.style.transform = transform;
      }
      shown += 1;
    }
    for (let i = shown; i < pool.length; i += 1) {
      const span = pool[i];
      if (span !== undefined && span.style.display !== 'none') {
        span.style.display = 'none';
        span.removeAttribute(CICD_NODE_ATTR);
        span.removeAttribute(CICD_NODE_STATE_ATTR);
      }
    }
  });

  return null;
}
