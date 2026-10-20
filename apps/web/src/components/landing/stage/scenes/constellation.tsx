'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Color, InstancedMesh} from 'three';
import { CatmullRomCurve3, Object3D, TubeGeometry, Vector3 } from 'three';
import { STATION_IDS } from '../../content';
import { landingStore } from '../../motion/store';
import { glow, type StagePalette } from '../palette';
import { frameAt, STATION_U, stationLine, TRUNK } from '../world';

const SAMPLES = 720;

interface Track {
  readonly curve: CatmullRomCurve3;
  readonly color: Color;
  readonly radius: number;
  readonly pulses: number;
  readonly speed: number;
  readonly length: number;
  readonly points: readonly Vector3[];
  readonly tangents: readonly Vector3[];
}

function buildTrack(curve: CatmullRomCurve3, color: Color, radius: number, pulses: number, speed: number): Track {
  const points = curve.getSpacedPoints(SAMPLES);
  const tangents = points.map((_, i) => curve.getTangentAt(i / SAMPLES));
  return { curve, color, radius, pulses, speed, length: curve.getLength(), points, tangents };
}

/** Hai tuyến trên cao chỉ để tạo chiều sâu: một vòng hồng (giám sát), một vòng vàng (sao PTIT). */
function skyLine(height: number, phase: number): CatmullRomCurve3 {
  const points: Vector3[] = [];
  for (let u = 0; u <= 1.0001; u += 0.05) {
    const frame = frameAt(u);
    points.push(
      frame.point
        .clone()
        .addScaledVector(frame.right, Math.sin(u * 9 + phase) * 16)
        .add(new Vector3(0, height + Math.cos(u * 7 + phase) * 2, 0)),
    );
  }
  return new CatmullRomCurve3(points, false, 'centripetal');
}

export function Constellation({ palette }: { readonly palette: StagePalette }) {
  const tracks = useMemo(
    () => [
      buildTrack(TRUNK, palette.red, 0.17, 14, 7),
      ...STATION_IDS.map((id, i) => buildTrack(stationLine(i), palette[id], 0.085, 6, 5 + i * 0.6)),
      buildTrack(skyLine(13, 0), palette.observe, 0.05, 5, 9),
      buildTrack(skyLine(20, 2.1), palette.star, 0.04, 4, 11),
    ],
    [palette],
  );
  const geometries = useMemo(
    () =>
      tracks.map(
        (track) => new TubeGeometry(track.curve, Math.round(track.length * 2.2), track.radius, 6, false),
      ),
    [tracks],
  );
  const pulseCount = tracks.reduce((sum, track) => sum + track.pulses, 0);
  const pulses = useRef<InstancedMesh>(null);
  const markers = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const ahead = useMemo(() => new Vector3(), []);

  useLayoutEffect(() => {
    const mesh = pulses.current;
    if (mesh === null) return;
    let index = 0;
    for (const track of tracks) {
      const color = glow(track.color, 4.2);
      for (let p = 0; p < track.pulses; p += 1) {
        mesh.setColorAt(index, color);
        index += 1;
      }
    }
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    const marks = markers.current;
    if (marks === null) return;
    STATION_U.forEach((u, i) => {
      const frame = frameAt(u);
      dummy.position.copy(frame.point).add(new Vector3(0, 0.05, 0));
      dummy.lookAt(ahead.copy(frame.point).add(frame.tangent));
      dummy.updateMatrix();
      marks.setMatrixAt(i, dummy.matrix);
      marks.setColorAt(i, glow(palette.ink, 2.4));
    });
    marks.instanceMatrix.needsUpdate = true;
  }, [tracks, dummy, ahead, palette]);

  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);

  useFrame(({ clock }) => {
    const mesh = pulses.current;
    if (mesh === null) return;
    const time = clock.elapsedTime;
    /* Cuộn nhanh thì xung chạy nhanh theo: tuyến "nóng lên" dưới tay người cuộn. */
    const boost = 1 + Math.min(Math.abs(landingStore.velocity) * 0.05, 3);
    let index = 0;
    for (const track of tracks) {
      const last = track.points.length - 1;
      for (let p = 0; p < track.pulses; p += 1) {
        const phase = (p / track.pulses + (time * track.speed * boost) / track.length) % 1;
        const sample = Math.floor(phase * last);
        const point = track.points[sample];
        const tangent = track.tangents[sample];
        if (point !== undefined && tangent !== undefined) {
          dummy.position.copy(point);
          dummy.lookAt(ahead.copy(point).add(tangent));
          dummy.scale.set(1, 1, 1 + boost * 0.6);
          dummy.updateMatrix();
          mesh.setMatrixAt(index, dummy.matrix);
        }
        index += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {geometries.map((geometry, i) => {
        const track = tracks[i];
        if (track === undefined) return null;
        return (
          <mesh key={i} geometry={geometry}>
            <meshBasicMaterial color={glow(track.color, i === 0 ? 1.9 : 1.45)} toneMapped={false} />
          </mesh>
        );
      })}
      <instancedMesh ref={pulses} args={[undefined, undefined, pulseCount]} frustumCulled={false}>
        <boxGeometry args={[0.16, 0.16, 0.9]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={markers} args={[undefined, undefined, STATION_U.length]}>
        <boxGeometry args={[1.1, 0.1, 1.1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
