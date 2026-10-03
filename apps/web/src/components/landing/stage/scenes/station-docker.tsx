'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { type Group, type InstancedMesh, MathUtils, Object3D } from 'three';
import { t } from '@devops-platform/copy';
import { clamp01, stationEventAt } from '../../journey-timeline';
import { landingStore } from '../../motion/store';
import type { LabelSpec } from '../labels';
import { css, DarkMaterial, easeOutCubic, GlowEdges, Label } from './kit';
import type { StationProps } from './stations';

const SLAB_HEIGHT = 0.4;
const SLAB_GAP = 0.06;
const RIBS = 9;
/** Mỗi layer rơi trong một khoảng ngắn, lệch nhau ngần này phần của sự kiện. */
const DROP_STAGGER = 0.11;
const DROP_SPAN = 0.14;

/** Nhãn layer lấy từ chính output `docker build` trong copy, bỏ tiền tố "=> [n/4]". */
export function layerLabels(buildOutput: string): readonly string[] {
  const lines = buildOutput.split('\n').slice(1);
  return lines.map((line) =>
    line
      .replace(/^\s*=>\s*(\[\d+\/\d+\]\s*)?/, '')
      .replace(/^naming to docker\.io\/library\//, 'TAG ')
      .trim(),
  );
}

const bounce = (x: number): number => {
  if (x < 1 / 2.75) return 7.5625 * x * x;
  if (x < 2 / 2.75) return 7.5625 * (x - 1.5 / 2.75) ** 2 + 0.75;
  if (x < 2.5 / 2.75) return 7.5625 * (x - 2.25 / 2.75) ** 2 + 0.9375;
  return 7.5625 * (x - 2.625 / 2.75) ** 2 + 0.984375;
};

/**
 * Ga Docker: từng layer của image rơi xuống xếp chồng theo đúng thứ tự Dockerfile, rồi một
 * container gân sóng mọc lên bao trọn chồng layer (image đã thành thứ chạy được).
 */
export function DockerStation({ index, palette, fonts }: StationProps) {
  const labels = useMemo(() => layerLabels(t('home.term.out.build')), []);
  const slabs = useRef<(Group | null)[]>([]);
  const shell = useRef<Group>(null);
  const ribs = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const specs = useMemo<LabelSpec[]>(
    () =>
      labels.map((text) => ({
        text,
        color: css(palette.ink),
        accent: css(palette.docker),
        background: css(palette['bg-2'], 0.94),
        family: fonts.mono,
        width: 1024,
        height: 128,
      })),
    [labels, palette, fonts.mono],
  );

  useLayoutEffect(() => {
    const mesh = ribs.current;
    if (mesh === null) return;
    for (let i = 0; i < RIBS * 2; i += 1) {
      const side = i < RIBS ? 1 : -1;
      const k = i % RIBS;
      dummy.position.set(-2.1 + (k * 4.2) / (RIBS - 1), 0, side * 1.42);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  useFrame(({ clock }) => {
    const event = stationEventAt(landingStore.journey, index);
    slabs.current.forEach((slab, i) => {
      if (slab === null || slab === undefined) return;
      const drop = clamp01((event - i * DROP_STAGGER) / DROP_SPAN);
      const rest = SLAB_HEIGHT / 2 + i * (SLAB_HEIGHT + SLAB_GAP);
      slab.visible = drop > 0;
      slab.position.y = MathUtils.lerp(rest + 7 + i, rest, bounce(drop));
      slab.rotation.y = (1 - drop) * 0.6;
    });
    const close = easeOutCubic(clamp01((event - 0.66) / 0.24));
    const node = shell.current;
    if (node !== null) {
      node.visible = close > 0.001;
      node.scale.set(1, Math.max(close, 0.001), 1);
      node.position.y = 0.05 + Math.sin(clock.elapsedTime * 1.3) * 0.03 * close;
    }
  });

  return (
    <group position={[0.6, 0, -0.4]}>
      {specs.map((spec, i) => (
        <group
          key={spec.text}
          ref={(node) => {
            slabs.current[i] = node;
          }}
        >
          <mesh>
            <boxGeometry args={[3.8, SLAB_HEIGHT, 2.4]} />
            <DarkMaterial palette={palette} shade={i % 2 === 0 ? 'bg-2' : 'bg-3'} />
            <GlowEdges color={palette.docker} strength={2} />
          </mesh>
          <Label spec={spec} width={3.6} position={[0, 0, 1.21]} />
        </group>
      ))}
      <group ref={shell}>
        <mesh position={[0, 1.5, 0]}>
          <boxGeometry args={[4.6, 3, 2.9]} />
          <meshStandardMaterial
            color={palette.docker}
            roughness={0.35}
            metalness={0.55}
            transparent
            opacity={0.42}
            depthWrite={false}
          />
          <GlowEdges color={palette.docker} strength={3} width={1.8} />
        </mesh>
        <instancedMesh ref={ribs} args={[undefined, undefined, RIBS * 2]} position={[0, 1.5, 0]}>
          <boxGeometry args={[0.06, 2.8, 0.06]} />
          <meshBasicMaterial color={palette.docker} toneMapped={false} transparent opacity={0.55} />
        </instancedMesh>
      </group>
    </group>
  );
}
