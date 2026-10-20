'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type Group, type InstancedMesh, type Mesh, Object3D } from 'three';
import { clamp01 } from '../../journey-timeline';
import { landingStore } from '../../motion/store';
import { CHECK_AT, PODS_IN, STEP_STARTS } from '../../sections/terminal-script';
import { glow, type StagePalette } from '../palette';
import { frameAt, RACK_U, rackCenter } from '../world';
import { DarkMaterial, easeOutBack, GlowEdges } from './kit';

const UNITS = 6;
const POD_SLOTS = 3;

/**
 * Giá máy sandbox nằm sau khung terminal: thứ mà các lệnh trong khung đang thật sự điều khiển.
 * Đèn của sáu khay quét lên xuống khi build, ba pod mọc trên nóc giá và chuyển xanh đúng lúc
 * dòng `Running` hiện trong terminal (đọc `landingStore.runningPods`), vòng xanh loé ra khi
 * bấm Kiểm tra.
 */
export function SandboxRack({ palette }: { readonly palette: StagePalette }) {
  const root = useRef<Group>(null);
  const leds = useRef<InstancedMesh>(null);
  const pods = useRef<InstancedMesh>(null);
  const ring = useRef<Mesh>(null);
  const placement = useMemo(() => {
    const frame = frameAt(RACK_U);
    const facing = frame.tangent.clone().negate();
    return { position: rackCenter(), yaw: Math.atan2(facing.x, facing.z) };
  }, []);
  const work = useMemo(() => ({ dummy: new Object3D(), color: new Color() }), []);
  const tones = useMemo(
    () => ({
      dim: palette['bg-3'].clone(),
      scan: glow(palette.docker, 3.2),
      pending: glow(palette.linux, 2.8),
      running: glow(palette.cicd, 3),
    }),
    [palette],
  );
  useLayoutEffect(() => {
    const strip = leds.current;
    const slots = pods.current;
    if (strip === null || slots === null) return;
    const { dummy } = work;
    for (let i = 0; i < UNITS; i += 1) {
      dummy.position.set(0, 0.62 + i * 0.78, 1.02);
      dummy.updateMatrix();
      strip.setMatrixAt(i, dummy.matrix);
      strip.setColorAt(i, tones.dim);
    }
    strip.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < POD_SLOTS; i += 1) slots.setColorAt(i, tones.pending);
  }, [work, tones]);

  useFrame(({ clock }) => {
    const node = root.current;
    const strip = leds.current;
    const slots = pods.current;
    if (node === null || strip === null || slots === null) return;
    const store = landingStore;
    node.visible = store.visible.terminal || (store.terminalIn > 0 && !store.visible.closing);
    if (!node.visible) return;
    const progress = store.terminal;
    const time = clock.elapsedTime;
    const building = progress < (STEP_STARTS[1] ?? 0.32);
    for (let i = 0; i < UNITS; i += 1) {
      const sweep = (Math.sin(time * 5 - i * 0.9) + 1) / 2;
      strip.setColorAt(i, building ? work.color.copy(tones.dim).lerp(tones.scan, sweep) : tones.running);
    }
    if (strip.instanceColor !== null) strip.instanceColor.needsUpdate = true;

    const appear = clamp01((progress - (PODS_IN[0] ?? 0.56)) / 0.06);
    const { dummy } = work;
    for (let i = 0; i < POD_SLOTS; i += 1) {
      const grow = clamp01(appear * POD_SLOTS - i);
      dummy.position.set((i - 1) * 1.15, 5.6 + Math.sin(time * 2 + i) * 0.08, 0.2);
      dummy.rotation.set(0, time * 0.6 + i, 0);
      dummy.scale.setScalar(Math.max(easeOutBack(grow), 0.0001));
      dummy.updateMatrix();
      slots.setMatrixAt(i, dummy.matrix);
      slots.setColorAt(i, i < store.runningPods ? tones.running : tones.pending);
    }
    slots.instanceMatrix.needsUpdate = true;
    if (slots.instanceColor !== null) slots.instanceColor.needsUpdate = true;

    if (ring.current !== null) {
      const flash = clamp01((progress - CHECK_AT) / 0.07);
      ring.current.visible = flash > 0 && flash < 1;
      ring.current.scale.setScalar(1 + flash * 4);
      const material = ring.current.material;
      if (!Array.isArray(material)) material.opacity = 1 - flash;
    }
  });

  return (
    <group ref={root} position={placement.position} rotation-y={placement.yaw}>
      <mesh position={[0, -0.12, 0]}>
        <boxGeometry args={[8, 0.24, 6]} />
        <DarkMaterial palette={palette} />
        <GlowEdges color={palette.docker} strength={1.4} />
      </mesh>
      <mesh position={[0, 2.5, 0]}>
        <boxGeometry args={[2.9, 5, 2]} />
        <DarkMaterial palette={palette} shade="bg-3" />
        <GlowEdges color={palette.docker} strength={2.4} width={1.6} />
      </mesh>
      {Array.from({ length: UNITS }, (_, i) => (
        <mesh key={i} position={[0, 0.62 + i * 0.78, 0.9]}>
          <boxGeometry args={[2.6, 0.6, 0.2]} />
          <DarkMaterial palette={palette} />
        </mesh>
      ))}
      <instancedMesh ref={leds} args={[undefined, undefined, UNITS]}>
        <planeGeometry args={[2.1, 0.08]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={pods} args={[undefined, undefined, POD_SLOTS]} frustumCulled={false}>
        <boxGeometry args={[0.9, 0.9, 0.9]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <mesh ref={ring} position={[0, 0.05, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[1.6, 0.05, 4, 64]} />
        <meshBasicMaterial color={glow(palette.cicd, 3)} toneMapped={false} transparent />
      </mesh>
    </group>
  );
}
