'use client';

import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ARC_START_DEG, ARC_STROKE, ARC_SWEEP_DEG } from '@devops-platform/motion/motif';
import {
  SCENE_SCALE,
  STAGES,
  angleAtProgress,
  angleOfStage,
  stagePointAt,
  type StageId,
} from './loop-stages';
import { readHomeSceneColorsFrom, type HomeSceneColors, type Rgb } from './scene-colors';

/**
 * Cảnh 3D của vòng bảy chặng. Chunk này CHỈ tải trên máy đã dò ra WebGL2 phần
 * cứng, và chỉ sau khi dải đã vào tầm nhìn.
 *
 * ## Ba thứ cố ý KHÔNG có ở đây
 *
 * 1. **`ScrollControls` của drei.** Nó render chữ vào một React root thứ hai
 *    tách rời, tức chữ trang chủ mất HTML server, mất LCP, mất SEO. Nó cũng
 *    cướp cuộn tài liệu gốc nên mất khôi phục vị trí cuộn và mất anchor link.
 *    Ở đây tiến độ cuộn tới qua một `ref` do vỏ ngoài ghi, `useFrame` đọc ref
 *    đó, và không có `useState` nào trên đường truyền giá trị mỗi khung.
 * 2. **`<Text>` của drei.** Nó kéo `troika-worker-utils`, thứ dò khả năng worker
 *    bằng `new Worker(URL.createObjectURL(new Blob(...)))`. CSP của dự án không
 *    có `worker-src` nên rơi về `script-src`, thứ không cho `blob:`. Troika bắt
 *    lỗi và tự hạ cấp, nên chức năng không hỏng, nhưng trình duyệt vẫn bắn
 *    `securitypolicyviolation`. Chữ của cảnh này là chữ DOM nằm trong danh sách
 *    thẻ ngay dưới, nên cảnh không cần một bộ dựng chữ nào.
 * 3. **Asset nén Draco, KTX2, meshopt và mọi hậu kỳ.** Loader của ba định dạng
 *    đầu cần WebAssembly, và CSP không có `wasm-unsafe-eval`. Toàn bộ hình học
 *    dưới đây sinh bằng mã, nên không có file model nào để nén.
 *
 * ## Ngân sách
 *
 * `frameloop="demand"` nên không có khung nào được vẽ trừ khi có ai gọi
 * `invalidate()`. Hai nguồn gọi: mỗi lượt cuộn, và vòng lặp `startGatedFrameLoop`
 * của vỏ ngoài, thứ tự tắt khi người dùng bật giảm chuyển động. `dpr` chặn trên
 * ở 1.75 chứ không phải 2, và không có shadow map nào.
 */

/** Số điểm lấy mẫu để dựng ống theo cung. Đủ mượt ở mọi cỡ màn hình. */
const TRACK_SEGMENTS = 160;

/** Bán kính ống của vòng, suy từ nét cung của motif để hai bản dựng cùng dày. */
const TRACK_RADIUS = (ARC_STROKE / 2) * SCENE_SCALE;

function toColor(rgb: Rgb): THREE.Color {
  // `setRGB` với `SRGBColorSpace`: byte đọc từ canvas là giá trị sRGB đã mã hoá
  // gamma, còn three tính sáng trong không gian tuyến tính. Bỏ tham số thứ tư
  // thì cảnh ra nhạt hơn token, và độ lệch đó nhỏ vừa đủ để không ai gọi là lỗi.
  return new THREE.Color().setRGB(rgb.r, rgb.g, rgb.b, THREE.SRGBColorSpace);
}

function point3(angleDeg: number, y = 0): THREE.Vector3 {
  const p = stagePointAt(angleDeg);
  return new THREE.Vector3(p.x, y, p.z);
}

interface StationProps {
  readonly id: StageId;
  readonly colors: HomeSceneColors;
  readonly activeRef: { current: number };
  readonly index: number;
  readonly timeRef: { current: number };
}

/**
 * Khối hình của một chặng.
 *
 * Mỗi chặng là hình học nguyên thuỷ, không phải một minh hoạ: bảy khối phải đọc
 * ra được ở cỡ nhỏ trên điện thoại, và một mô hình chi tiết ở cỡ đó chỉ còn là
 * một đốm. Chặng sáu là chặng duy nhất có hai màu cùng lúc, vì nó là chặng duy
 * nhất kể một sự kiện chứ không kể một vật.
 */
function Station({ id, colors, activeRef, index, timeRef }: StationProps): ReactElement {
  const group = useRef<THREE.Group>(null);
  const accent = useRef<THREE.Mesh>(null);

  const angle = useMemo(() => angleOfStage(index), [index]);
  const position = useMemo(() => point3(angle), [angle]);

  const idle = useMemo(() => toColor(colors.idle), [colors.idle]);
  const active = useMemo(() => toColor(colors.active), [colors.active]);
  const flow = useMemo(() => toColor(colors.flow), [colors.flow]);
  const healthy = useMemo(() => toColor(colors.healthy), [colors.healthy]);
  const failed = useMemo(() => toColor(colors.failed), [colors.failed]);

  useFrame(() => {
    const node = group.current;
    if (node === null) {
      return;
    }
    // Khoảng cách tới chặng đang được nói tới, tính bằng số chặng.
    const distance = Math.abs(activeRef.current - index);
    const focus = Math.max(0, 1 - distance);
    node.scale.setScalar(0.85 + focus * 0.35);

    node.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || child === accent.current) {
        return;
      }
      const material = child.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.copy(idle).lerp(active, focus);
      }
    });

    const spot = accent.current;
    if (spot === null) {
      return;
    }
    const t = timeRef.current;
    if (id === 'laptop') {
      // Con trỏ nhấp nháy. Chu kỳ 1.06 giây, đúng nhịp con trỏ của terminal.
      spot.visible = Math.sin(t * 5.9) > 0;
    } else if (id === 'heal') {
      // Pod chết rồi được dựng lại. Nửa chu kỳ đầu là đỏ, nửa sau là xanh, và
      // khối co lại ở đúng lúc đổi màu để mắt đọc ra hai vật khác nhau.
      const phase = (t % 3.2) / 3.2;
      const dying = phase < 0.5;
      const material = spot.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.copy(dying ? failed : healthy);
      }
      const swing = dying ? 1 - phase * 1.6 : (phase - 0.5) * 1.6;
      spot.scale.setScalar(Math.max(0.08, Math.min(1, swing)));
    } else if (id === 'serve') {
      spot.rotation.z = t * 0.9;
    }
  });

  return (
    <group ref={group} position={position}>
      {id === 'laptop' ? (
        <>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.62, 0.03, 0.4]} />
            <meshStandardMaterial color={idle} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.22, -0.17]} rotation={[-0.32, 0, 0]}>
            <boxGeometry args={[0.62, 0.4, 0.03]} />
            <meshStandardMaterial color={idle} roughness={0.6} />
          </mesh>
          <mesh ref={accent} position={[-0.2, 0.26, -0.13]} rotation={[-0.32, 0, 0]}>
            <boxGeometry args={[0.05, 0.12, 0.01]} />
            <meshStandardMaterial color={flow} emissive={flow} emissiveIntensity={0.8} />
          </mesh>
        </>
      ) : null}

      {id === 'commit' ? (
        <mesh position={[0, 0.2, 0]}>
          <octahedronGeometry args={[0.2, 0]} />
          <meshStandardMaterial color={idle} roughness={0.35} flatShading />
        </mesh>
      ) : null}

      {id === 'build' ? (
        <>
          {[0, 1, 2, 3].map((layer) => (
            <mesh key={layer} position={[0, 0.06 + layer * 0.11, 0]}>
              <boxGeometry args={[0.52 - layer * 0.09, 0.08, 0.52 - layer * 0.09]} />
              <meshStandardMaterial color={idle} roughness={0.55} />
            </mesh>
          ))}
        </>
      ) : null}

      {id === 'push' ? (
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.24, 0.24, 0.44, 24, 1, false]} />
          <meshStandardMaterial color={idle} roughness={0.45} />
        </mesh>
      ) : null}

      {id === 'schedule' || id === 'heal' ? (
        <>
          <mesh position={[0, 0.03, 0]}>
            <boxGeometry args={[0.78, 0.06, 0.56]} />
            <meshStandardMaterial color={idle} roughness={0.6} />
          </mesh>
          {[
            [-0.22, -0.14],
            [0.06, -0.14],
            [-0.22, 0.14],
          ].map(([px, pz]) => (
            <mesh key={`${String(px)}:${String(pz)}`} position={[px ?? 0, 0.15, pz ?? 0]}>
              <boxGeometry args={[0.17, 0.17, 0.17]} />
              <meshStandardMaterial color={idle} roughness={0.5} />
            </mesh>
          ))}
          <mesh ref={id === 'heal' ? accent : null} position={[0.24, 0.15, 0.14]}>
            <boxGeometry args={[0.17, 0.17, 0.17]} />
            <meshStandardMaterial
              color={id === 'heal' ? failed : idle}
              roughness={0.5}
              emissive={id === 'heal' ? failed : idle}
              emissiveIntensity={id === 'heal' ? 0.35 : 0}
            />
          </mesh>
        </>
      ) : null}

      {id === 'serve' ? (
        <mesh ref={accent} position={[0, 0.24, 0]}>
          <torusGeometry args={[0.24, 0.05, 12, 32]} />
          <meshStandardMaterial color={flow} emissive={flow} emissiveIntensity={0.5} />
        </mesh>
      ) : null}
    </group>
  );
}

interface DriverProps {
  readonly progressRef: { current: number };
  readonly activeRef: { current: number };
  readonly timeRef: { current: number };
  readonly reduced: boolean;
  readonly colors: HomeSceneColors;
  readonly onInvalidate: (invalidate: () => void) => void;
}

/**
 * Camera, ánh sáng, vòng, gói tin. Mọi thứ đọc `progressRef` mỗi khung.
 *
 * Camera bám theo tiến độ bằng `lerp` khi được phép chuyển động, và ĐẶT THẲNG
 * khi người dùng bật giảm chuyển động. Không có nhánh thứ ba: một `lerp` với hệ
 * số 1 vẫn là một `lerp` cần nhiều khung để hội tụ, mà ở chế độ giảm chuyển động
 * chỉ có đúng một khung được vẽ cho mỗi lượt cuộn.
 */
function Driver({
  progressRef,
  activeRef,
  timeRef,
  reduced,
  colors,
  onInvalidate,
}: DriverProps): ReactElement {
  const packet = useRef<THREE.Mesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    onInvalidate(invalidate);
  }, [invalidate, onInvalidate]);

  const curve = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= TRACK_SEGMENTS; i += 1) {
      points.push(point3(ARC_START_DEG + (ARC_SWEEP_DEG * i) / TRACK_SEGMENTS));
    }
    return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  }, []);

  const trackColor = useMemo(() => toColor(colors.track), [colors.track]);
  const flowColor = useMemo(() => toColor(colors.flow), [colors.flow]);
  const focusPoint = useMemo(() => new THREE.Vector3(), []);
  const wantedCamera = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    timeRef.current = reduced ? 0 : state.clock.elapsedTime;

    const angle = angleAtProgress(progressRef.current);
    const here = point3(angle, 0.24);
    focusPoint.lerp(here, reduced ? 1 : Math.min(1, delta * 3.2));

    // Camera lùi lại phía sau theo chiều đi, và cao hơn mặt vòng. Góc lùi 34 độ
    // giữ chặng kế tiếp luôn nằm trong khung, nên người xem thấy mình đang đi
    // TỚI đâu chứ không chỉ thấy chỗ vừa rời.
    const behind = point3(angle - 34);
    wantedCamera.set(behind.x * 1.55, 1.9, behind.z * 1.55 + 1.1);
    camera.position.lerp(wantedCamera, reduced ? 1 : Math.min(1, delta * 2.4));
    camera.lookAt(focusPoint);

    const marble = packet.current;
    if (marble !== null) {
      marble.position.copy(here);
      marble.rotation.y = timeRef.current * 1.4;
    }
  });

  return (
    <>
      <ambientLight intensity={1.15} />
      <directionalLight position={[3.5, 6, 4]} intensity={1.5} />
      <directionalLight position={[-4, 2, -3]} intensity={0.45} />

      <mesh>
        <tubeGeometry args={[curve, TRACK_SEGMENTS, TRACK_RADIUS, 8, false]} />
        <meshStandardMaterial color={trackColor} roughness={0.8} />
      </mesh>

      <mesh ref={packet}>
        <icosahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial
          color={flowColor}
          emissive={flowColor}
          emissiveIntensity={0.9}
          flatShading
        />
      </mesh>

      {STAGES.map((stage, index) => (
        <Station
          key={stage.id}
          id={stage.id}
          index={index}
          colors={colors}
          activeRef={activeRef}
          timeRef={timeRef}
        />
      ))}
    </>
  );
}

export interface LoopSceneProps {
  readonly progressRef: { current: number };
  readonly activeRef: { current: number };
  readonly reduced: boolean;
  readonly onInvalidate: (invalidate: () => void) => void;
}

/**
 * `export default` vì `next/dynamic` nạp chunk này qua một `import()` động, và
 * một named export bắt nơi gọi phải viết thêm một hàm chọn trường.
 */
export default function LoopScene({
  progressRef,
  activeRef,
  reduced,
  onInvalidate,
}: LoopSceneProps): ReactElement {
  const timeRef = useRef(0);

  /*
   * Màu đọc MỘT lần lúc mount, không đọc lại mỗi khung: `getComputedStyle` ép
   * trình duyệt tính lại bố cục, và làm việc đó 60 lần một giây là tự dựng một
   * điểm nghẽn ngay trong vòng vẽ.
   *
   * Cái giá: đổi theme trong lúc dải đang hiện thì cảnh giữ màu cũ tới lượt
   * mount sau. Nói ra thay vì giấu. Vỏ ngoài tháo canvas khi dải rời tầm nhìn,
   * nên trong thực tế lượt mount sau tới sớm.
   */
  const { colors, degraded } = useMemo(
    () => readHomeSceneColorsFrom(typeof document === 'undefined' ? undefined : document),
    [],
  );

  useEffect(() => {
    if (degraded) {
      console.warn(
        '[home] scene colour token(s) did not resolve; falling back to neutral grey',
      );
    }
  }, [degraded]);

  const background = useMemo(() => toColor(colors.background), [colors.background]);

  return (
    <Canvas
      /*
       * `demand` là điều kiện của cả cổng giảm chuyển động: không có nó thì R3F
       * tự chạy một vòng rAF riêng mà `startGatedFrameLoop` bên ngoài không với
       * tới, và trang sẽ TRÔNG NHƯ đã tuân thủ trong khi canvas vẫn quay.
       */
      frameloop="demand"
      dpr={[1, 1.75]}
      camera={{ fov: 45, near: 0.1, far: 40, position: [0, 1.9, 6.5] }}
      /*
       * KHÔNG lặp lại `failIfMajorPerformanceCaveat` ở đây. Phép dò trước lúc
       * mount đã trả lời câu đó rồi; đặt lại cờ ở lượt xin context THẬT chỉ mở
       * thêm một đường cho R3F ném giữa lúc dựng cây, và một ngoại lệ ở đây làm
       * hỏng cả trang chứ không chỉ làm mất cảnh.
       */
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ scene }) => {
        scene.background = background;
        scene.fog = new THREE.Fog(background, 7, 16);
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <Driver
        progressRef={progressRef}
        activeRef={activeRef}
        timeRef={timeRef}
        reduced={reduced}
        colors={colors}
        onInvalidate={onInvalidate}
      />
    </Canvas>
  );
}
