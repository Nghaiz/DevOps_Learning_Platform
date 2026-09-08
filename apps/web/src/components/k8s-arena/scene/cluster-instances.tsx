'use client';

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ResourceKind } from '@devops-platform/games';
import { TIER_FEATURES } from '../shared/scene-quality';
import { RESOURCE_COLOR } from '../shared/resource-identity';
import type { QualityTier } from '../arena-contract';
import { INITIAL_CAPACITY } from './scene-constants';
import type { SceneRuntime } from './scene-entry';
import type { ArenaColors } from './use-arena-colors';
import { createResourceGeometry } from './resource-geometry';

const MATRIX = new THREE.Matrix4();
const POSITION = new THREE.Vector3();
const SCALE = new THREE.Vector3();
const COLOR = new THREE.Color();
const ROTATION = new THREE.Quaternion();
const KINDS = Object.keys(RESOURCE_COLOR) as ResourceKind[];

/**
 * Một lô instance của MỘT loại tài nguyên.
 *
 * `uids` ánh xạ chỉ số instance cục bộ về uid. Nó KHÔNG còn phục vụ việc bắn tia
 * — vùng bấm đã chuyển sang `hit-proxy.tsx` vì mô hình chi tiết ở đây rỗng ruột
 * và cho ra một vùng bấm thủng lỗ chỗ — nhưng vẫn cần cho chính vòng ghi bên
 * dưới, và nó là thứ duy nhất nói instance thứ `i` của lô này là vật nào.
 */
interface ResourceBatch {
  readonly kind: ResourceKind;
  readonly color: THREE.Color;
  readonly mesh: THREE.InstancedMesh;
  readonly uids: string[];
}

export interface ClusterInstancesProps {
  readonly runtime: SceneRuntime;
  readonly colors: ArenaColors;
  readonly tier: QualityTier;
}

function instance(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  capacity: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.setColorAt(0, COLOR.setRGB(1, 1, 1));
  mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

/** One body draw per populated kind plus one status-ring draw for the whole cluster. */
export function ClusterInstances({ runtime, colors, tier }: ClusterInstancesProps): ReactElement {
  const features = TIER_FEATURES[tier];
  const [capacity, setCapacity] = useState(INITIAL_CAPACITY);
  const geometries = useMemo(
    () => KINDS.map((kind) => createResourceGeometry(kind, features.roundedSegments)),
    [features.roundedSegments],
  );
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.34,
        metalness: 0.28,
        envMapIntensity: 0.75,
      }),
    [],
  );
  const batches = useMemo<readonly ResourceBatch[]>(
    () =>
      KINDS.map((kind, index) => ({
        kind,
        color: new THREE.Color(RESOURCE_COLOR[kind]),
        uids: [] as string[],
        mesh: instance(geometries[index]!, material, capacity),
      })),
    [geometries, material, capacity],
  );
  const byKind = useMemo(() => new Map(batches.map((batch) => [batch.kind, batch])), [batches]);
  const ringGeometry = useMemo(
    () => new THREE.TorusGeometry(0.57, 0.022, 6, 40).rotateX(Math.PI / 2),
    [],
  );
  const ringMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  const rings = useMemo(
    () => instance(ringGeometry, ringMaterial, capacity),
    [ringGeometry, ringMaterial, capacity],
  );

  useEffect(() => () => batches.forEach(({ mesh }) => mesh.dispose()), [batches]);
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => rings.dispose(), [rings]);
  useEffect(() => () => ringGeometry.dispose(), [ringGeometry]);
  useEffect(() => () => ringMaterial.dispose(), [ringMaterial]);

  useFrame(() => {
    if (runtime.visible.length > capacity) {
      setCapacity(2 ** Math.ceil(Math.log2(runtime.visible.length)));
    }
    for (const batch of batches) {
      batch.mesh.count = 0;
      batch.uids.length = 0;
    }
    let ringCount = 0;
    for (const entry of runtime.visible) {
      const batch = byKind.get(entry.kind);
      if (batch === undefined || batch.mesh.count >= capacity) continue;
      const index = batch.mesh.count++;
      batch.uids[index] = entry.uid;
      POSITION.set(entry.x, entry.drawY, entry.z);
      SCALE.setScalar(entry.drawScale);
      MATRIX.compose(POSITION, ROTATION, SCALE);
      batch.mesh.setMatrixAt(index, MATRIX);
      COLOR.copy(batch.color);
      if (entry.failing) COLOR.lerp(colors.glow[entry.token], 0.6);
      if (entry.terminating) COLOR.lerp(colors.platform, 0.6);
      batch.mesh.setColorAt(index, COLOR);
      if (ringCount < capacity) {
        POSITION.y -= entry.drawScale * 0.46;
        MATRIX.compose(POSITION, ROTATION, SCALE);
        rings.setMatrixAt(ringCount, MATRIX);
        COLOR.copy(colors.glow[entry.token]).multiplyScalar(0.65 + entry.drawGlow * 0.35);
        rings.setColorAt(ringCount++, COLOR);
      }
    }
    for (const { mesh } of batches) {
      mesh.castShadow = features.shadows;
      mesh.receiveShadow = features.shadows;
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
      /*
       * KHÔNG xoá `boundingSphere` ở đây nữa. Nó từng cần vì tia dò bắn thẳng
       * vào các lô này; giờ tia bắn vào `hit-proxy.tsx`, và `frustumCulled` đã
       * `false` nên hình cầu bao không được dùng vào việc gì khác. Xoá nó mỗi
       * khung hình là bắt three tính lại bao ngoài của 26 lưới cho không.
       */
    }
    rings.count = ringCount;
    rings.instanceMatrix.needsUpdate = true;
    if (rings.instanceColor !== null) rings.instanceColor.needsUpdate = true;
  });

  return (
    <>
      {batches.map(({ kind, mesh }) => (
        <primitive key={kind} object={mesh} />
      ))}
      <primitive object={rings} />
    </>
  );
}
