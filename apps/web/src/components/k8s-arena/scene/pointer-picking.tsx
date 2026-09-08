'use client';

import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { ArenaSceneProps } from '../arena-contract';
import { CLICK_SLOP_PX, PICK_INTERVAL_MS } from './scene-constants';
import type { SceneRuntime } from './scene-entry';

const RAY = new THREE.Raycaster();
const NDC = new THREE.Vector2();
const HITS: THREE.Intersection[] = [];

export interface PointerPickingProps {
  readonly runtime: SceneRuntime;
  readonly propsRef: RefObject<ArenaSceneProps>;
  readonly bodyRef: RefObject<THREE.InstancedMesh | null>;
}

/**
 * Chọn và rê bằng chuột — tia dò chỉ bắn khi con trỏ THẬT SỰ di chuyển, và
 * không quá ~30 lần/giây.
 *
 * Bản của k8sgames.com bắn tia mỗi khung hình không tiết chế, kể cả khi con trỏ
 * đứng yên; với vài trăm instance thì phép đó chiếm một phần đáng kể ngân sách
 * khung hình để trả lời một câu hỏi mà câu trả lời không đổi.
 *
 * ⛔ KHÔNG dùng hệ sự kiện có sẵn của R3F cho việc này: nó gắn handler lên từng
 * object và bắn tia theo MỌI sự kiện chuột của DOM, không có cửa nào để tiết chế.
 * Ở đây một `Raycaster` ở tầm module bắn thẳng vào đúng một `InstancedMesh`, và
 * `instanceId` trả về tra ngược ra `uid` qua danh sách vẽ của khung hình vừa rồi.
 */
export function PointerPicking({ runtime, propsRef, bodyRef }: PointerPickingProps): null {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  useEffect(() => {
    const canvas = gl.domElement;
    let lastX = Number.NaN;
    let lastY = Number.NaN;
    let castAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let downX = 0;
    let downY = 0;
    let hovered: string | null = null;

    /** `uid` dưới con trỏ, hoặc `null`. Không cấp phát: mảng kết quả ở tầm module. */
    function pick(offsetX: number, offsetY: number): string | null {
      const mesh = bodyRef.current;
      if (mesh === null || mesh.count === 0 || size.width === 0 || size.height === 0) {
        return null;
      }
      NDC.set((offsetX / size.width) * 2 - 1, -(offsetY / size.height) * 2 + 1);
      RAY.setFromCamera(NDC, camera);
      HITS.length = 0;
      RAY.intersectObject(mesh, false, HITS);
      const first = HITS[0];
      const index = first?.instanceId;
      if (index === undefined) {
        return null;
      }
      return runtime.visible[index]?.uid ?? null;
    }

    function reportHover(uid: string | null): void {
      if (uid === hovered) {
        return;
      }
      hovered = uid;
      propsRef.current.onHover(uid);
      canvas.style.cursor = uid === null ? '' : 'pointer';
    }

    function cast(): void {
      castAt = performance.now();
      reportHover(pick(lastX, lastY));
    }

    function onMove(event: PointerEvent): void {
      // Trình duyệt bắn `pointermove` cả khi con trỏ đứng yên (cuộn trang, thay
      // đổi bố cục). Không lọc thì "chỉ bắn khi di chuyển" là một lời nói suông.
      if (event.offsetX === lastX && event.offsetY === lastY) {
        return;
      }
      lastX = event.offsetX;
      lastY = event.offsetY;

      const now = performance.now();
      const waited = now - castAt;
      if (waited >= PICK_INTERVAL_MS) {
        window.clearTimeout(timer);
        timer = undefined;
        cast();
      } else if (timer === undefined) {
        // Đuôi: nếu người dùng dừng tay ngay sau một sự kiện bị tiết chế bỏ qua
        // thì vị trí cuối cùng vẫn phải được dò. Thiếu nhánh này, con trỏ đứng
        // trên một pod mà pod đó không sáng lên.
        timer = setTimeout(() => {
          timer = undefined;
          cast();
        }, PICK_INTERVAL_MS - waited);
      }
    }

    function onLeave(): void {
      window.clearTimeout(timer);
      timer = undefined;
      lastX = Number.NaN;
      lastY = Number.NaN;
      reportHover(null);
    }

    function onDown(event: PointerEvent): void {
      downX = event.clientX;
      downY = event.clientY;
    }

    /** Rê quá ngưỡng giữa nhấn và nhả là thao tác camera, không phải một cú bấm. */
    function dragged(event: MouseEvent): boolean {
      return Math.abs(event.clientX - downX) > CLICK_SLOP_PX || Math.abs(event.clientY - downY) > CLICK_SLOP_PX;
    }

    function onClick(event: MouseEvent): void {
      if (dragged(event)) {
        return;
      }
      propsRef.current.onSelect(pick(event.offsetX, event.offsetY));
    }

    function onContextMenu(event: MouseEvent): void {
      if (dragged(event)) {
        return;
      }
      const uid = pick(event.offsetX, event.offsetY);
      if (uid === null) {
        return;
      }
      event.preventDefault();
      propsRef.current.onContextMenu(uid, { x: event.clientX, y: event.clientY });
    }

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.clearTimeout(timer);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.style.cursor = '';
    };
  }, [gl, camera, size, runtime, propsRef, bodyRef]);

  return null;
}
