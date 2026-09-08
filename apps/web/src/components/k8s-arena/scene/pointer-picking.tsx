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

/**
 * Trạng thái của cú kéo đang diễn ra.
 *
 * ⛔ Phải sống NGOÀI effect. Xem luật 4 trong khối tài liệu của `PointerPicking`
 * — đây là chỗ sửa lỗi "kéo được một lúc rồi vật trượt khỏi con trỏ".
 */
interface DragState {
  /** uid dưới con trỏ lúc nhấn. Không `null` ⇒ cú rê sắp tới là KÉO VẬT. */
  grabbed: string | null;
  dragging: boolean;
  /** Lệch giữa tâm vật và điểm chuột chạm mặt phẳng kéo, giữ nguyên suốt cú kéo. */
  offsetX: number;
  offsetZ: number;
  /** Điểm nhấn, theo toạ độ client. Dùng để đo ngưỡng vượt. */
  downX: number;
  downY: number;
  /** Điểm nhấn, theo toạ độ canvas. Mặt phẳng kéo được dựng từ đúng điểm này. */
  pressX: number;
  pressY: number;
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
 * ## Bốn luật, và mỗi luật đến từ một lỗi đo được
 *
 * 1. **Tia bắn vào hình bao, không vào mô hình.** Mô hình của mỗi loại tài
 *    nguyên rỗng ở giữa, nên bắn tia thẳng vào nó cho ra một vùng bấm thủng lỗ
 *    chỗ — người chơi bấm trúng vật mà không trúng gì. Lý do và bản đồ đo được:
 *    `hit-proxy.tsx`.
 * 2. **Chuột phải LUÔN trả lời.** Bản trước chỉ `preventDefault` khi tia trúng
 *    một vật; trượt thì menu của TRÌNH DUYỆT bật lên giữa cảnh 3D.
 * 3. **Kéo vật ≠ xoay camera.** Nhấn giữ trên một vật rồi rê là KÉO VẬT; nhấn
 *    giữ chỗ trống rồi rê là xoay camera. Phân biệt bằng "tia lúc nhấn có trúng
 *    gì không", nên hai thao tác không bao giờ tranh nhau.
 * 4. **Trạng thái kéo sống NGOÀI effect, và effect không phụ thuộc vào `size`.**
 *
 * ### Luật 4 — lỗi "kéo tầm 1 giây rồi vật trượt khỏi con trỏ" (2026-09-09)
 *
 * Bản trước giữ `dragging` / `grabbed` / `grabOffset*` làm biến cục bộ trong
 * closure của effect, và mảng phụ thuộc của effect có `size` lấy từ
 * `useThree((s) => s.size)`. `size` là một OBJECT MỚI mỗi lần `ResizeObserver`
 * của R3F bắn — và nó bắn cả khi kích thước không đổi (bảng thông số trượt vào,
 * dock đổi bố cục, trình duyệt gộp một lượt layout). Giữa một cú kéo, effect bị
 * gỡ và dựng lại: closure mới có `dragging === false`, cleanup bật lại
 * `orbit.enabled`, và vật đứng lại tại chỗ trong khi chuột vẫn đang giữ. Đó
 * chính xác là triệu chứng "khựng lại, không đi theo con trỏ, tầm 1 giây là nhả".
 *
 * Hai nửa của bản sửa, cả hai đều cần:
 *
 * - Trạng thái kéo chuyển sang `dragRef` (ngoài effect), nên một lượt dựng lại
 *   không đánh rơi cú kéo đang dở — listener mới đọc tiếp đúng trạng thái cũ.
 * - `size` ra khỏi mảng phụ thuộc, đọc qua `sizeRef`. Effect chỉ dựng lại khi
 *   canvas / camera / controls thật sự đổi, tức là gần như không bao giờ.
 *
 * ### Vì sao không còn gọi `getBoundingClientRect()` trong `pointermove`
 *
 * Bản trước gọi nó **sáu lần cho mỗi sự kiện rê** — mỗi lần là một lượt ép trình
 * duyệt tính lại bố cục, ngay trong đường đi nóng nhất của thao tác. Đó là nửa
 * còn lại của cảm giác "khựng". Nay hình chữ nhật được nhớ trong `rectRef` và
 * chỉ tính lại khi canvas đổi kích thước hoặc trang cuộn.
 *
 * ⚠ Tia chỉ bắn khi CẢNH DƯỚI CON TRỎ thật sự đổi, và không quá ~30 lần/giây.
 * "Cảnh dưới con trỏ đổi" có HAI nguyên nhân: con trỏ dời chỗ, và CAMERA dời
 * chỗ trong khi con trỏ đứng yên. Bản đầu chỉ bắt nguyên nhân thứ nhất và nó
 * hỏng thật — pod trôi qua dưới con trỏ trong lúc camera đang bay mà không hề
 * sáng lên.
 *
 * ⛔ KHÔNG dùng hệ sự kiện có sẵn của R3F: nó gắn handler lên từng object và bắn
 * tia theo MỌI sự kiện chuột của DOM, không có cửa nào để tiết chế.
 *
 * ⛔ File này là NGƯỜI SỞ HỮU DUY NHẤT của `controls.enabled`. `camera-rig.tsx`
 * từng ghi cùng thuộc tính đó mỗi khung hình; hai người ghi một cờ nghĩa là sau
 * một lượt gỡ effect giữa cú kéo, `runtime.draggingUid` còn sót lại khác `null`
 * và CameraRig tắt camera vĩnh viễn mà không có gì nói tại sao.
 */
export function PointerPicking({ runtime, propsRef, proxyRef }: PointerPickingProps): null {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls);

  const sizeRef = useRef(size);
  sizeRef.current = size;

  const dragRef = useRef<DragState>({
    grabbed: null,
    dragging: false,
    offsetX: 0,
    offsetZ: 0,
    downX: 0,
    downY: 0,
    pressX: 0,
    pressY: 0,
  });

  /**
   * Móc cho vòng lặp vẽ gọi ngược vào trong effect.
   *
   * Toàn bộ trạng thái DÒ nằm trong một effect chứ không tách ra thành các
   * `useCallback`: bản tách ra đã được đo là hỏng — con trỏ không bao giờ đổi
   * dù sự kiện vẫn tới canvas — nên cấu trúc một-effect này là cấu trúc DUY
   * NHẤT đã có bằng chứng hoạt động. (Trạng thái KÉO thì ngược lại: nó phải ra
   * ngoài, xem luật 4.)
   */
  const pokeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;
    const orbit = toggleable(controls);
    const drag = dragRef.current;
    const lastCamera = new THREE.Matrix4();
    let lastX = Number.NaN;
    let lastY = Number.NaN;
    let inside = false;
    let castAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hovered: string | null = null;

    /*
     * Hình chữ nhật của canvas, nhớ sẵn. `getBoundingClientRect()` ép trình
     * duyệt tính lại bố cục, nên gọi nó trong `pointermove` là tự bắn vào chân.
     */
    let rectLeft = 0;
    let rectTop = 0;

    function refreshRect(): void {
      const rect = canvas.getBoundingClientRect();
      rectLeft = rect.left;
      rectTop = rect.top;
    }

    refreshRect();

    const localX = (event: { clientX: number }): number => event.clientX - rectLeft;
    const localY = (event: { clientY: number }): number => event.clientY - rectTop;

    /** `uid` dưới một điểm màn hình, hoặc `null`. Không cấp phát: mảng kết quả ở tầm module. */
    function pick(offsetX: number, offsetY: number): string | null {
      const proxy = proxyRef.current;
      const { width, height } = sizeRef.current;
      if (proxy === null || proxy.mesh.count === 0 || width === 0 || height === 0) {
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
      const { width, height } = sizeRef.current;
      NDC.set((offsetX / width) * 2 - 1, -(offsetY / height) * 2 + 1);
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
      if (inside && !drag.dragging && !lastCamera.equals(camera.matrixWorld)) {
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
      drag.offsetX = entry.x - PLANE_POINT.x;
      drag.offsetZ = entry.z - PLANE_POINT.z;
      drag.dragging = true;
      canvas.style.cursor = 'grabbing';
    }

    function moveDrag(offsetX: number, offsetY: number): void {
      const uid = drag.grabbed;
      if (uid === null) {
        return;
      }
      aim(offsetX, offsetY);
      if (!planeHit()) {
        return;
      }
      runtime.moveTo(uid, PLANE_POINT.x + drag.offsetX, PLANE_POINT.z + drag.offsetZ);
      // Kéo không sinh ra hoạt ảnh nào nên không có ai khác xin khung hình hộ.
      invalidate();
    }

    function endDrag(): void {
      if (drag.dragging) {
        drag.dragging = false;
        canvas.style.cursor = hovered === null ? '' : 'pointer';
      }
      drag.grabbed = null;
      runtime.draggingUid = null;
      /*
       * Bật lại VÔ ĐIỀU KIỆN, không chỉ khi vừa kéo xong. Bộ điều khiển bị tắt
       * ngay lúc NHẤN (xem `onDown`), kể cả với một cú bấm không kéo — nên nếu
       * chỗ này chỉ bật lại trong nhánh `dragging` thì một cú bấm thường sẽ để
       * camera chết cứng vĩnh viễn.
       */
      if (orbit !== null) {
        orbit.enabled = true;
      }
      invalidate();
    }

    const onMove = (event: PointerEvent): void => {
      const x = localX(event);
      const y = localY(event);
      // Trình duyệt bắn `pointermove` cả khi con trỏ đứng yên (cuộn trang, đổi bố
      // cục). Không lọc thì "chỉ bắn khi di chuyển" là một lời nói suông.
      if (x === lastX && y === lastY) {
        return;
      }
      inside = true;
      lastX = x;
      lastY = y;

      if (drag.dragging) {
        moveDrag(x, y);
        return;
      }
      if (drag.grabbed !== null && beyond(event, DRAG_START_PX)) {
        startDrag(drag.grabbed, drag.pressX, drag.pressY);
        if (drag.dragging) {
          moveDrag(x, y);
        }
        return;
      }
      requestCast();
    };

    const onLeave = (): void => {
      // Giữa một cú kéo, con trỏ đi ra ngoài khung là chuyện BÌNH THƯỜNG (đã bắt
      // con trỏ về canvas). Xoá trạng thái rê ở đây sẽ làm cú kéo mất điểm cuối.
      if (drag.dragging) {
        return;
      }
      window.clearTimeout(timer);
      timer = undefined;
      inside = false;
      lastX = Number.NaN;
      lastY = Number.NaN;
      cast();
    };

    const onDown = (event: PointerEvent): void => {
      // Bố cục có thể đã đổi kể từ lần đo trước (bảng thông số mở, cửa sổ cuộn).
      // Một lượt đo mỗi cú nhấn thì rẻ; một lượt đo mỗi cú rê thì không.
      refreshRect();
      drag.downX = event.clientX;
      drag.downY = event.clientY;
      drag.pressX = localX(event);
      drag.pressY = localY(event);
      /*
       * Chỉ nút TRÁI mới cầm được vật. Nút phải là kéo camera (xem
       * `CameraRig.mouseButtons`) và nút giữa là phóng — cầm vật bằng chúng sẽ
       * cướp mất hai thao tác camera mà người chơi đang dùng.
       */
      drag.grabbed = event.button === 0 ? pick(drag.pressX, drag.pressY) : null;
      if (drag.grabbed !== null) {
        event.stopImmediatePropagation();
        runtime.draggingUid = drag.grabbed;
        invalidate();
        /*
         * Tắt bộ điều khiển camera NGAY TỪ LÚC NHẤN, không đợi vượt ngưỡng kéo.
         *
         * ⚠ Đây là một lỗi đã đo được, không phải đề phòng. `OrbitControls` bắt
         * đầu xoay ngay ở `pointerdown` của chính nó; nếu ta chỉ tắt nó khi cú
         * kéo đã vượt `DRAG_START_PX` thì mấy pixel đầu tiên đã kịp xoay camera
         * rồi.
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
      if (drag.dragging && event.type !== 'pointercancel') {
        moveDrag(localX(event), localY(event));
      }
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      endDrag();
    };

    /*
     * Con trỏ bị TƯỚC khỏi ta (trình duyệt thu hồi capture, cử chỉ hệ điều hành
     * chen ngang, một phần tử khác gọi `setPointerCapture`). Không đóng cú kéo ở
     * đây thì `dragging` kẹt ở `true` và mọi cú rê sau đó dời vật một cách ma quái.
     */
    const onLostCapture = (): void => {
      if (drag.grabbed !== null) {
        endDrag();
      }
    };

    /** Con trỏ đã rời quá `slop` pixel kể từ lúc nhấn. */
    const beyond = (event: MouseEvent, slop: number): boolean =>
      Math.abs(event.clientX - drag.downX) > slop || Math.abs(event.clientY - drag.downY) > slop;

    const onClick = (event: MouseEvent): void => {
      // Rê quá ngưỡng giữa nhấn và nhả là thao tác camera hoặc một cú kéo vật,
      // không phải một cú bấm chọn.
      if (!beyond(event, CLICK_SLOP_PX)) {
        propsRef.current.onSelect(pick(localX(event), localY(event)));
      }
    };

    const onContextMenu = (event: MouseEvent): void => {
      /*
       * `preventDefault` VÔ ĐIỀU KIỆN. Bản trước chỉ chặn khi trúng một vật, nên
       * mọi cú chuột phải trượt đều bật menu của trình duyệt lên giữa cảnh 3D.
       */
      event.preventDefault();
      if (beyond(event, CLICK_SLOP_PX)) {
        // Vừa kéo camera bằng nút phải — mở menu ở cuối cú kéo là ngoài ý muốn.
        return;
      }
      const uid = pick(localX(event), localY(event));
      const at = { x: event.clientX, y: event.clientY };
      if (uid === null) {
        propsRef.current.onSceneContextMenu(at);
      } else {
        propsRef.current.onContextMenu(uid, at);
      }
    };

    /*
     * Hình chữ nhật chỉ đổi khi canvas đổi kích thước hoặc trang cuộn. Bắt đúng
     * hai nguồn đó thì không cần đo lại trong đường đi nóng.
     */
    const observer = new ResizeObserver(refreshRect);
    observer.observe(canvas);
    window.addEventListener('scroll', refreshRect, { passive: true, capture: true });
    window.addEventListener('resize', refreshRect, { passive: true });

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown, true);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('lostpointercapture', onLostCapture);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
      window.clearTimeout(timer);
      pokeRef.current = null;
      observer.disconnect();
      window.removeEventListener('scroll', refreshRect, true);
      window.removeEventListener('resize', refreshRect);
      /*
       * ⛔ KHÔNG đóng cú kéo đang dở ở đây, và KHÔNG bật lại `orbit.enabled` vô
       * điều kiện. Effect này có thể bị dựng lại giữa một cú kéo; trạng thái
       * nằm trong `dragRef` nên lượt dựng mới sẽ kéo tiếp, và bật camera lên
       * giữa chừng là đúng cái lỗi luật 4 nói tới. Cú kéo được đóng bởi
       * `pointerup` / `pointercancel` / `lostpointercapture`, hoặc bởi
       * `arena-scene` khi cả cảnh bị gỡ.
       */
      if (orbit !== null && drag.grabbed === null) {
        orbit.enabled = true;
      }
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown, true);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('lostpointercapture', onLostCapture);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.style.cursor = '';
    };
    // ⛔ `size` KHÔNG có trong mảng này — xem luật 4. Nó đổi danh tính mỗi lần
    // `ResizeObserver` bắn, kể cả khi kích thước không đổi, và một lượt dựng lại
    // giữa cú kéo là đúng lỗi mà luật đó sửa. Kích thước đọc qua `sizeRef`.
  }, [gl, camera, invalidate, controls, runtime, propsRef, proxyRef]);

  useFrame(() => {
    pokeRef.current?.();
  });

  return null;
}
