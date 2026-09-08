'use client';

import { useEffect, useMemo, type ReactElement, type RefObject } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useFrame } from '@react-three/fiber';
import type { ArenaSceneProps } from '../arena-contract';
import { HOVER_SHELL_SCALE, LAYER_GLOW, SELECT_SHELL_SCALE } from './scene-constants';
import type { SceneRuntime } from './scene-entry';
import type { ArenaColors } from './use-arena-colors';

/**
 * Viền sáng quanh vật đang chọn, viền mờ hơn quanh vật đang rê.
 *
 * ## Vì sao KHÔNG dùng hiệu ứng `Outline` của hậu kỳ
 *
 * `Outline` nhận một danh sách `Object3D` để tô viền. Pod của ta KHÔNG phải
 * `Object3D` riêng — chúng là instance bên trong một `InstancedMesh`, và cả
 * cụm chỉ là MỘT object với hiệu ứng đó. Chọn một pod sẽ tô viền cả 200 pod.
 *
 * Nên viền ở đây là hình học: một lớp vỏ hơi lớn hơn, vật liệu cộng dồn, không
 * ghi chiều sâu. Hai lệnh vẽ cố định, luôn đúng vật, và nó cũng chính là thứ
 * nuôi hiệu ứng phát sáng ở tầng hậu kỳ.
 */
export interface SelectionHaloProps {
  readonly runtime: SceneRuntime;
  readonly propsRef: RefObject<ArenaSceneProps>;
  readonly colors: ArenaColors;
  readonly colorsVersion: number;
}

function createShell(
  geometry: THREE.BufferGeometry,
  opacity: number,
): { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial } {
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // Chỉ tô mặt SAU: mặt trước bị chính vật che, nên phần còn nhìn thấy đúng
    // là một quầng ôm lấy đường bao — một viền, không phải một khối phủ lên vật.
    side: THREE.BackSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.layers.set(LAYER_GLOW);
  return { mesh, material };
}

export function SelectionHalo({
  runtime,
  propsRef,
  colors,
  colorsVersion,
}: SelectionHaloProps): ReactElement {
  const geometry = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 3, 0.16), []);
  const selected = useMemo(() => createShell(geometry, 0.85), [geometry]);
  const hovered = useMemo(() => createShell(geometry, 0.4), [geometry]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => selected.material.dispose(), [selected]);
  useEffect(() => () => hovered.material.dispose(), [hovered]);

  useEffect(() => {
    selected.material.color.copy(colors.select);
    hovered.material.color.copy(colors.hover);
  }, [selected, hovered, colors, colorsVersion]);

  useFrame(() => {
    const current = propsRef.current;
    place(selected.mesh, current.selectedUid, SELECT_SHELL_SCALE);
    // Không vẽ hai lớp chồng nhau khi con trỏ đang nằm trên đúng vật đang chọn:
    // cộng dồn hai lần làm viền cháy trắng và mất luôn màu trạng thái.
    const hoverUid = current.hoveredUid === current.selectedUid ? null : current.hoveredUid;
    place(hovered.mesh, hoverUid, HOVER_SHELL_SCALE);
  });

  function place(mesh: THREE.Mesh, uid: string | null, scale: number): void {
    const entry = uid === null ? undefined : runtime.entries.get(uid);
    if (entry === undefined || entry.drawScale <= 0.001) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.position.set(entry.x, entry.drawY, entry.z);
    mesh.scale.setScalar(entry.drawScale * scale);
  }

  return (
    <>
      <primitive object={selected.mesh} />
      <primitive object={hovered.mesh} />
    </>
  );
}
