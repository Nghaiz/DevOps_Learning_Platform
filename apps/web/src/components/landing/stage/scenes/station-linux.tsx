'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type InstancedMesh, type Mesh, Object3D } from 'three';
import { t } from '@devops-platform/copy';
import { clamp01, stationEventAt } from '../../journey-timeline';
import { landingStore } from '../../motion/store';
import { glow } from '../palette';
import { css, DarkMaterial, GlowEdges, hash, Label } from './kit';
import type { StationProps } from './stations';

const LED_COLUMNS = 6;
const LED_ROWS = 11;
const BARS = 9;
/** Cột htop "ăn RAM" trong sự kiện: vọt lên đỏ rồi bị kill. */
const HOG = 6;

/**
 * Ga Linux: tủ máy chủ với lưới đèn LED nhấp nháy, cạnh nó là cột htop nhảy theo tải. Sự kiện:
 * một tiến trình vọt lên đỏ chiếm RAM (giữa đoạn), rồi bị kill và tụt về không, các cột khác dịu lại.
 */
export function LinuxStation({ index, palette, fonts }: StationProps) {
  const leds = useRef<InstancedMesh>(null);
  const bars = useRef<InstancedMesh>(null);
  const cursor = useRef<Mesh>(null);
  const work = useMemo(() => ({ dummy: new Object3D(), color: new Color() }), []);
  const tones = useMemo(
    () => ({
      on: glow(palette.linux, 2.1),
      ok: glow(palette.cicd, 2.4),
      off: palette['bg-3'].clone(),
      bar: glow(palette.linux, 1.25),
      hot: glow(palette.red, 3.4),
    }),
    [palette],
  );
  const prompt = useMemo(
    () => ({
      text: `$ ${t('home.station.linux.cmd')}`,
      color: css(palette.ink),
      background: css(palette.bg, 0.9),
      accent: css(palette.linux),
      family: fonts.mono,
      width: 1400,
      height: 200,
    }),
    [palette, fonts.mono],
  );

  useLayoutEffect(() => {
    const grid = leds.current;
    const columns = bars.current;
    if (grid === null || columns === null) return;
    const { dummy } = work;
    for (let row = 0; row < LED_ROWS; row += 1) {
      for (let col = 0; col < LED_COLUMNS; col += 1) {
        const i = row * LED_COLUMNS + col;
        dummy.position.set((col - (LED_COLUMNS - 1) / 2) * 0.34, (row - (LED_ROWS - 1) / 2) * 0.38, 0);
        dummy.updateMatrix();
        grid.setMatrixAt(i, dummy.matrix);
        grid.setColorAt(i, tones.off);
      }
    }
    for (let i = 0; i < BARS; i += 1) columns.setColorAt(i, tones.bar);
    grid.instanceMatrix.needsUpdate = true;
  }, [work, tones]);

  useFrame(({ clock }) => {
    const grid = leds.current;
    const columns = bars.current;
    if (grid === null || columns === null) return;
    const event = stationEventAt(landingStore.journey, index);
    const time = clock.elapsedTime;
    const step = Math.floor(time * 9);
    for (let i = 0; i < LED_COLUMNS * LED_ROWS; i += 1) {
      const lit = hash(i * 31 + step * 7) > 0.42;
      grid.setColorAt(i, lit ? (i % 9 === 0 ? tones.ok : tones.on) : tones.off);
    }
    if (grid.instanceColor !== null) grid.instanceColor.needsUpdate = true;

    const spike = clamp01((event - 0.25) / 0.2) * (1 - clamp01((event - 0.7) / 0.08));
    const calm = clamp01((event - 0.72) / 0.2);
    const { dummy } = work;
    for (let i = 0; i < BARS; i += 1) {
      const wave = 0.5 + 0.5 * Math.sin(time * (1.6 + hash(i) * 2.4) + i * 1.7);
      let height = 0.35 + wave * (1.6 - calm * 0.9);
      if (i === HOG) height = event > 0.78 ? 0.06 : height + spike * 3.4;
      dummy.position.set((i - (BARS - 1) / 2) * 0.46, height / 2, 0);
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      columns.setMatrixAt(i, dummy.matrix);
      if (i === HOG) columns.setColorAt(i, work.color.copy(tones.bar).lerp(tones.hot, spike));
    }
    columns.instanceMatrix.needsUpdate = true;
    if (columns.instanceColor !== null) columns.instanceColor.needsUpdate = true;
    if (cursor.current !== null) cursor.current.visible = Math.floor(time * 2.2) % 2 === 0;
  });

  return (
    <group>
      <mesh position={[1.9, 2.6, -0.8]}>
        <boxGeometry args={[2.8, 5.2, 2.6]} />
        <DarkMaterial palette={palette} />
        <GlowEdges color={palette.linux} strength={2.4} />
      </mesh>
      <instancedMesh ref={leds} args={[undefined, undefined, LED_COLUMNS * LED_ROWS]} position={[1.9, 2.6, 0.52]}>
        <planeGeometry args={[0.24, 0.14]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={bars} args={[undefined, undefined, BARS]} position={[-2.4, 0, 0.6]}>
        <boxGeometry args={[0.32, 1, 0.32]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <group position={[-2.6, 4.4, 0.8]}>
        <Label spec={prompt} width={4.6} />
        <mesh ref={cursor} position={[2.42, 0, 0.01]}>
          <planeGeometry args={[0.2, 0.42]} />
          <meshBasicMaterial color={glow(palette.star, 3)} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
