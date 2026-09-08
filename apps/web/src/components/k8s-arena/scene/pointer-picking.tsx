'use client';

import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { ArenaSceneProps } from '../arena-contract';
import { CLICK_SLOP_PX, DRAG_START_PX, PICK_INTERVAL_MS } from './scene-constants';
import type { SceneRuntime } from './scene-entry';
import type { HitProxyHandle } from './hit-proxy';

const RAY = new THREE.Raycaster();
const NDC = new THREE.Vector2();
const HITS: THREE.Intersection[] = [];
const DRAG_PLANE = new THREE.Plane();
const PLANE_NORMAL = new THREE.Vector3(0, 1, 0);
const PLANE_POINT = new THREE.Vector3();

/**
 * Bộ điều khiển camera, ở dạng hẹp nhất mà file này cần.
 *
 * R3F khai `state.controls` là một `EventDispatcher` chung, không mang `enabled`
 * — nên ép sang `OrbitControls` sẽ là một lời nói dối trong kiểu ngay khi ai đó
 * đổi bộ điều khiển. Ta chỉ cần đúng một thuộc tính, và kiểm nó lúc chạy.
 */
interface Toggleable {
  enabled: boolean;
}

function toggleable(controls: unknown): Toggleable | null {
  return typeof controls === 'object' &&
    controls !== null &&
    'enabled' in controls &&
    typeof (controls as Toggleable).enabled === 'boolean'
    ? (controls as Toggleable)
    : null;
}

export interface PointerPickingProps {
  readonly runtime: SceneRuntime;
  readonly propsRef: RefObject<ArenaSceneProps>;
  /** Hình bao vô hình để bắn tia. Xem `hit-proxy.tsx` về việc vì sao không bắn vào mô hình thật. */
  readonly proxyRef: RefObject<HitProxyHandle | null>;
}

/**
 * Chuột trên cảnh 3D: rê, chọn, KÉO, và chuột phải.
 *
 * ## Ba luật, và mỗi luật đến từ một lỗi đo được (2026-09-08)
 *
 * 1. **Tia bắn vào hình bao, không vào mô hình.** Mô hình của mỗi loại tài
 *    nguyên rỗng ở giữa, nên bắn tia thẳng vào nó cho ra một vùng bấm thủng lỗ
 *    chỗ — người chơi bấm trúng vật mà không trúng gì. Lý do và bản đồ đo được:
 *    `hit-proxy.tsx`.
 * 2. **Chuột phải LUÔN trả lời.** Bản trước chỉ `preventDefault` khi tia trúng
 *    một vật; trượt thì menu của TRÌNH DUYỆT bật lên giữa cảnh 3D. Cộng với lỗi
 *    (1), chuột phải hầu như không bao giờ trúng — đúng thứ chủ dự án báo là
 *    *"right click chưa có gì"*. Giờ trượt cũng có menu, chỉ là menu của CẢNH.
 * 3. **Kéo vật ≠ xoay camera.** Nhấn giữ trên một vật rồi rê là KÉO VẬT; nhấn
 *    giữ chỗ trống rồi rê là xoay camera. Phân biệt bằng "tia lúc nhấn có trúng
 *    gì không", nên hai thao tác không bao giờ tranh nhau.
 *
 * ⚠ Tia chỉ bắn khi CẢNH DƯỚI CON TRỎ thật sự đổi, và không quá ~30 lần/giây.
 * "Cảnh dưới con trỏ đổi" có HAI nguyên nhân: con trỏ dời chỗ, và CAMERA dời
 * chỗ trong khi con trỏ đứng yên. Bản đầu chỉ bắt nguyên nhân thứ nhất và nó
 * hỏng thật — pod trôi qua dưới con trỏ trong lúc camera đang bay mà không hề
 * sáng lên. Quét lưới (mỗi ô một lần rê) thì lại xanh, nên lỗi đó ẩn được sau
 * đúng loại phép thử người ta hay viết.
 *
 * ⛔ KHÔNG dùng hệ sự kiện có sẵn của R3F: nó gắn handler lên từng object và bắn
 * tia theo MỌI sự kiện chuột của DOM, không có cửa nào để tiết chế.
 */
export function PointerPicking({ runtime, propsRef, proxyRef }: PointerPickingProps): null {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls);
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
    const orbit = toggleable(controls);
    const lastCamera = new THREE.Matrix4();
    let lastX = Number.NaN;
    let lastY = Number.NaN;
    let inside = false;
    let castAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let downX = 0;
    let downY = 0;
    let hovered: string | null = null;

    /** uid dưới con trỏ lúc nhấn. Không `null` ⇒ cú rê sắp tới là KÉO VẬT. */
    let grabbed: string | null = null;
    let dragging = false;
    /** Lệch giữa tâm vật và điểm chuột chạm mặt phẳng kéo, giữ nguyên suốt cú kéo. */
    let grabOffsetX = 0;
    let grabOffsetZ = 0;

    /** `uid` dưới một điểm màn hình, hoặc `null`. Không cấp phát: mảng kết quả ở tầm module. */
    function pick(offsetX: number, offsetY: number): string | null {
      const proxy = proxyRef.current;
      if (proxy === null || proxy.mesh.count === 0 || size.width === 0 || size.height === 0) {
        return null;
      }
      aim(offsetX, offsetY);
      HITS.length = 0;
      RAY.intersectObject(proxy.mesh, false, HITS);
      // `intersectObject` đã sắp theo khoảng cách, nên phần tử đầu là vật gần nhất.
      const index = HITS[0]?.instanceId;
      return index === undefined ? null : (proxy.uids[index] ?? null);
    }

    /** Nạp `RAY` cho một điểm màn hình. Tách ra vì cả bấm chọn lẫn kéo đều cần. */
    function aim(offsetX: number, offsetY: number): void {
      NDC.set((offsetX / size.width) * 2 - 1, -(offsetY / size.height) * 2 + 1);
      RAY.setFromCamera(NDC, camera);
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
     * đổi (lệnh bay tới, quán tính bộ điều khiển). So ma trận nên khung hình nào
     * camera đứng yên thì không tốn một tia nào.
     */
    pokeRef.current = () => {
      if (inside && !dragging && !lastCamera.equals(camera.matrixWorld)) {
        requestCast();
      }
    };

    /** Điểm mà tia hiện tại chạm mặt phẳng kéo. `false` = tia song song với mặt phẳng. */
    function planeHit(): boolean {
      return RAY.ray.intersectPlane(DRAG_PLANE, PLANE_POINT) !== null;
    }

    function startDrag(uid: string, offsetX: number, offsetY: number): void {
      const entry = runtime.entries.get(uid);
      if (entry === undefined) {
        return;
      }
      /*
       * Mặt phẳng kéo NẰM NGANG, đi qua đúng độ cao của vật. Kéo trong mặt phẳng
       * đó giữ nguyên độ cao — pod vẫn ở tầm mặt bệ, vật trên kệ vẫn ở tầm kệ —
       * nên thao tác đọc ra là "dời chỗ trên sơ đồ", không phải "nhấc lên trời".
       */
      DRAG_PLANE.setFromNormalAndCoplanarPoint(PLANE_NORMAL, PLANE_POINT.set(0, entry.drawY, 0));
      aim(offsetX, offsetY);
      if (!planeHit()) {
        return;
      }
      /*
       * Giữ điểm cầm: không có bước này thì vật NHẢY sao cho tâm nó trùng con
       * trỏ ngay khi cú kéo bắt đầu — một cú giật thấy rõ, và người chơi mất
       * đúng cái điểm neo mà họ vừa nhắm vào.
       */
      grabOffsetX = entry.x - PLANE_POINT.x;
      grabOffsetZ = entry.z - PLANE_POINT.z;
      dragging = true;
      canvas.style.cursor = 'grabbing';
    }

    function moveDrag(offsetX: number, offsetY: number): void {
      if (grabbed === null) {
        return;
      }
      aim(offsetX, offsetY);
      if (!planeHit()) {
        return;
      }
      runtime.moveTo(grabbed, PLANE_POINT.x + grabOffsetX, PLANE_POINT.z + grabOffsetZ);
      // Kéo không sinh ra hoạt ảnh nào nên không có ai khác xin khung hình hộ.
      invalidate();
    }

    function endDrag(): void {
      if (dragging) {
        dragging = false;
        canvas.style.cursor = hovered === null ? '' : 'pointer';
      }
      grabbed = null;
      /*
       * Bật lại VÔ ĐIỀU KIỆN, không chỉ khi vừa kéo xong. Bộ điều khiển bị tắt
       * ngay lúc NHẤN (xem `onDown`), kể cả với một cú bấm không kéo — nên nếu
       * chỗ này chỉ bật lại trong nhánh `dragging` thì một cú bấm thường sẽ để
       * camera chết cứng vĩnh viễn.
       */
      if (orbit !== null) {
        orbit.enabled = true;
      }
    }

    const onMove = (event: PointerEvent): void => {
      // Trình duyệt bắn `pointermove` cả khi con trỏ đứng yên (cuộn trang, đổi bố
      // cục). Không lọc thì "chỉ bắn khi di chuyển" là một lời nói suông.
      if (event.offsetX === lastX && event.offsetY === lastY) {
        return;
      }
      inside = true;
      lastX = event.offsetX;
      lastY = event.offsetY;

      if (dragging) {
        moveDrag(event.offsetX, event.offsetY);
        return;
      }
      if (grabbed !== null && beyond(event, DRAG_START_PX)) {
        startDrag(grabbed, event.offsetX, event.offsetY);
        if (dragging) {
          moveDrag(event.offsetX, event.offsetY);
        }
        return;
      }
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
      /*
       * Chỉ nút TRÁI mới cầm được vật. Nút phải là kéo camera (xem
       * `CameraRig.mouseButtons`) và nút giữa là phóng — cầm vật bằng chúng sẽ
       * cướp mất hai thao tác camera mà người chơi đang dùng.
       */
      grabbed = event.button === 0 ? pick(event.offsetX, event.offsetY) : null;
      if (grabbed !== null) {
        /*
         * Tắt bộ điều khiển camera NGAY TỪ LÚC NHẤN, không đợi vượt ngưỡng kéo.
         *
         * ⚠ Đây là một lỗi đã đo được, không phải đề phòng. `OrbitControls` bắt
         * đầu xoay ngay ở `pointerdown` của chính nó; nếu ta chỉ tắt nó khi cú
         * kéo đã vượt `DRAG_START_PX` thì mấy pixel đầu tiên đã kịp xoay camera
         * rồi. Đo trực tiếp 2026-09-08: kéo một pod đi thì camera vừa xoay vừa
         * lao vào, cả hai bệ node phóng to và khung hình lệch hẳn — trông như
         * cảnh tự nhảy chứ không như một cú kéo.
         *
         * Tắt sớm cũng đúng cho một cú BẤM thường: nhấn lên một tài nguyên rồi
         * nhả ra không được phép xoay camera một chút nào.
         */
        if (orbit !== null) {
          orbit.enabled = false;
        }
        /*
         * Bắt con trỏ về canvas: cú kéo phải sống sót khi chuột đi ra ngoài
         * khung (qua bảng thông số, ra khỏi cửa sổ). Thiếu bước này thì vật
         * "dính" lại giữa chừng và `pointerup` bắn ở nơi khác, để lại cờ kéo bật
         * vĩnh viễn — camera không xoay được nữa mà không có gì nói tại sao.
         */
        canvas.setPointerCapture(event.pointerId);
      }
    };

    const onUp = (event: PointerEvent): void => {
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      endDrag();
    };

    /** Con trỏ đã rời quá `slop` pixel kể từ lúc nhấn. */
    const beyond = (event: MouseEvent, slop: number): boolean =>
      Math.abs(event.clientX - downX) > slop || Math.abs(event.clientY - downY) > slop;

    const onClick = (event: MouseEvent): void => {
      // Rê quá ngưỡng giữa nhấn và nhả là thao tác camera hoặc một cú kéo vật,
      // không phải một cú bấm chọn.
      if (!beyond(event, CLICK_SLOP_PX)) {
        propsRef.current.onSelect(pick(event.offsetX, event.offsetY));
      }
    };

    const onContextMenu = (event: MouseEvent): void => {
      if (beyond(event, CLICK_SLOP_PX)) {
        // Vừa kéo camera bằng nút phải — mở menu ở cuối cú kéo là ngoài ý muốn.
        return;
      }
      /*
       * `preventDefault` VÔ ĐIỀU KIỆN. Bản trước chỉ chặn khi trúng một vật, nên
       * mọi cú chuột phải trượt đều bật menu của trình duyệt lên giữa cảnh 3D.
       */
      event.preventDefault();
      const uid = pick(event.offsetX, event.offsetY);
      const at = { x: event.clientX, y: event.clientY };
      if (uid === null) {
        propsRef.current.onSceneContextMenu(at);
      } else {
        propsRef.current.onContextMenu(uid, at);
      }
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.clearTimeout(timer);
      pokeRef.current = null;
      // Bộ điều khiển phải được bật lại kể cả khi effect bị gỡ giữa một cú kéo,
      // nếu không camera đứng chết trong phiên chơi tiếp theo.
      if (orbit !== null) {
        orbit.enabled = true;
      }
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.style.cursor = '';
    };
  }, [gl, camera, size, invalidate, controls, runtime, propsRef, proxyRef]);

  useFrame(() => {
    pokeRef.current?.();
  });

  return null;
}
