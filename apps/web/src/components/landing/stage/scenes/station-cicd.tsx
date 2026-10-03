'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type InstancedMesh, type Mesh, Object3D } from 'three';
import { t } from '@devops-platform/copy';
import { stationEventAt } from '../../journey-timeline';
import { landingStore } from '../../motion/store';
import { glow } from '../palette';
import { css, DarkMaterial, GlowEdges, Label } from './kit';
import type { StationProps } from './stations';

const GATE_X = [-3.9, -1.3, 1.3, 3.9];
/** Mốc cổng chuyển xanh. Cổng test (thứ hai) đỏ trước ở lần chạy đầu, chạy lại mới xanh. */
const GREEN_AT = [0.14, 0.5, 0.66, 0.86];
const RED_FROM = 0.28;
const PACKETS = 4;
const RAIL_HALF = 5.2;

/** Tên stage lấy từ dòng lệnh của ga trong copy: `stages: [build, test, scan, deploy]`. */
export function stageNames(command: string): readonly string[] {
  const inside = /\[(.*)\]/.exec(command)?.[1] ?? '';
  return inside
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/**
 * Ga CI/CD: bốn cổng trên một đường ray, gói build chạy qua. Sự kiện: cổng lần lượt bật xanh;
 * cổng test đỏ ở lần đầu (gói dồn lại trước nó), sửa xong chạy lại thì xanh và gói đi tiếp.
 */
export function CicdStation({ index, palette, fonts }: StationProps) {
  const names = useMemo(() => stageNames(t('home.station.cicd.cmd')), []);
  const lights = useRef<(Mesh | null)[]>([]);
  const packets = useRef<InstancedMesh>(null);
  const work = useMemo(() => ({ dummy: new Object3D(), color: new Color() }), []);
  const tones = useMemo(
    () => ({
      idle: palette.faint.clone(),
      green: glow(palette.cicd, 3.2),
      red: glow(palette.red, 3.4),
      waiting: glow(palette.linux, 2.8),
      packet: glow(palette.star, 3),
    }),
    [palette],
  );
  const specs = useMemo(
    () =>
      names.map((name) => ({
        text: name.toUpperCase(),
        color: css(palette.ink),
        family: fonts.mono,
        width: 512,
        height: 128,
      })),
    [names, palette, fonts.mono],
  );

  useLayoutEffect(() => {
    const mesh = packets.current;
    if (mesh === null) return;
    for (let i = 0; i < PACKETS; i += 1) mesh.setColorAt(i, tones.packet);
  }, [tones]);

  useFrame(({ clock }) => {
    const event = stationEventAt(landingStore.journey, index);
    const time = clock.elapsedTime;
    let open = -1;
    GATE_X.forEach((_, gate) => {
      const light = lights.current[gate];
      const green = event >= (GREEN_AT[gate] ?? 1);
      const red = gate === 1 && !green && event >= RED_FROM;
      if (green && open === gate - 1) open = gate;
      if (light === null || light === undefined) return;
      const material = light.material;
      if (Array.isArray(material) || !('color' in material)) return;
      (material.color as Color).copy(green ? tones.green : red ? tones.red : tones.idle);
    });
    /* Gói chạy tới cổng xanh xa nhất; cổng sau đó còn đỏ hoặc tắt thì gói xếp hàng trước nó. */
    const limit = open >= GATE_X.length - 1 ? RAIL_HALF : (GATE_X[open + 1] ?? RAIL_HALF) - 0.55;
    const mesh = packets.current;
    if (mesh === null) return;
    /* Gói kẹt trước cổng test đang đỏ thì đỏ theo; kẹt trước cổng chưa chạy thì vàng chờ. */
    const failing = open === 0 && event >= RED_FROM && event < (GREEN_AT[1] ?? 1);
    const blocked = failing ? tones.red : tones.waiting;
    for (let i = 0; i < PACKETS; i += 1) {
      const loop = (time * 0.22 + i / PACKETS) % 1;
      const free = -RAIL_HALF + loop * RAIL_HALF * 2;
      const x = Math.min(free, limit - i * 0.62);
      work.dummy.position.set(x, 0.86, 0);
      work.dummy.rotation.set(0, time * 2 + i, 0);
      work.dummy.updateMatrix();
      mesh.setMatrixAt(i, work.dummy.matrix);
      const queued = open < GATE_X.length - 1 && x >= limit - i * 0.62 - 0.01;
      mesh.setColorAt(i, queued ? blocked : tones.packet);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group position={[0, 0, 0.4]}>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[RAIL_HALF * 2 + 0.4, 0.14, 0.7]} />
        <DarkMaterial palette={palette} shade="bg-3" />
        <GlowEdges color={palette.cicd} strength={1.4} />
      </mesh>
      {GATE_X.map((x, gate) => {
        const spec = specs[gate];
        return (
          <group key={x} position={[x, 0, 0]}>
            {[-0.95, 0.95].map((side) => (
              <mesh key={side} position={[side, 1.4, 0]}>
                <boxGeometry args={[0.18, 2.8, 0.18]} />
                <DarkMaterial palette={palette} />
                <GlowEdges color={palette.cicd} strength={1.6} />
              </mesh>
            ))}
            <mesh position={[0, 2.86, 0]}>
              <boxGeometry args={[2.1, 0.18, 0.18]} />
              <DarkMaterial palette={palette} />
              <GlowEdges color={palette.cicd} strength={1.6} />
            </mesh>
            <mesh
              ref={(node) => {
                lights.current[gate] = node;
              }}
              position={[0, 3.18, 0]}
            >
              <boxGeometry args={[0.7, 0.3, 0.3]} />
              <meshBasicMaterial color={tones.idle} toneMapped={false} />
            </mesh>
            {spec === undefined ? null : <Label spec={spec} width={1.5} position={[0, 3.72, 0]} />}
          </group>
        );
      })}
      <instancedMesh ref={packets} args={[undefined, undefined, PACKETS]} frustumCulled={false}>
        <boxGeometry args={[0.42, 0.42, 0.42]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
