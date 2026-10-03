'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { PerspectiveCamera} from 'three';
import { Color, Fog, MathUtils, Vector3 } from 'three';
import { STATION_IDS } from '../content';
import { easeInOutCubic, STATION_COUNT, trackAt } from '../journey-timeline';
import { landingStore } from '../motion/store';
import type { PaletteKey, StagePalette } from './palette';
import { heroPose, infinityPose, makePose, rackPose, trackPose, type Pose } from './world';

const BASE_FOV = 42;

const lerpPose = (from: Pose, to: Pose, amount: number, out: Pose): Pose => {
  out.position.copy(from.position).lerp(to.position, amount);
  out.target.copy(from.target).lerp(to.target, amount);
  return out;
};

/**
 * Chọn tư thế camera theo khu đang trên màn hình, rồi bám theo bằng giảm chấn hàm mũ. Lenis đã
 * làm mượt vị trí cuộn, nên giảm chấn ở đây nhẹ (chỉ để nuốt răng cưa của con trỏ và các chỗ đổi
 * khu), không phải một lớp làm mượt thứ hai khiến camera trễ hẳn sau chữ.
 *
 * Màu nền và sương mù cũng đổi theo khu: ngả về màu tuyến của ga đang đứng.
 */
export function CameraRig({ palette }: { readonly palette: StagePalette }) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const scene = useThree((state) => state.scene);
  const work = useMemo(() => ({ goal: makePose(), a: makePose(), b: makePose() }), []);
  const current = useRef<Pose | null>(null);
  const tint = useMemo(() => new Color(), []);
  const background = useMemo(() => palette.bg.clone(), [palette]);
  const lookAt = useMemo(() => new Vector3(), []);

  useFrame((_, rawDelta) => {
    const store = landingStore;
    const { goal, a, b } = work;
    let tone: PaletteKey = 'red';
    let parallax = 1;

    if (store.visible.closing && store.closingIn > 0) {
      infinityPose(store.closing, goal);
      tone = 'observe';
      parallax = 0.6;
    } else if (store.terminalIn > 0 && !store.visible.journey) {
      trackPose(STATION_COUNT - 1, a);
      rackPose(store.terminal, b);
      lerpPose(a, b, easeInOutCubic(store.terminalIn), goal);
      tone = 'docker';
      parallax = 0.35;
    } else if (store.journey > 0) {
      const track = trackAt(store.journey);
      trackPose(track, goal);
      tone = STATION_IDS[MathUtils.clamp(Math.round(track), 0, STATION_COUNT - 1)] ?? 'red';
      parallax = 0.25;
    } else {
      heroPose(a);
      trackPose(-1, b);
      lerpPose(a, b, easeInOutCubic(store.heroOut), goal);
    }

    goal.position.x += store.pointerX * 1.1 * parallax;
    goal.position.y -= store.pointerY * 0.6 * parallax;

    const delta = Math.min(rawDelta, 0.25);
    const pose = current.current;
    if (pose === null || rawDelta > 0.2) {
      current.current = { position: goal.position.clone(), target: goal.target.clone() };
    } else {
      const k = 1 - Math.exp(-delta * 9);
      pose.position.lerp(goal.position, k);
      pose.target.lerp(goal.target, k);
    }
    const settled = current.current;
    if (settled === null) return;
    camera.position.copy(settled.position);
    camera.lookAt(lookAt.copy(settled.target));

    const fov = BASE_FOV + Math.min(Math.abs(store.velocity) * 0.16, 7);
    camera.fov = MathUtils.lerp(camera.fov, fov, 1 - Math.exp(-delta * 6));
    camera.updateProjectionMatrix();

    tint.copy(palette.bg).lerp(palette[tone], tone === 'linux' || tone === 'git' ? 0.018 : 0.035);
    background.lerp(tint, 1 - Math.exp(-delta * 2.5));
    scene.background = background;
    if (scene.fog instanceof Fog) scene.fog.color.copy(background);
  });

  return null;
}
