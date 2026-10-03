'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type Group, type InstancedMesh, type Mesh, MathUtils, Object3D } from 'three';
import { clamp01, stationEventAt } from '../../journey-timeline';
import { landingStore } from '../../motion/store';
import { glow } from '../palette';
import { css, DarkMaterial, easeOutBack, GlowEdges, GlowMaterial, Label } from './kit';
import type { StationProps } from './stations';

const NODE_X = [-3.2, 0, 3.2];
const SLOT_X = [-0.72, 0, 0.72];
/** Sáu pod đầu tiên rải đều ba node; pod thứ 7 là bản thay thế mọc ở node-3 sau sự cố. */
const PLAN: readonly { readonly node: number; readonly slot: number; readonly at: number }[] = [
  { node: 0, slot: 0, at: 0.02 },
  { node: 1, slot: 0, at: 0.07 },
  { node: 2, slot: 0, at: 0.12 },
  { node: 0, slot: 1, at: 0.17 },
  { node: 1, slot: 1, at: 0.22 },
  { node: 2, slot: 1, at: 0.27 },
  { node: 2, slot: 2, at: 0.64 },
];
const CRASHED = 4;
const REPLACEMENT = 6;
const PENDING_SPAN = 0.06;
const SPOKES = 7;

/**
 * Ga Kubernetes: bánh lái bảy nan quay trên ba node. Sự kiện: sáu pod lần lượt được lập lịch
 * (vàng Pending, rồi xanh Running), một pod chết đỏ và rung, bị dọn đi, rồi một pod thay thế rơi
 * xuống node khác: cụm tự chữa lành, đúng câu chữ của thẻ ga.
 */
export function K8sStation({ index, palette, fonts }: StationProps) {
  const pods = useRef<InstancedMesh>(null);
  const wheel = useRef<Group>(null);
  const halo = useRef<Mesh>(null);
  const work = useMemo(() => ({ dummy: new Object3D(), color: new Color() }), []);
  const tones = useMemo(
    () => ({ pending: glow(palette.linux, 2.8), running: glow(palette.cicd, 2.8), crash: glow(palette.red, 3.4) }),
    [palette],
  );
  const nodeLabels = useMemo(
    () =>
      NODE_X.map((_, i) => ({
        text: `node-${i + 1}`,
        color: css(palette.muted),
        family: fonts.mono,
        width: 512,
        height: 128,
      })),
    [palette, fonts.mono],
  );

  /* instanceColor phải có TRƯỚC lượt vẽ đầu: material biên dịch shader một lần, và nếu lúc đó
     chưa có màu theo instance thì setColorAt về sau không còn tác dụng. */
  useLayoutEffect(() => {
    const mesh = pods.current;
    if (mesh === null) return;
    PLAN.forEach((_, i) => mesh.setColorAt(i, tones.pending));
  }, [tones]);

  useFrame(({ clock }, delta) => {
    const mesh = pods.current;
    if (mesh === null) return;
    const event = stationEventAt(landingStore.journey, index);
    const time = clock.elapsedTime;
    const { dummy, color } = work;
    PLAN.forEach((pod, i) => {
      const appear = clamp01((event - pod.at) / 0.05);
      let scale = appear === 0 ? 0.0001 : easeOutBack(appear);
      let y = 0.55;
      let x = (NODE_X[pod.node] ?? 0) + (SLOT_X[pod.slot] ?? 0);
      color.copy(event - pod.at < PENDING_SPAN ? tones.pending : tones.running);
      if (i === CRASHED) {
        const crash = clamp01((event - 0.42) / 0.06);
        const gone = clamp01((event - 0.54) / 0.08);
        if (crash > 0) {
          color.copy(tones.crash);
          x += Math.sin(time * 48) * 0.05 * (1 - gone);
        }
        scale *= 1 - gone;
      }
      if (i === REPLACEMENT) {
        const fall = clamp01((event - pod.at) / 0.08);
        y = MathUtils.lerp(4.2, 0.55, fall * fall);
      }
      dummy.position.set(x, y, 0.5);
      dummy.rotation.set(0, i === REPLACEMENT ? (1 - clamp01((event - pod.at) / 0.08)) * Math.PI : 0, 0);
      dummy.scale.setScalar(Math.max(scale, 0.0001));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;

    const healing = clamp01((event - 0.7) / 0.18);
    if (wheel.current !== null) wheel.current.rotation.z -= delta * (0.35 + healing * 1.6 * (1 - healing) * 4);
    if (halo.current !== null) {
      halo.current.visible = healing > 0 && healing < 1;
      halo.current.scale.setScalar(0.5 + healing * 2.6);
      const material = halo.current.material;
      if (!Array.isArray(material)) material.opacity = 1 - healing;
    }
  });

  return (
    <group position={[0, 0, 0.2]}>
      {NODE_X.map((x, i) => {
        const spec = nodeLabels[i];
        return (
          <group key={x} position={[x, 0.11, 0.5]}>
            <mesh>
              <boxGeometry args={[2.6, 0.22, 2.4]} />
              <DarkMaterial palette={palette} shade="bg-3" />
              <GlowEdges color={palette.k8s} strength={1.8} />
            </mesh>
            {spec === undefined ? null : (
              <Label spec={spec} width={1.4} position={[0, 0.13, 1.0]} rotation={[-Math.PI / 2, 0, 0]} />
            )}
          </group>
        );
      })}
      <instancedMesh ref={pods} args={[undefined, undefined, PLAN.length]} frustumCulled={false}>
        <boxGeometry args={[0.52, 0.52, 0.52]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <group ref={wheel} position={[0, 4.4, -1.4]}>
        <mesh>
          <torusGeometry args={[1.9, 0.09, 4, SPOKES]} />
          <GlowMaterial color={palette.k8s} strength={2.8} />
        </mesh>
        {Array.from({ length: SPOKES }, (_, i) => (
          <mesh key={i} rotation-z={(i * Math.PI * 2) / SPOKES} position={[0, 0, 0]}>
            <boxGeometry args={[0.07, 3.8, 0.07]} />
            <GlowMaterial color={palette.k8s} strength={1.8} />
          </mesh>
        ))}
        <mesh rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.42, 0.42, 0.22, SPOKES]} />
          <GlowMaterial color={palette.ink} strength={2.2} />
        </mesh>
      </group>
      <mesh ref={halo} position={[NODE_X[2] ?? 0, 0.6, 0.5]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.8, 0.04, 4, 48]} />
        <meshBasicMaterial color={glow(palette.cicd, 3)} toneMapped={false} transparent />
      </mesh>
    </group>
  );
}
