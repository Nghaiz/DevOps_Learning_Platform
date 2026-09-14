'use client';

import { useEffect, useRef, type ReactElement } from 'react';
import { Vector3, type OrthographicCamera as OrthographicCameraImpl } from 'three';
import { OrthographicCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CAMERA_NEAR,
  boundsCenter,
  cameraFar,
  cameraPosition,
  clampZoomScale,
  dampFactor,
  frameDistance,
  frameZoom,
  type Scene3DBounds,
} from './camera-angles.ts';
import type { Vec3 } from './scene3d-contract.ts';

/**
 * Camera orthographic của tầng 3D game Git (K.1) + phép nhảy tới ref (K.9).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ KHÔNG `OrbitControls`, KHÔNG XOAY TỰ DO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Người chơi đổi góc bằng nút hoặc phím, và chỉ tới được tám góc cố định. Đây
 * là một quyết định về việc ĐỌC ĐƯỢC, không phải một giới hạn kỹ thuật:
 *
 *  - Ba trục ở đây mỗi trục mang một nghĩa (`scene3d-contract.ts`). Một góc tuỳ
 *    ý gần như luôn là một góc mà hai trong ba trục chồng lên nhau, và người
 *    học đọc sai một đồ thị mà không biết mình đang đọc sai.
 *  - Kéo chuột để xoay xung đột với kéo chuột để CHỌN commit — hai cử chỉ cùng
 *    một nút, và mọi cách phân xử đều làm hỏng một trong hai.
 *  - Góc rời rạc thì mọi ô nghiệm thu ảnh chụp có một tập trạng thái hữu hạn để
 *    so. Góc tự do thì không.
 *
 * ⛔ **KHÔNG tự xoay khi nhàn rỗi.** `k8s-arena/scene/camera-rig.tsx:44-50` ghi
 * lại phép đo đã gỡ `idleSpinAfterMs` ngày 2026-09-08: nó vẽ ~14fps vĩnh viễn,
 * không bao giờ tự dừng, kể cả khi mô phỏng đã tạm dừng — quạt chạy mãi cho một
 * cảnh không ai xem, và mọi cổng đo hiệu năng chỉ còn đúng trong 30 giây đầu.
 * Đừng thêm lại ở đây.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ `position` VÀ `zoom` KHÔNG ĐƯỢC TRUYỀN QUA PROPS CỦA `<OrthographicCamera>`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hai giá trị đó do vòng lặp vẽ ghi TẠI CHỖ. Truyền chúng xuống dưới dạng prop
 * nghĩa là mỗi lần React render lại (đổi theme, chọn commit, resize) R3F áp lại
 * giá trị prop lên camera — tức cú bay đang dở bị giật ngược về mốc cũ giữa
 * chừng, và triệu chứng nhìn ra là "camera thỉnh thoảng nhảy", một thứ không
 * tái hiện được theo ý muốn.
 *
 * `left/right/top/bottom` thì NGƯỢC LẠI — chúng phải là prop, vì chúng suy từ
 * kích thước canvas và phải theo kịp mọi lần resize.
 */

/** Bình phương khoảng cách dưới mức này thì coi như đã tới nơi. Cùng ngưỡng arena dùng. */
const ARRIVED_SQ = 1e-4;

/** Sai khác TƯƠNG ĐỐI của `zoom` dưới mức này thì coi như đã tới nơi. */
const ZOOM_ARRIVED_RATIO = 1e-3;

/**
 * Ưu tiên `useFrame` của rig.
 *
 * Âm để chạy TRƯỚC mọi tầng vẽ (chúng dùng ưu tiên mặc định 0): một tầng đọc
 * `camera.position` để quay nhãn về phía người xem phải đọc được vị trí của
 * KHUNG NÀY, không phải của khung trước. Vẫn để dưới bộ đập nhịp của
 * `git-canvas.tsx`, nơi `gl.info.reset()` phải là việc đầu tiên trong khung.
 *
 * ⚠ Chỉ số ÂM. Số DƯƠNG có nghĩa hoàn toàn khác trong R3F: nó tắt phép vẽ tự
 * động và bắt bạn tự gọi `gl.render()` — cảnh sẽ đen thui mà không có lỗi nào.
 */
const RIG_FRAME_PRIORITY = -1.5;

export interface OrthoCameraRigProps {
  /** Hộp bao của cả cảnh — `Scene3DPlacement['bounds']`. */
  readonly bounds: Scene3DBounds;
  /** Chỉ số góc trong tám góc cố định. Ngoài khoảng thì được chuẩn hoá, không ném. */
  readonly angleIndex: number;
  /** Điểm ngắm. `null` = tâm hộp bao, tức khung-toàn-bộ. */
  readonly target: Vec3 | null;
  /** Hệ số phóng của người chơi, nhân vào `zoom` khung-toàn-bộ. */
  readonly zoomScale: number;
  /** Người dùng bật "giảm chuyển động" thì nhảy thẳng, không nội suy. */
  readonly reducedMotion: boolean;
}

export function OrthoCameraRig({
  bounds,
  angleIndex,
  target,
  zoomScale,
  reducedMotion,
}: OrthoCameraRigProps): ReactElement {
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);

  const cameraRef = useRef<OrthographicCameraImpl | null>(null);
  const goalPosition = useRef(new Vector3());
  const goalTarget = useRef(new Vector3());
  const aimRef = useRef(new Vector3());
  const goalZoom = useRef(1);
  const movingRef = useRef(false);
  /** Đã đặt camera lần nào chưa. Lần đầu phải NHẢY, không bay từ gốc toạ độ ra. */
  const placedRef = useRef(false);

  const far = cameraFar(bounds);

  /*
   * Không mảng phụ thuộc: mục tiêu suy từ `bounds`/`target` — hai giá trị mà bên
   * gọi có thể dựng lại mỗi lượt render với cùng nội dung. Một mảng phụ thuộc
   * theo tham chiếu sẽ chạy lại effect ở MỌI lượt render, và effect đó lại gọi
   * `invalidate()`, nên vòng lặp vẽ không bao giờ dừng — đúng thứ
   * `frameloop="demand"` sinh ra để tránh.
   *
   * Nên: chạy mỗi lượt, nhưng chỉ ĐỘNG vào trạng thái khi mục tiêu THẬT SỰ đổi.
   * So sánh theo giá trị, không theo tham chiếu.
   */
  useEffect(() => {
    const camera = cameraRef.current;
    if (camera === null) return;

    const center = target ?? boundsCenter(bounds);
    const position = cameraPosition(angleIndex, center, frameDistance(bounds));
    const zoom = frameZoom(bounds, angleIndex, size) * clampZoomScale(zoomScale);

    const sameGoal =
      placedRef.current &&
      goalPosition.current.x === position[0] &&
      goalPosition.current.y === position[1] &&
      goalPosition.current.z === position[2] &&
      goalTarget.current.x === center[0] &&
      goalTarget.current.y === center[1] &&
      goalTarget.current.z === center[2] &&
      goalZoom.current === zoom;
    if (sameGoal) return;

    goalPosition.current.set(position[0], position[1], position[2]);
    goalTarget.current.set(center[0], center[1], center[2]);
    goalZoom.current = zoom;

    if (!placedRef.current || reducedMotion) {
      /*
       * Nhảy thẳng ở hai trường hợp: lượt đặt ĐẦU TIÊN (bay từ gốc toạ độ ra là
       * một hoạt ảnh không ai yêu cầu, và nó xảy ra ngay lúc mở màn), và khi
       * người dùng đã nói họ không muốn chuyển động — chuyển cảnh camera đúng là
       * loại chuyển động mà thiết lập đó nhắm tới đầu tiên.
       */
      placedRef.current = true;
      movingRef.current = false;
      camera.up.set(0, 1, 0);
      camera.position.copy(goalPosition.current);
      aimRef.current.copy(goalTarget.current);
      camera.zoom = goalZoom.current;
      camera.lookAt(aimRef.current);
      camera.updateProjectionMatrix();
    } else {
      movingRef.current = true;
    }
    invalidate();
  });

  useFrame((_state, dt) => {
    if (!movingRef.current) return;
    const camera = cameraRef.current;
    if (camera === null) return;

    const factor = dampFactor(dt);
    camera.position.lerp(goalPosition.current, factor);
    aimRef.current.lerp(goalTarget.current, factor);
    camera.zoom += (goalZoom.current - camera.zoom) * factor;
    camera.lookAt(aimRef.current);
    camera.updateProjectionMatrix();

    /*
     * Cú bay PHẢI tự kết thúc. Giảm chấn theo cấp số nhân tiệm cận mục tiêu mà
     * không bao giờ chạm tới, nên không có ngưỡng "tới nơi" thì `movingRef` ở
     * mãi `true`, mỗi khung lại gọi `invalidate()`, và `frameloop="demand"`
     * biến thành `frameloop="always"` trong im lặng — không lỗi, chỉ tốn điện
     * và làm mọi phép đo khung hình vô nghĩa.
     */
    const zoomGap = Math.abs(camera.zoom - goalZoom.current);
    if (
      camera.position.distanceToSquared(goalPosition.current) < ARRIVED_SQ &&
      zoomGap <= goalZoom.current * ZOOM_ARRIVED_RATIO
    ) {
      camera.position.copy(goalPosition.current);
      aimRef.current.copy(goalTarget.current);
      camera.zoom = goalZoom.current;
      camera.lookAt(aimRef.current);
      camera.updateProjectionMatrix();
      movingRef.current = false;
    }
    invalidate();
  }, RIG_FRAME_PRIORITY);

  return (
    <OrthographicCamera
      ref={cameraRef}
      makeDefault
      /*
       * Khung nhìn khai bằng PIXEL của canvas. Đây là nửa còn lại của hợp đồng
       * `zoom` ở `camera-angles.ts`: nhờ khai như vậy, `zoom` đọc ra là "số
       * pixel trên một đơn vị world" và `frameZoom()` tính thẳng ra con số đó.
       * Đổi hệ ở đây mà không đổi bên kia thì cảnh vẫn vẽ, chỉ sai tỉ lệ.
       */
      left={size.width / -2}
      right={size.width / 2}
      top={size.height / 2}
      bottom={size.height / -2}
      near={CAMERA_NEAR}
      far={far}
    />
  );
}
