'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CatmullRomCurve3, type Group, type Mesh, TubeGeometry, Vector3 } from 'three';
import { t } from '@devops-platform/copy';
import { clamp01, stationEventAt } from '../../journey-timeline';
import { landingStore } from '../../motion/store';
import { glow } from '../palette';
import { css, easeOutBack, GlowMaterial, Label } from './kit';
import type { StationProps } from './stations';

const MAIN_Y = 1.3;
const MAIN_COMMITS = [-3.8, -2.2, -0.6];
const MERGE_X = 3.9;
/** Các commit trên nhánh feature, theo tham số dọc đường cong nhánh. */
const BRANCH_COMMITS = [0.3, 0.55, 0.8];
const BRANCH_SEGMENTS = 96;
const RADIAL = 6;

/**
 * Ga Git: đồ thị commit dựng thành khối. Sự kiện: nhánh feature mọc ra từ main, có ba commit,
 * rồi gộp ngược vào main ở commit hợp nhất, kèm một vòng sáng loé ra ở điểm gộp.
 */
export function GitStation({ index, palette, fonts }: StationProps) {
  const branchCurve = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(-2.2, MAIN_Y, 0),
        new Vector3(-1.2, MAIN_Y + 1.6, 0.7),
        new Vector3(0.8, MAIN_Y + 2.2, 0.9),
        new Vector3(2.7, MAIN_Y + 1.9, 0.7),
        new Vector3(MERGE_X, MAIN_Y, 0),
      ]),
    [],
  );
  const branch = useMemo(() => new TubeGeometry(branchCurve, BRANCH_SEGMENTS, 0.075, RADIAL, false), [branchCurve]);
  useEffect(() => () => branch.dispose(), [branch]);
  const branchNodes = useRef<(Mesh | null)[]>([]);
  const mergeNode = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const head = useRef<Group>(null);
  const labels = useMemo(
    () => ({
      main: { text: t('home.term.branch'), color: css(palette.git), family: fonts.mono, width: 512, height: 128 },
      feature: { text: 'feature', color: css(palette.star), family: fonts.mono, width: 512, height: 128 },
    }),
    [palette, fonts.mono],
  );

  useFrame(({ clock }) => {
    const event = stationEventAt(landingStore.journey, index);
    const grow = clamp01(event / 0.78);
    const indexCount = branch.index?.count ?? 0;
    const visible = Math.floor((grow * indexCount) / (RADIAL * 6)) * RADIAL * 6;
    branch.setDrawRange(0, visible);
    BRANCH_COMMITS.forEach((at, i) => {
      const node = branchNodes.current[i];
      if (node === null || node === undefined) return;
      const pop = clamp01((grow - at) / 0.1);
      node.scale.setScalar(pop === 0 ? 0.0001 : easeOutBack(pop));
    });
    const merged = clamp01((event - 0.8) / 0.12);
    if (mergeNode.current !== null) {
      mergeNode.current.scale.setScalar(0.85 + easeOutBack(merged) * 0.55 + Math.sin(clock.elapsedTime * 3) * 0.04 * merged);
    }
    if (ring.current !== null) {
      const flash = clamp01((event - 0.82) / 0.16);
      ring.current.visible = flash > 0 && flash < 1;
      ring.current.scale.setScalar(0.4 + flash * 3.2);
      const material = ring.current.material;
      if (!Array.isArray(material)) material.opacity = 1 - flash;
    }
    if (head.current !== null) head.current.rotation.y = clock.elapsedTime * 1.2;
  });

  return (
    <group position={[0, 0.2, 0]}>
      <mesh position={[0, MAIN_Y, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.075, 0.075, 9.2, RADIAL]} />
        <GlowMaterial color={palette.git} strength={2} />
      </mesh>
      {MAIN_COMMITS.map((x) => (
        <mesh key={x} position={[x, MAIN_Y, 0]}>
          <octahedronGeometry args={[0.36, 0]} />
          <GlowMaterial color={palette.git} strength={2.6} />
        </mesh>
      ))}
      <mesh geometry={branch}>
        <meshBasicMaterial color={glow(palette.star, 2.2)} toneMapped={false} />
      </mesh>
      {BRANCH_COMMITS.map((at, i) => (
        <mesh
          key={at}
          ref={(node) => {
            branchNodes.current[i] = node;
          }}
          position={branchCurve.getPointAt(at)}
        >
          <octahedronGeometry args={[0.3, 0]} />
          <GlowMaterial color={palette.star} strength={2.8} />
        </mesh>
      ))}
      <mesh ref={mergeNode} position={[MERGE_X, MAIN_Y, 0]}>
        <octahedronGeometry args={[0.46, 0]} />
        <GlowMaterial color={palette.ink} strength={2.6} />
      </mesh>
      <mesh ref={ring} position={[MERGE_X, MAIN_Y, 0]}>
        <torusGeometry args={[0.6, 0.04, 4, 32]} />
        <meshBasicMaterial color={glow(palette.star, 3)} toneMapped={false} transparent />
      </mesh>
      <group ref={head} position={[MERGE_X, MAIN_Y + 1.15, 0]}>
        <mesh rotation-x={Math.PI}>
          <coneGeometry args={[0.22, 0.42, 4]} />
          <GlowMaterial color={palette.cicd} strength={2.6} />
        </mesh>
      </group>
      <Label spec={labels.main} width={1.5} position={[-3.9, MAIN_Y - 0.62, 0.2]} />
      <Label spec={labels.feature} width={1.5} position={[0.8, MAIN_Y + 2.85, 0.9]} />
    </group>
  );
}
