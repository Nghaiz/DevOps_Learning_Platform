'use client';

import { Environment, Lightformer } from '@react-three/drei';
import { DUST_COUNT, LOOP_COUNT, type QualityTier } from './quality';
import type { StagePalette } from './palette';
import { CameraRig } from './camera-rig';
import { Constellation } from './scenes/constellation';
import { Dust } from './scenes/dust';
import { GridFloor } from './scenes/grid-floor';
import { InfinityLoop } from './scenes/infinity-loop';
import { SandboxRack } from './scenes/sandbox-rack';
import { Stations } from './scenes/stations';
import { Train } from './scenes/train';

export interface SceneFonts {
  readonly mono: string;
  readonly display: string;
}

/**
 * Toàn bộ thế giới: một tuyến metro dài chạy qua sáu ga, giá máy sandbox ở cuối, vòng lặp ∞ ở
 * xa. Ánh sáng môi trường dựng tại chỗ bằng Lightformer (không tải HDR từ CDN: CSP chặn).
 */
export function Scene({
  palette,
  fonts,
  tier,
}: {
  readonly palette: StagePalette;
  readonly fonts: SceneFonts;
  readonly tier: QualityTier;
}) {
  return (
    <>
      <color attach="background" args={[palette.bg]} />
      <fog attach="fog" args={[palette.bg, 26, 132]} />
      <ambientLight intensity={0.55} color={palette.ink} />
      <directionalLight position={[12, 20, 10]} intensity={2.1} color={palette.ink} />
      <directionalLight position={[-14, 6, -12]} intensity={0.9} color={palette.docker} />
      <Environment frames={1} resolution={128} environmentIntensity={0.75}>
        <Lightformer form="rect" intensity={3} color={palette.ink} scale={[14, 4, 1]} position={[0, 9, 4]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={4} color={palette.red} scale={[6, 10, 1]} position={[-10, 2, 0]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={3} color={palette.docker} scale={[6, 10, 1]} position={[10, 2, 0]} rotation-y={-Math.PI / 2} />
        <Lightformer form="ring" intensity={2} color={palette.star} scale={3} position={[0, 4, -10]} />
      </Environment>
      <CameraRig palette={palette} />
      <GridFloor palette={palette} />
      <Constellation palette={palette} />
      <Train palette={palette} />
      <Stations palette={palette} fonts={fonts} />
      <SandboxRack palette={palette} />
      <InfinityLoop palette={palette} fonts={fonts} count={LOOP_COUNT[tier]} />
      <Dust palette={palette} count={DUST_COUNT[tier]} />
    </>
  );
}
