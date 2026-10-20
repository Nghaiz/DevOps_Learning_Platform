'use client';

import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { STATION_IDS, type StationId } from '../../content';
import { landingStore } from '../../motion/store';
import type { StagePalette } from '../palette';
import type { SceneFonts } from '../scene';
import { stationCenter, stationYaw } from '../world';
import { CicdStation } from './station-cicd';
import { DockerStation } from './station-docker';
import { GitStation } from './station-git';
import { K8sStation } from './station-k8s';
import { LinuxStation } from './station-linux';
import { ProdStation } from './station-prod';
import { Platform } from './kit';

/** Ga xa hơn ngần này đơn vị thì không vẽ: sương mù đã nuốt nó, vẽ chỉ tốn draw call. */
const DRAW_DISTANCE = 96;

export interface StationProps {
  readonly index: number;
  readonly palette: StagePalette;
  readonly fonts: SceneFonts;
}

const MODELS: Readonly<Record<StationId, (props: StationProps) => ReactNode>> = {
  linux: LinuxStation,
  git: GitStation,
  docker: DockerStation,
  k8s: K8sStation,
  cicd: CicdStation,
  prod: ProdStation,
};

export function Stations({ palette, fonts }: { readonly palette: StagePalette; readonly fonts: SceneFonts }) {
  return (
    <>
      {STATION_IDS.map((id, index) => (
        <StationSlot key={id} id={id} index={index} palette={palette} fonts={fonts} />
      ))}
    </>
  );
}

function StationSlot({ id, index, palette, fonts }: StationProps & { readonly id: StationId }) {
  const group = useRef<Group>(null);
  const center = useMemo(() => stationCenter(index), [index]);
  const yaw = useMemo(() => stationYaw(index), [index]);
  const Model = MODELS[id];

  useFrame(({ camera }) => {
    const node = group.current;
    if (node === null) return;
    node.visible = !landingStore.visible.closing && camera.position.distanceTo(center) < DRAW_DISTANCE;
  });

  return (
    <group ref={group} position={center} rotation-y={yaw}>
      <Platform palette={palette} color={palette[id]} />
      <Model index={index} palette={palette} fonts={fonts} />
    </group>
  );
}
