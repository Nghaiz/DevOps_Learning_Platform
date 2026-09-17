'use client';

/**
 * Camera TRỰC GIAO, bốn góc chốt sẵn, không `OrbitControls` (19.D.3.2).
 *
 * ⛔ **Không có xoay tự do và không có xoay khi nhàn rỗi.** Lý lẽ đầy đủ ở
 * `camera-angles.ts`; bản rút gọn: `idleSpinAfterMs` từng vẽ ~14fps vĩnh viễn
 * cho arena và đã bị gỡ hẳn ngày 2026-09-08 (`k8s-arena/scene/camera-rig.tsx`
 * dòng 44-50 mang lệnh cấm tái lập), còn xoay tự do cho phép người chơi dừng ở
 * đúng góc mà hai trục chồng lên nhau và đọc đồ thị sai mà không biết.
 *
 * ## Vì sao trực giao chứ không phối cảnh
 *
 * Ba trục ở đây MANG NGHĨA: X là tầng phụ thuộc, Z là làn, Y là thời gian chờ
 * (chương CI) hoặc dải môi trường (chương CD). Với camera phối cảnh, hai node
 * cách nhau đúng một tầng chiếu ra hai độ dài khác nhau tuỳ chúng ở gần hay xa —
 * tức là "đếm ô" cho ra câu trả lời sai, và sai nhiều nhất ở chỗ đồ thị dài
 * nhất. Trực giao thì một bước luôn là một bước.
 */

import { useEffect, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

import { CAMERA_ELEVATION, angleAzimuth } from './camera-angles';
import {
  boundingRadius,
  boundsCorners,
  cameraBasis,
  fitOrthographicZoom,
  worldCenter,
  type SceneBoundsLike,
} from './scene-3d-math';

/** Hệ số giảm chấn của cú chuyển góc. Độc lập nhịp khung hình qua `1 - exp(-dt·k)`. */
const DAMP = 6;
/** Dưới mức chênh lệch này thì coi như đã tới nơi và dừng xin khung hình. */
const ARRIVED = 1e-3;

const GOAL_POSITION = new THREE.Vector3();
const TARGET = new THREE.Vector3();

export interface CameraRig3dProps {
  readonly bounds: SceneBoundsLike;
  readonly angleIndex: number;
  readonly reducedMotion: boolean;
}

export function CameraRig3d({
  bounds,
  angleIndex,
  reducedMotion,
}: CameraRig3dProps): ReactElement | null {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const goalZoomRef = useRef(1);
  const arrivedRef = useRef(false);

  useEffect(() => {
    const basis = cameraBasis(angleAzimuth(angleIndex), CAMERA_ELEVATION);
    const corners = boundsCorners(bounds);
    const center = worldCenter(bounds) ?? { x: 0, y: 0, z: 0 };
    const radius = boundingRadius(corners, center);
    /*
     * Camera trực giao KHÔNG đổi kích cỡ theo khoảng cách, nên con số này không
     * ảnh hưởng hình ảnh — nó chỉ quyết định mặt cắt gần có xén mất phần đồ thị
     * ở gần mắt hay không. Lùi hẳn ra hai lần bán kính rồi cho `far` đủ rộng.
     */
    const distance = radius * 2 + 12;

    TARGET.set(center.x, center.y, center.z);
    GOAL_POSITION.set(
      center.x + basis.dir.x * distance,
      center.y + basis.dir.y * distance,
      center.z + basis.dir.z * distance,
    );
    goalZoomRef.current = fitOrthographicZoom(corners, basis, size);
    arrivedRef.current = false;

    if (camera instanceof THREE.OrthographicCamera) {
      camera.near = 0.1;
      camera.far = distance * 2 + radius * 4;
    }

    if (reducedMotion) {
      // Chuyển động camera là đúng loại chuyển động mà người bật "giảm chuyển
      // động" muốn tránh nhất — nhảy thẳng tới nơi.
      camera.position.copy(GOAL_POSITION);
      if (camera instanceof THREE.OrthographicCamera) {
        camera.zoom = goalZoomRef.current;
      }
      camera.lookAt(TARGET);
      camera.updateProjectionMatrix();
      arrivedRef.current = true;
    }
    // Đổi góc KHÔNG sinh chuyển động của riêng nó, nên nó phải tự xin khung hình.
    invalidate();
  }, [bounds, angleIndex, reducedMotion, camera, size, invalidate]);

  useFrame((_state, delta) => {
    if (arrivedRef.current) {
      return;
    }
    const ortho = camera instanceof THREE.OrthographicCamera ? camera : null;
    const damp = 1 - Math.exp(-Math.min(delta, 0.1) * DAMP);
    camera.position.lerp(GOAL_POSITION, damp);
    if (ortho !== null) {
      ortho.zoom += (goalZoomRef.current - ortho.zoom) * damp;
    }
    camera.lookAt(TARGET);
    camera.updateProjectionMatrix();

    const positionDone = camera.position.distanceToSquared(GOAL_POSITION) < ARRIVED;
    const zoomDone = ortho === null || Math.abs(ortho.zoom - goalZoomRef.current) < ARRIVED;
    if (positionDone && zoomDone) {
      camera.position.copy(GOAL_POSITION);
      if (ortho !== null) {
        ortho.zoom = goalZoomRef.current;
      }
      camera.lookAt(TARGET);
      camera.updateProjectionMatrix();
      arrivedRef.current = true;
      return;
    }
    invalidate();
  }, -1);

  return null;
}
