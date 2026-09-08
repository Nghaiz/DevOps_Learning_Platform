'use client';

import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
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
 * Chọn và rê bằng chuột — tia dò chỉ bắn khi CẢNH DƯỚI CON TRỎ thật sự đổi, và
 * không quá ~30 lần/giây.
 *
 * Bản của k8sgames.com bắn tia mỗi khung hình không tiết chế, kể cả khi không có
 * gì đổi; với vài trăm instance thì phép đó chiếm một phần đáng kể ngân sách
 * khung hình để trả lời một câu hỏi mà câu trả lời không đổi.
 *
 * ⚠ "Cảnh dưới con trỏ đổi" có HAI nguyên nhân, không phải một. Bản đầu chỉ bắt
 * nguyên nhân thứ nhất và nó hỏng thật: đo trực tiếp 2026-09-08 ở `/games/k8s`,
 * đặt chuột lên pod trong lúc xoay-nhàn-rỗi đang chạy thì pod trôi qua dưới con
 * trỏ mà không hề sáng lên — trạng thái rê được tính từ lúc camera còn ở chỗ
 * khác và không ai tính lại. Quét lưới (mỗi ô một lần rê) thì lại xanh, nên lỗi
 * này ẩn được sau đúng loại phép thử mà người ta hay viết.
 *
 * ⛔ KHÔNG dùng hệ sự kiện có sẵn của R3F: nó gắn handler lên từng object và bắn
 * tia theo MỌI sự kiện chuột của DOM, không có cửa nào để tiết chế.
 */
export function PointerPicking({ runtime, propsRef, bodyRef }: PointerPickingProps): null {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  /**
   * Móc cho vòng lặp vẽ gọi ngược vào trong effect.
   *
   * Toàn bộ trạng thái dò nằm TRONG một effect chứ không tách ra thành các
   * `useCallback`: bản tách ra đã được đo là hỏng — con trỏ không bao giờ đổi
   * dù sự kiện vẫn tới canvas và đường bấm chọn vẫn chạy đúng — nên cấu trúc
   * một-effect này là cấu trúc DUY NHẤT đã có bằng chứng hoạt động.
   */
  const pokeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;
    const lastCamera = new THREE.Matrix4();
    let lastX = Number.NaN;
    let lastY = Number.NaN;
    let inside = false;
    let castAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let downX = 0;
    let downY = 0;
    let hovered: string | null = null;

    /** `uid` dưới một điểm màn hình, hoặc `null`. Không cấp phát: mảng kết quả ở tầm module. */
    function pick(offsetX: number, offsetY: number): string | null {
      const mesh = bodyRef.current;
      if (mesh === null || mesh.count === 0 || size.width === 0 || size.height === 0) {
        return null;
      }
      NDC.set((offsetX / size.width) * 2 - 1, -(offsetY / size.height) * 2 + 1);
      RAY.setFromCamera(NDC, camera);
      HITS.length = 0;
      RAY.intersectObject(mesh, false, HITS);
      const index = HITS[0]?.instanceId;
      return index === undefined ? null : (runtime.visible[index]?.uid ?? null);
    }

    function cast(): void {
      castAt = performance.now();
      lastCamera.copy(camera.matrixWorld);
      const uid = Number.isNaN(lastX) ? null : pick(lastX, lastY);
      if (uid === hovered) {
        return;
      }
      hovered = uid;
      propsRef.current.onHover(uid);
      canvas.style.cursor = uid === null ? '' : 'pointer';
    }

    /** Bắn ngay nếu đã qua nhịp tiết chế, nếu chưa thì hẹn đúng phần còn lại. */
    function requestCast(): void {
      const waited = performance.now() - castAt;
      if (waited >= PICK_INTERVAL_MS) {
        window.clearTimeout(timer);
        timer = undefined;
        cast();
        return;
      }
      if (timer === undefined) {
        // Đuôi: người dùng dừng tay ngay sau một sự kiện bị tiết chế bỏ qua thì
        // vị trí cuối vẫn phải được dò, nếu không pod dưới con trỏ không sáng lên.
        timer = setTimeout(() => {
          timer = undefined;
          cast();
        }, PICK_INTERVAL_MS - waited);
      }
    }

    /*
     * Nguyên nhân thứ hai làm cảnh dưới con trỏ đổi: con trỏ đứng yên mà CAMERA
     * đổi (xoay-nhàn-rỗi, lệnh bay tới, quán tính bộ điều khiển). Đo trực tiếp
     * 2026-09-08: đặt chuột lên pod trong lúc đang tự xoay thì pod trôi qua dưới
     * con trỏ mà không sáng lên. So ma trận nên khung hình nào camera đứng yên
     * thì không tốn một tia nào.
     */
    pokeRef.current = () => {
      if (inside && !lastCamera.equals(camera.matrixWorld)) {
        requestCast();
      }
    };

    const onMove = (event: PointerEvent): void => {
      // Trình duyệt bắn `pointermove` cả khi con trỏ đứng yên (cuộn trang, đổi bố
      // cục). Không lọc thì "chỉ bắn khi di chuyển" là một lời nói suông.
      if (event.offsetX === lastX && event.offsetY === lastY) {
        return;
      }
      inside = true;
      lastX = event.offsetX;
      lastY = event.offsetY;
      requestCast();
    };

    const onLeave = (): void => {
      window.clearTimeout(timer);
      timer = undefined;
      inside = false;
      lastX = Number.NaN;
      lastY = Number.NaN;
      cast();
    };

    const onDown = (event: PointerEvent): void => {
      downX = event.clientX;
      downY = event.clientY;
    };

    /** Rê quá ngưỡng giữa nhấn và nhả là thao tác camera, không phải một cú bấm. */
    const dragged = (event: MouseEvent): boolean =>
      Math.abs(event.clientX - downX) > CLICK_SLOP_PX || Math.abs(event.clientY - downY) > CLICK_SLOP_PX;

    const onClick = (event: MouseEvent): void => {
      if (!dragged(event)) {
        propsRef.current.onSelect(pick(event.offsetX, event.offsetY));
      }
    };

    const onContextMenu = (event: MouseEvent): void => {
      if (dragged(event)) {
        return;
      }
      const uid = pick(event.offsetX, event.offsetY);
      if (uid !== null) {
        event.preventDefault();
        propsRef.current.onContextMenu(uid, { x: event.clientX, y: event.clientY });
      }
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.clearTimeout(timer);
      pokeRef.current = null;
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.style.cursor = '';
    };
  }, [gl, camera, size, runtime, propsRef, bodyRef]);

  useFrame(() => {
    pokeRef.current?.();
  });

  return null;
}
