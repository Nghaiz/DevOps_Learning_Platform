'use client';

import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ContactShadows } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { PLATFORM_DEPTH, PLATFORM_HEIGHT, PLATFORM_WIDTH } from '../shared/scene-layout';
import { TIER_FEATURES } from '../shared/scene-quality';
import type { QualityTier } from '../arena-contract';
import { PLATFORM_CAPACITY } from './scene-constants';
import type { SceneRuntime } from './scene-entry';
import type { ArenaColors } from './use-arena-colors';

const TMP_MATRIX = new THREE.Matrix4();
const TMP_POS = new THREE.Vector3();
const TMP_SCALE = new THREE.Vector3(1, 1, 1);
const TMP_COLOR = new THREE.Color();
const IDENTITY_QUAT = new THREE.Quaternion();

/** Mặt sàn nằm ngay dưới đáy bệ. Bóng tiếp xúc bám vào đúng mặt phẳng này. */
const FLOOR_Y = -PLATFORM_HEIGHT / 2;
/** Sàn đặt thấp hơn mặt bóng một chút, nếu không hai mặt phẳng trùng nhau và nhấp nháy. */
const GROUND_Y = FLOOR_Y - 0.02;
/**
 * Cạnh vùng bóng tiếp xúc, cố định.
 *
 * KHÔNG suy từ `runtime.radius`: đổi `scale` làm drei dựng lại hai render target,
 * nên một cụm đang lớn dần sẽ rò render target sau mỗi lần thêm node — và đúng
 * hai con số `textures`/`geometries` mà cổng đo bộ nhớ đang gác.
 */
const CONTACT_SHADOW_SPAN = 44;

export interface NodePlatformsProps {
  readonly runtime: SceneRuntime;
  readonly colors: ArenaColors;
  readonly colorsVersion: number;
  readonly tier: QualityTier;
}

/**
 * Bệ node — một lệnh vẽ cho tất cả — cộng mặt sàn và bóng đổ tiếp xúc.
 *
 * Bóng tiếp xúc là thứ làm cụm "đứng trên" sàn thay vì "trôi trước" sàn, và nó
 * là lý do nền phải tối: trên nền sáng thì vệt bóng nhạt gần như biến mất.
 *
 * Ma trận và màu chỉ được ghi lại khi CẤU TRÚC đổi, không phải mỗi khung hình —
 * bệ không bồng bềnh, nên ghi lại 60 lần một giây là trả giá cho một thứ không
 * bao giờ đổi giữa hai lần đó.
 */
export function NodePlatforms({ runtime, colors, colorsVersion, tier }: NodePlatformsProps): ReactElement {
  const features = TIER_FEATURES[tier];
  const writtenRef = useRef(-1);

  const geometry = useMemo(
    () =>
      new RoundedBoxGeometry(PLATFORM_WIDTH, PLATFORM_HEIGHT, PLATFORM_DEPTH, features.roundedSegments, 0.07),
    [features.roundedSegments],
  );
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 0.74, metalness: 0.22, envMapIntensity: 0.6 }),
    [],
  );
  const groundMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), []);

  const mesh = useMemo(() => {
    const instanced = new THREE.InstancedMesh(geometry, material, PLATFORM_CAPACITY);
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instanced.frustumCulled = false;
    instanced.count = 0;
    instanced.setColorAt(0, TMP_COLOR.setRGB(1, 1, 1));
    return instanced;
  }, [geometry, material]);

  useEffect(() => () => mesh.dispose(), [mesh]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => groundMaterial.dispose(), [groundMaterial]);

  useEffect(() => {
    mesh.castShadow = features.shadows;
    mesh.receiveShadow = features.shadows;
  }, [mesh, features.shadows]);

  useEffect(() => {
    groundMaterial.color.copy(colors.ground);
    // Ghi lại bệ ở lượt vẽ kế tiếp: màu bệ pha theo `colors`, mà `colors` vừa đổi.
    writtenRef.current = -1;
  }, [groundMaterial, colors, colorsVersion]);

  useFrame(() => {
    if (writtenRef.current === runtime.structureVersion) {
      return;
    }
    writtenRef.current = runtime.structureVersion;
    const nodes = runtime.nodes;
    const count = Math.min(nodes.length, PLATFORM_CAPACITY);
    for (let i = 0; i < count; i += 1) {
      const node = nodes[i];
      if (node === undefined) {
        continue;
      }
      TMP_POS.set(node.x, 0, 0);
      TMP_MATRIX.compose(TMP_POS, IDENTITY_QUAT, TMP_SCALE);
      mesh.setMatrixAt(i, TMP_MATRIX);
      /*
       * Node hỏng đổi MÀU chứ không đổi hình. Đó là ràng buộc khả dụng: người
       * phân biệt màu kém vẫn còn nhãn và bảng thông số, còn một bệ biến dạng
       * thì làm hỏng cả bố cục pod đứng trên nó.
       */
      TMP_COLOR.copy(node.ready ? colors.platform : colors.platformDown);
      if (node.ready) {
        TMP_COLOR.lerp(colors.platformReady, Math.min(1, node.load));
      }
      mesh.setColorAt(i, TMP_COLOR);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) {
      mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <primitive object={mesh} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, GROUND_Y, 0]}
        receiveShadow={features.shadows}
        material={groundMaterial}
      >
        <planeGeometry args={[220, 220]} />
      </mesh>
      {features.shadows ? (
        <ContactShadows
          position={[0, FLOOR_Y + 0.002, 0]}
          scale={CONTACT_SHADOW_SPAN}
          resolution={features.softShadows ? 512 : 256}
          blur={2.4}
          opacity={0.62}
          far={5}
          near={0.05}
          smooth={false}
          frames={Infinity}
        />
      ) : null}
    </>
  );
}
