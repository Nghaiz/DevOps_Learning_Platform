'use client';

import { useEffect, useRef, useState, type ComponentRef, type ReactElement, type RefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { CAMERA_TUNING, type ArenaSceneProps } from '../arena-contract';
import type { SceneRuntime } from './scene-entry';

/*
 * Kiểu của bộ điều khiển lấy QUA drei chứ không `import` thẳng `three-stdlib`:
 * `three-stdlib` là dependency của drei, không phải của app này, nên với node_modules
 * chặt của pnpm thì một import thẳng không phân giải được — và nó chỉ đỏ lúc build.
 */
type OrbitControlsHandle = ComponentRef<typeof OrbitControls>;

const TMP_DIR = new THREE.Vector3();
const GOAL_POSITION = new THREE.Vector3();
const GOAL_TARGET = new THREE.Vector3();

/** Hệ số giảm chấn của chuyển động bay tới. Độc lập nhịp khung hình qua `1 - exp(-dt·k)`. */
const FLY_DAMP = 3.4;
/** Bình phương khoảng cách dưới mức này thì coi như đã tới nơi. */
const ARRIVED_SQ = 1e-4;

export interface CameraRigProps {
  readonly runtime: SceneRuntime;
  readonly propsRef: RefObject<ArenaSceneProps>;
  readonly reducedMotion: boolean;
}

/**
 * Điều khiển camera: xoay bằng kéo trái, kéo bằng kéo phải, phóng bằng lăn chuột.
 *
 * Mọi con số lấy từ `CAMERA_TUNING` trong hợp đồng, KHÔNG chọn lại ở đây — nếu
 * scene và test đọc hai bộ số khác nhau thì test không còn gác cái gì cả.
 *
 * Lệnh camera là SỰ KIỆN có dấu thời gian, không phải trạng thái: bấm "về góc
 * nhìn" hai lần liên tiếp phải bay hai lần, mà hai prop trạng thái giống hệt
 * nhau thì lần thứ hai rơi vào hư không.
 */
export function CameraRig({ runtime, propsRef, reducedMotion }: CameraRigProps): ReactElement {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const controlsRef = useRef<OrbitControlsHandle | null>(null);
  const flyingRef = useRef(false);
  const handledRef = useRef<number>(-1);
  /** Đã đóng khung lần đầu chưa. Cụm chưa đồng bộ thì `radius` còn là giá trị khởi tạo. */
  const framedRef = useRef(false);
  const [spinning, setSpinning] = useState(false);

  /** Khoảng cách đủ ôm trọn cụm mà vẫn chừa lề. Sàn cần cho cụm chỉ có một node. */
  function frameDistance(): number {
    return Math.max(8, runtime.radius * 1.35);
  }

  /** Bắt đầu bay tới mục tiêu đã ghi vào `GOAL_*`, hoặc nhảy thẳng nếu người dùng tắt chuyển động. */
  function departure(): void {
    flyingRef.current = true;
    if (reducedMotion) {
      // Chuyển động camera là đúng loại chuyển động mà người bật "giảm chuyển
      // động" muốn tránh nhất — nhảy thẳng tới nơi.
      camera.position.copy(GOAL_POSITION);
      controlsRef.current?.target.copy(GOAL_TARGET);
      flyingRef.current = false;
    }
  }

  useEffect(() => {
    const command = propsRef.current.cameraCommand;
    if (command === null || command.issuedAt === handledRef.current) {
      return;
    }
    handledRef.current = command.issuedAt;

    const distance = frameDistance();
    if (command.kind === 'reset') {
      GOAL_TARGET.set(0, 0, 0);
      GOAL_POSITION.set(0, distance * 0.46, distance);
    } else if (command.kind === 'frame-all') {
      GOAL_TARGET.set(0, 0, 0);
      // Giữ nguyên hướng nhìn hiện tại: người dùng vừa chọn một góc, "đóng khung
      // tất cả" không có lý do gì để cướp lại góc đó — nó chỉ cần lùi ra đủ xa.
      TMP_DIR.copy(camera.position).sub(GOAL_TARGET).normalize();
      GOAL_POSITION.copy(GOAL_TARGET).addScaledVector(TMP_DIR, distance);
    } else {
      const entry = command.uid === undefined ? undefined : runtime.entries.get(command.uid);
      if (entry === undefined) {
        return;
      }
      GOAL_TARGET.set(entry.x, entry.drawY, entry.z);
      TMP_DIR.copy(camera.position).sub(GOAL_TARGET).normalize();
      GOAL_POSITION.copy(GOAL_TARGET).addScaledVector(TMP_DIR, Math.max(CAMERA_TUNING.minDistance + 1, 7));
    }

    framedRef.current = true;
    departure();
    invalidate();
  });

  // ── Xoay nhàn rỗi ─────────────────────────────────────────────────────────
  // Hẹn giờ chứ không đếm trong vòng lặp vẽ: khi cảnh đứng yên thì KHÔNG có
  // khung hình nào chạy, nên một bộ đếm trong `useFrame` sẽ không bao giờ tới
  // ngưỡng — đúng lúc cần nó nhất.
  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    const controls = controlsRef.current;
    if (controls === null) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (): void => {
      window.clearTimeout(timer);
      setSpinning(false);
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible') {
          setSpinning(true);
          invalidate();
        }
      }, CAMERA_TUNING.idleSpinAfterMs);
    };
    const stop = (): void => {
      flyingRef.current = false;
      arm();
    };
    controls.addEventListener('start', stop);
    document.addEventListener('visibilitychange', arm);
    arm();
    return () => {
      window.clearTimeout(timer);
      controls.removeEventListener('start', stop);
      document.removeEventListener('visibilitychange', arm);
    };
  }, [invalidate, reducedMotion]);

  useFrame((_state, dt) => {
    /*
     * Đóng khung lần đầu ngay khi cụm có hình dạng thật.
     *
     * Không làm trong effect lúc mount: lúc đó `radius` còn là giá trị khởi tạo
     * vì chưa có lần `sync()` nào, nên camera sẽ đóng khung một cụm rỗng rồi
     * đứng yên ở đó — người chơi vào bài và thấy một khung hình lệch.
     */
    if (!framedRef.current && runtime.structureVersion > 0) {
      framedRef.current = true;
      const distance = frameDistance();
      GOAL_TARGET.set(0, 0, 0);
      GOAL_POSITION.set(0, distance * 0.46, distance);
      departure();
    }
    if (!flyingRef.current) {
      return;
    }
    const controls = controlsRef.current;
    const damp = 1 - Math.exp(-dt * FLY_DAMP);
    camera.position.lerp(GOAL_POSITION, damp);
    controls?.target.lerp(GOAL_TARGET, damp);
    if (camera.position.distanceToSquared(GOAL_POSITION) < ARRIVED_SQ) {
      camera.position.copy(GOAL_POSITION);
      controls?.target.copy(GOAL_TARGET);
      flyingRef.current = false;
    }
    invalidate();
  }, -1.5);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={CAMERA_TUNING.dampingFactor}
      minPolarAngle={CAMERA_TUNING.minPolarAngle}
      maxPolarAngle={CAMERA_TUNING.maxPolarAngle}
      minDistance={CAMERA_TUNING.minDistance}
      maxDistance={CAMERA_TUNING.maxDistance}
      autoRotate={spinning}
      autoRotateSpeed={CAMERA_TUNING.idleSpinSpeed}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
    />
  );
}
