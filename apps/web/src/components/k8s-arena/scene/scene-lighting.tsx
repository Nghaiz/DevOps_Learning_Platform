'use client';

import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useFrame, useThree } from '@react-three/fiber';
import { TIER_FEATURES } from '../shared/scene-quality';
import type { QualityTier } from '../arena-contract';
import { LAYER_GLOW } from './scene-constants';
import type { SceneRuntime } from './scene-entry';
import type { ArenaColors } from './use-arena-colors';

export interface SceneLightingProps {
  readonly runtime: SceneRuntime;
  readonly colors: ArenaColors;
  readonly colorsVersion: number;
  readonly tier: QualityTier;
}

/** Bán kính đổi ít hơn ngần này thì không đáng dựng lại sương mù và khung bóng. */
const RADIUS_EPSILON = 0.5;

/**
 * Ánh sáng, môi trường, nền và sương mù.
 *
 * ⚠ Đèn để màu TRẮNG có chủ ý. Màu trắng của một nguồn sáng nghĩa là "không
 * nhuộm", tức để vật liệu (vốn lấy màu từ design token) hiện đúng màu của nó.
 * Nhuộm đèn theo màu thương hiệu sẽ nhân màu hai lần và làm mọi trạng thái ngả
 * về cùng một sắc — lúc đó "đỏ" và "vàng" không còn phân biệt được bằng mắt.
 *
 * Sương mù CÙNG MÀU NỀN là điều kiện để nó vô hình: sương khác màu nền đọc ra
 * như một lớp khói bẩn, còn sương cùng màu nền chỉ làm vật ở xa tan dần vào
 * khoảng không — đúng thứ tạo chiều sâu.
 *
 * Bán kính cụm được theo dõi TRONG vòng lặp vẽ chứ không qua state React: nó
 * đổi mỗi lần cấu trúc cụm đổi, mà cấu trúc đổi vài lần một giây trong một ván
 * chơi bận — biến nó thành state là ép React dựng lại cả cây scene ở nhịp đó.
 */
export function SceneLighting({ runtime, colors, colorsVersion, tier }: SceneLightingProps): ReactElement {
  const features = TIER_FEATURES[tier];
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const keyRef = useRef<THREE.DirectionalLight>(null);
  const appliedRadius = useRef(Number.NaN);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const fog = useMemo(() => new THREE.Fog(new THREE.Color(), 1, 2), []);

  useEffect(() => {
    // Camera chính phải nhìn thấy lớp hào quang; camera đổ bóng thì không, và đó
    // chính là lý do hào quang nằm ở một lớp riêng.
    camera.layers.enable(LAYER_GLOW);
  }, [camera]);

  useEffect(() => {
    scene.background = colors.background;
    fog.color.copy(colors.background);
    scene.fog = fog;
    // Ghi TẠI CHỖ chứ không qua prop JSX: `colors.ground` giữ nguyên tham chiếu
    // qua mọi lần đổi theme, và bộ so sánh prop của R3F bỏ qua giá trị y hệt
    // tham chiếu cũ — nên đường prop sẽ không bao giờ cập nhật màu này.
    hemiRef.current?.groundColor.copy(colors.ground);
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, fog, colors, colorsVersion]);

  useEffect(() => {
    if (!features.environment) {
      scene.environment = null;
      return;
    }
    /*
     * Môi trường SINH TẠI CHỖ, không tải HDR từ mạng: sandbox của người học
     * không có internet, và một `<Environment preset>` của drei sẽ chờ ở đó cho
     * tới lúc hết giờ rồi bỏ cuộc trong im lặng.
     */
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const texture = pmrem.fromScene(room, 0.04).texture;
    scene.environment = texture;
    scene.environmentIntensity = 0.35;
    room.dispose();
    // Giải phóng bộ sinh NGAY: nó giữ render target và material làm mờ chỉ dùng
    // một lần, còn texture kết quả sống độc lập.
    pmrem.dispose();
    return () => {
      scene.environment = null;
      texture.dispose();
    };
  }, [scene, gl, features.environment]);

  useFrame(() => {
    const radius = runtime.radius;
    if (Math.abs(radius - appliedRadius.current) < RADIUS_EPSILON) {
      return;
    }
    appliedRadius.current = radius;
    fog.near = radius * 1.8;
    fog.far = radius * 5.5;
    const key = keyRef.current;
    if (key !== null) {
      const span = Math.max(14, radius * 1.4);
      const shadowCamera = key.shadow.camera;
      shadowCamera.left = -span;
      shadowCamera.right = span;
      shadowCamera.top = span;
      shadowCamera.bottom = -span;
      shadowCamera.updateProjectionMatrix();
      gl.shadowMap.needsUpdate = true;
    }
  }, -1.9);

  return (
    <>
      <ambientLight intensity={0.22} />
      {/* Ánh dội lên từ sàn — cùng màu sàn nên nó đổi theo theme mà không cần đèn riêng. */}
      <hemisphereLight ref={hemiRef} intensity={0.42} />
      <directionalLight
        ref={keyRef}
        position={[7, 13, 8]}
        intensity={1.6}
        castShadow={features.shadows}
        shadow-mapSize-width={features.softShadows ? 2048 : 1024}
        shadow-mapSize-height={features.softShadows ? 2048 : 1024}
        shadow-bias={-0.0012}
        shadow-normalBias={0.02}
        shadow-camera-near={1}
        shadow-camera-far={70}
      />
      {/* Đèn viền phía sau: nó vẽ lại đường bao của khối trên nền tối, và đó là
          thứ làm hình khối đọc được mà không phải tăng độ bóng của vật liệu. */}
      <directionalLight position={[-9, 5, -7]} intensity={0.55} />
    </>
  );
}
