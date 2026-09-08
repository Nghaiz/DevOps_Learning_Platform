'use client';

import { useEffect, useMemo, useState, type ReactElement, type RefObject } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useFrame } from '@react-three/fiber';
import { TIER_FEATURES } from '../shared/scene-quality';
import type { QualityTier } from '../arena-contract';
import { GLOW_SCALE, INITIAL_CAPACITY, LAYER_GLOW } from './scene-constants';
import type { SceneRuntime } from './scene-entry';
import type { ArenaColors } from './use-arena-colors';

/**
 * Toàn bộ pod và object của cụm trong ĐÚNG HAI lệnh vẽ — một cho thân, một cho
 * quầng sáng — bất kể có 2 hay 200 vật.
 *
 * Đây là ràng buộc hiệu năng quan trọng nhất của cảnh, và nó cũng là thứ dễ mất
 * nhất: chỉ cần đổi sang một `<mesh>` cho mỗi pod là số lệnh vẽ đi theo số pod,
 * và ở 200 pod thì nó giết khung hình trên máy không GPU rời.
 *
 * ⚠ Vật tạm nằm ở tầm module. Luật này dễ vi phạm nhất vì mã vi phạm
 * (`new THREE.Vector3(...)` trong vòng lặp) trông hoàn toàn vô hại.
 */
const TMP_MATRIX = new THREE.Matrix4();
const TMP_POS = new THREE.Vector3();
const TMP_SCALE = new THREE.Vector3();
const TMP_COLOR = new THREE.Color();
const IDENTITY_QUAT = new THREE.Quaternion();

export interface ClusterInstancesProps {
  readonly runtime: SceneRuntime;
  readonly colors: ArenaColors;
  readonly tier: QualityTier;
  /** Mesh thân — bên bắn tia dò trúng đích cần đúng đối tượng này. */
  readonly bodyRef: RefObject<THREE.InstancedMesh | null>;
}

function createInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  shadows: boolean,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  // Cụm nằm gọn trong khung hình gần như mọi lúc; phép cắt theo khối bao của
  // instance thì lại phải tính lại hình cầu bao mỗi khi vật động đậy.
  mesh.frustumCulled = false;
  mesh.count = 0;
  // Gọi một lần để three cấp phát `instanceColor`; sau đó chỉ ghi đè.
  mesh.setColorAt(0, TMP_COLOR.setRGB(1, 1, 1));
  mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

export function ClusterInstances({ runtime, colors, tier, bodyRef }: ClusterInstancesProps): ReactElement {
  const features = TIER_FEATURES[tier];
  const [capacity, setCapacity] = useState(INITIAL_CAPACITY);

  const geometry = useMemo(
    () => new RoundedBoxGeometry(1, 1, 1, features.roundedSegments, 0.16),
    [features.roundedSegments],
  );

  const bodyMaterial = useMemo(
    () =>
      /*
       * Nhám và gần như không kim loại. Bản cũ để `roughness` 0.38 + độ phản
       * chiếu cao và kết quả là node đỏ bóng trông như một cục xà phòng — một
       * bề mặt bóng loáng đọc ra là "nhựa", còn thứ ta muốn là "thiết bị".
       */
      new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.08, envMapIntensity: 0.5 }),
    [],
  );

  const glowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        // Chỉ mặt SAU. Mặt trước sẽ phủ một lớp màu lên chính thân vật và làm
        // bay mất chất liệu vừa dựng được; mặt sau bị thân che nên phần còn
        // nhìn thấy đúng là một vành sáng ôm lấy đường bao.
        side: THREE.BackSide,
        toneMapped: false,
      }),
    [],
  );

  const body = useMemo(
    () => createInstanced(geometry, bodyMaterial, capacity, features.shadows),
    [geometry, bodyMaterial, capacity, features.shadows],
  );
  const glow = useMemo(() => {
    const mesh = createInstanced(geometry, glowMaterial, capacity, false);
    mesh.layers.set(LAYER_GLOW);
    return mesh;
  }, [geometry, glowMaterial, capacity]);

  useEffect(() => {
    bodyRef.current = body;
    return () => {
      bodyRef.current = null;
    };
  }, [body, bodyRef]);

  // `dispose()` của InstancedMesh chỉ giải phóng buffer instance; geometry và
  // material được DÙNG LẠI, nên `renderer.info.memory.geometries` đứng yên qua
  // mọi chu kỳ sinh/xoá — đúng thứ cổng đo bộ nhớ khẳng định.
  useEffect(() => () => body.dispose(), [body]);
  useEffect(() => () => glow.dispose(), [glow]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => bodyMaterial.dispose(), [bodyMaterial]);
  useEffect(() => () => glowMaterial.dispose(), [glowMaterial]);

  useFrame(() => {
    const list = runtime.visible;
    if (list.length > capacity) {
      // Nhân đôi rồi để React dựng lại mesh ở lượt sau. Khung hình này vẽ thiếu
      // vài vật — thà thiếu một khung hình còn hơn ghi ra ngoài mảng instance,
      // chỗ mà three KHÔNG ném lỗi mà chỉ lặng lẽ vẽ sai.
      let next = capacity;
      while (next < list.length) {
        next *= 2;
      }
      setCapacity(next);
    }

    const count = Math.min(list.length, capacity);
    for (let i = 0; i < count; i += 1) {
      const entry = list[i];
      if (entry === undefined) {
        continue;
      }
      TMP_POS.set(entry.x, entry.drawY, entry.z);
      TMP_SCALE.setScalar(entry.drawScale);
      TMP_MATRIX.compose(TMP_POS, IDENTITY_QUAT, TMP_SCALE);
      body.setMatrixAt(i, TMP_MATRIX);
      body.setColorAt(i, colors.body[entry.token]);

      TMP_SCALE.setScalar(entry.drawScale * GLOW_SCALE);
      TMP_MATRIX.compose(TMP_POS, IDENTITY_QUAT, TMP_SCALE);
      glow.setMatrixAt(i, TMP_MATRIX);
      TMP_COLOR.copy(colors.glow[entry.token]).multiplyScalar(entry.drawGlow);
      glow.setColorAt(i, TMP_COLOR);
    }

    body.count = count;
    // Bậc thấp bỏ hẳn quầng sáng: nó là thứ đầu tiên đáng bỏ khi máy yếu, vì nó
    // là không khí chứ không phải thông tin.
    glow.count = tier === 'low' ? 0 : count;
    body.instanceMatrix.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
    if (body.instanceColor !== null) {
      body.instanceColor.needsUpdate = true;
    }
    if (glow.instanceColor !== null) {
      glow.instanceColor.needsUpdate = true;
    }
    /*
     * Hình cầu bao của InstancedMesh được nhớ lại và KHÔNG tự mất hiệu lực khi
     * ma trận instance đổi. Bên bắn tia dùng nó làm phép loại nhanh, nên một
     * hình cầu cũ = pod mới sinh không bấm được. Bỏ nhớ ở đây, three tính lại
     * lười ngay lần bắn tia kế tiếp.
     */
    body.boundingSphere = null;
  });

  return (
    <>
      <primitive object={body} />
      <primitive object={glow} />
    </>
  );
}
