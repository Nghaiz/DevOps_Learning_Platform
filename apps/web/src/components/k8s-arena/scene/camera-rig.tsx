'use client';

import { useEffect, useRef, type ComponentRef, type ReactElement, type RefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { PLATFORM_HEIGHT } from '../shared/scene-layout';
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
 *
 * ⛔ KHÔNG có xoay tự động khi nhàn rỗi. Hợp đồng từng có `idleSpinAfterMs` và
 * đã gỡ hẳn ngày 2026-09-08 sau khi đo: sau 30 giây nó vẽ liên tục ~14 fps và
 * KHÔNG BAO GIỜ tự dừng — kể cả khi mô phỏng đã tạm dừng (tick đứng ở 0 mà vẫn
 * 41–45 khung mỗi 3 giây). Ba cái giá phải trả: quạt máy chạy mãi cho một cảnh
 * không ai đang xem; mọi cổng đo hiệu năng chỉ còn đúng trong 30 giây đầu; và
 * camera tự trôi trong lúc người ta đang đọc bảng thông số thì phiền chứ không
 * sinh động. Đừng thêm lại.
 */
export function CameraRig({ runtime, propsRef, reducedMotion }: CameraRigProps): ReactElement {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const controlsRef = useRef<OrbitControlsHandle | null>(null);
  const flyingRef = useRef(false);
  const handledRef = useRef<number>(-1);
  /** Đã đóng khung lần đầu chưa. Cụm chưa đồng bộ thì `radius` còn là giá trị khởi tạo. */
  const framedRef = useRef(false);

  /** Khoảng cách đủ ôm trọn cụm mà vẫn chừa lề. Mọi hệ số lấy từ hợp đồng. */
  function frameDistance(): number {
    const aspectMargin = Math.max(1, size.height / Math.max(1, size.width - 80));
    return Math.min(
      CAMERA_TUNING.maxDistance * 0.75,
      Math.max(CAMERA_TUNING.minFrameDistance, runtime.radius * CAMERA_TUNING.frameFillFactor) *
        aspectMargin,
    );
  }

  /** Ghi `GOAL_*` cho một điểm ngắm, giữ nguyên hướng nhìn hiện tại. */
  function aimAt(x: number, y: number, z: number, distance: number): void {
    GOAL_TARGET.set(x, y, z);
    TMP_DIR.copy(camera.position).sub(GOAL_TARGET).normalize();
    GOAL_POSITION.copy(GOAL_TARGET).addScaledVector(TMP_DIR, distance);
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
      GOAL_POSITION.set(distance * 0.48, distance * 0.72, distance * 0.88);
    } else if (command.kind === 'frame-all') {
      // Giữ nguyên hướng nhìn hiện tại: người dùng vừa chọn một góc, "đóng khung
      // tất cả" không có lý do gì để cướp lại góc đó — nó chỉ cần lùi ra đủ xa.
      aimAt(0, 0, 0, distance);
    } else if (command.nodeName !== undefined) {
      /*
       * Bay tới một NODE. Nhánh riêng vì node không mang uid — hợp đồng tách
       * `nodeName` khỏi `uid` đúng để chỗ này không phải đoán xem chuỗi đang
       * cầm là loại nào, và đoán sai thì camera bay vào hư không mà không báo gì.
       */
      const node = runtime.nodes.find((n) => n.name === command.nodeName);
      if (node === undefined) {
        return;
      }
      aimAt(node.x, PLATFORM_HEIGHT / 2, 0, CAMERA_TUNING.focusDistance);
    } else {
      const entry = command.uid === undefined ? undefined : runtime.entries.get(command.uid);
      if (entry === undefined) {
        return;
      }
      aimAt(
        entry.x,
        entry.drawY,
        entry.z,
        Math.max(CAMERA_TUNING.minDistance + 1, CAMERA_TUNING.focusDistance),
      );
    }

    framedRef.current = true;
    departure();
    invalidate();
  });

  /*
   * Bộ điều khiển cần biết khi người dùng bắt đầu thao tác, để huỷ cú bay đang
   * dở — nếu không, camera vừa bị kéo tay vừa bị lệnh bay kéo ngược lại.
   */
  useEffect(() => {
    const controls = controlsRef.current;
    if (controls === null) {
      return;
    }
    const stop = (): void => {
      flyingRef.current = false;
    };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, []);

  useFrame((_state, dt) => {
    /*
     * ⛔ KHÔNG ghi `controls.enabled` ở đây. `pointer-picking.tsx` là người sở
     * hữu duy nhất của cờ đó (luật 4 trong khối tài liệu của nó). Bản trước ghi
     * nó MỖI KHUNG HÌNH theo `runtime.draggingUid`; hai người ghi một cờ nghĩa là
     * khi effect dò chuột bị dựng lại giữa cú kéo, `draggingUid` còn sót khác
     * `null` và vòng lặp này tắt camera vĩnh viễn.
     *
     * Cú kéo vẫn phải HUỶ lệnh bay: camera bay trong lúc người chơi đang kéo thì
     * mặt phẳng kéo trượt dưới tay họ.
     */
    if (runtime.draggingUid !== null) {
      flyingRef.current = false;
      return;
    }
    /*
     * Đóng khung lần đầu ngay khi cụm có hình dạng thật — không làm lúc mount,
     * vì khi đó chưa có lần `sync()` nào nên `radius` còn là giá trị khởi tạo và
     * camera sẽ đóng khung một cụm rỗng rồi đứng yên ở đó.
     */
    if (!framedRef.current && runtime.structureVersion > 0) {
      framedRef.current = true;
      const distance = frameDistance();
      GOAL_TARGET.set(0, 0, 0);
      GOAL_POSITION.set(distance * 0.48, distance * 0.72, distance * 0.88);
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
      enableDamping={false}
      dampingFactor={CAMERA_TUNING.dampingFactor}
      minPolarAngle={CAMERA_TUNING.minPolarAngle}
      maxPolarAngle={CAMERA_TUNING.maxPolarAngle}
      minDistance={CAMERA_TUNING.minDistance}
      maxDistance={CAMERA_TUNING.maxDistance}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
    />
  );
}
