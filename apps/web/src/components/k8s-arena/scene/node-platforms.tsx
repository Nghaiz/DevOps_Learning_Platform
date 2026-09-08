'use client';

import { useEffect, useMemo, type ReactElement } from 'react';
import * as THREE from 'three';
import { ContactShadows, Grid } from '@react-three/drei';
import { PLATFORM_GAP, PLATFORM_HEIGHT, PLATFORM_WIDTH } from '../shared/scene-layout';
import { TIER_FEATURES } from '../shared/scene-quality';
import type { QualityTier } from '../arena-contract';
import type { SceneRuntime } from './scene-entry';
import type { ArenaColors } from './use-arena-colors';

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
/**
 * Tầm nhìn của lưới sàn, đơn vị world.
 *
 * Phải PHỦ QUÁ `CAMERA_TUNING.maxDistance` (80), nếu không người dùng kéo ra xa
 * sẽ thấy lưới kết thúc bằng một đường cắt cụt — và một cạnh cứng giữa khoảng
 * không đọc ra là lỗi vẽ, không phải là chân trời.
 */
const GRID_FADE = 120;

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
export function NodePlatforms({ colors, colorsVersion, tier }: NodePlatformsProps): ReactElement {
  const features = TIER_FEATURES[tier];
  const groundMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }),
    [],
  );
  useEffect(() => () => groundMaterial.dispose(), [groundMaterial]);
  useEffect(() => {
    groundMaterial.color.copy(colors.ground);
  }, [groundMaterial, colors, colorsVersion]);

  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, GROUND_Y, 0]}
        receiveShadow={features.shadows}
        material={groundMaterial}
      >
        <planeGeometry args={[420, 420]} />
      </mesh>
      {/*
        Lưới sàn trải tới chân trời.

        Đây KHÔNG phải trang trí. Không có nó, cụm là một vật thể đơn độc trôi
        trên nền đen: mắt không có mốc nào để bám, khung cảnh trông vừa nhỏ vừa
        lơ lửng, và quan trọng hơn — xoay camera gần như không thấy mình đang
        xoay, vì không có gì trong khung chuyển động tương đối. Một mặt lưới cho
        cả ba thứ đó bằng đúng MỘT lệnh vẽ.

        `fadeDistance` lo phần rìa: lưới nhạt dần vào nền thay vì kết thúc bằng
        một cạnh cứng.
      */}
      <Grid
        position={[0, GROUND_Y + 0.004, 0]}
        infiniteGrid
        cellSize={1}
        cellThickness={0.6}
        cellColor={colors.gridCell}
        sectionSize={PLATFORM_WIDTH + PLATFORM_GAP}
        sectionThickness={1.1}
        sectionColor={colors.gridSection}
        fadeDistance={GRID_FADE}
        fadeStrength={1.5}
        fadeFrom={0}
      />
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
