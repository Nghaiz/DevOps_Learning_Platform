'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type Group, type InstancedMesh, MathUtils, Object3D, Vector3 } from 'three';
import { STATION_IDS } from '../../content';
import { STATION_COUNT, trackAt } from '../../journey-timeline';
import { landingStore } from '../../motion/store';
import { glow, type StagePalette } from '../palette';
import { TRUNK, trackU } from '../world';
import { DarkMaterial, GlowEdges } from './kit';

const TRAIL = 7;
const UP = new Vector3(0, 1, 0);

/**
 * "Commit" đang được đẩy qua sáu ga: một khối dẹt chạy ngay trước camera trên tuyến đỏ, đổi màu
 * viền theo ga đang tới, kéo theo một vệt khối mờ dần. Ở hero nó đứng chờ ở đầu tuyến.
 */
export function Train({ palette }: { readonly palette: StagePalette }) {
  const group = useRef<Group>(null);
  const trail = useRef<InstancedMesh>(null);
  const work = useMemo(
    () => ({ point: new Vector3(), ahead: new Vector3(), color: new Color(), dummy: new Object3D(), history: [] as Vector3[] }),
    [],
  );
  const head = useRef<Color>(palette.red.clone());

  useLayoutEffect(() => {
    const mesh = trail.current;
    if (mesh === null) return;
    for (let i = 0; i < TRAIL; i += 1) mesh.setColorAt(i, glow(palette.red, 2 - i * 0.25));
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  }, [palette]);

  useFrame(({ clock }) => {
    const node = group.current;
    const mesh = trail.current;
    if (node === null || mesh === null) return;
    const store = landingStore;
    const onTrack = !store.visible.closing && !(store.terminalIn > 0.6 && !store.visible.journey);
    node.visible = onTrack;
    mesh.visible = onTrack;
    if (!onTrack) return;

    const track = store.journey > 0 ? trackAt(store.journey) : -1;
    const idle = store.journey > 0 ? 0 : Math.sin(clock.elapsedTime * 1.4) * 0.002;
    const u = MathUtils.clamp(trackU(track) + 0.046 + idle, 0, 0.99);
    TRUNK.getPointAt(u, work.point).addScaledVector(UP, 0.42);
    TRUNK.getPointAt(Math.min(1, u + 0.004), work.ahead).addScaledVector(UP, 0.42);
    node.position.copy(work.point);
    node.lookAt(work.ahead);

    const index = MathUtils.clamp(Math.round(track), 0, STATION_COUNT - 1);
    const target = store.journey > 0 ? palette[STATION_IDS[index] ?? 'linux'] : palette.red;
    head.current.lerp(target, 0.08);

    work.history.unshift(work.point.clone());
    if (work.history.length > TRAIL * 2) work.history.pop();
    for (let i = 0; i < TRAIL; i += 1) {
      const past = work.history[Math.min(work.history.length - 1, i * 2 + 1)] ?? work.point;
      work.dummy.position.copy(past);
      work.dummy.lookAt(work.ahead);
      const shrink = 1 - i / TRAIL;
      work.dummy.scale.set(shrink, shrink, shrink);
      work.dummy.updateMatrix();
      mesh.setMatrixAt(i, work.dummy.matrix);
      mesh.setColorAt(i, work.color.copy(head.current).multiplyScalar(2.4 * shrink));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <group ref={group}>
        <mesh>
          <boxGeometry args={[0.62, 0.42, 1.7]} />
          <DarkMaterial palette={palette} shade="bg-3" />
          <GlowEdges color={palette.star} strength={2.6} width={1.6} />
        </mesh>
        <mesh position={[0, 0, 0.86]}>
          <planeGeometry args={[0.46, 0.16]} />
          <meshBasicMaterial color={glow(palette.star, 4)} toneMapped={false} />
        </mesh>
      </group>
      <instancedMesh ref={trail} args={[undefined, undefined, TRAIL]} frustumCulled={false}>
        <boxGeometry args={[0.32, 0.18, 0.5]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.7} />
      </instancedMesh>
    </>
  );
}
