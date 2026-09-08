'use client';

import { useEffect, useMemo, useRef, type ReactElement, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { ArenaSceneProps } from '../arena-contract';
import type { SceneRuntime } from './scene-entry';
import type { ArenaColors } from './use-arena-colors';

/**
 * Quan hệ giữa các tài nguyên: nét liền cho quan hệ đang khoẻ, nét đứt cho quan
 * hệ ĐÁNG LẼ có mà đang đứt (selector lệch label).
 *
 * Hai `LineSegments` chứ không phải một đường cho mỗi cạnh: gộp mọi cạnh cùng
 * kiểu vào một buffer giữ số lệnh vẽ ở đúng hai, bất kể cụm có bao nhiêu quan hệ.
 *
 * Buffer chỉ được dựng lại khi CẤU TRÚC đổi. Trong vòng lặp vẽ, thành phần này
 * không làm gì cả — và đó là điều đúng: một cạnh không tự chuyển động.
 */
export interface RelationEdgesProps {
  readonly propsRef: RefObject<ArenaSceneProps>;
  readonly reducedMotion: boolean;
  readonly runtime: SceneRuntime;
  readonly colors: ArenaColors;
  readonly colorsVersion: number;
  /** Người chơi tắt dây quan hệ trong bảng cài đặt khi cụm đông và cảnh rối. */
  readonly visible: boolean;
}

export function RelationEdges({
  runtime,
  colors,
  colorsVersion,
  visible,
  propsRef,
  reducedMotion,
}: RelationEdgesProps): ReactElement {
  const builtRef = useRef(-1);
  const invalidate = useThree(s => s.invalidate);
  const phase = useRef(0);
  const markerGeometry = useMemo(() => new THREE.SphereGeometry(0.045, 8, 6), []);
  const markerMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#9de7ff', toneMapped: false }), []);
  const markers = useMemo(() => { const mesh = new THREE.InstancedMesh(markerGeometry, markerMaterial, 256); mesh.frustumCulled = false; mesh.count = 0; return mesh; }, [markerGeometry, markerMaterial]);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  useEffect(() => () => { markers.dispose(); }, [markers]);
  useEffect(() => () => markerGeometry.dispose(), [markerGeometry]);
  useEffect(() => () => markerMaterial.dispose(), [markerMaterial]);

  const solidGeometry = useMemo(() => new THREE.BufferGeometry(), []);
  const dashedGeometry = useMemo(() => new THREE.BufferGeometry(), []);

  const solidMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5, toneMapped: false }),
    [],
  );
  const dashedMaterial = useMemo(
    () =>
      new THREE.LineDashedMaterial({
        dashSize: 0.24,
        gapSize: 0.18,
        transparent: true,
        opacity: 0.95,
        toneMapped: false,
      }),
    [],
  );

  const solid = useMemo(() => {
    const lines = new THREE.LineSegments(solidGeometry, solidMaterial);
    lines.frustumCulled = false;
    return lines;
  }, [solidGeometry, solidMaterial]);

  const dashed = useMemo(() => {
    const lines = new THREE.LineSegments(dashedGeometry, dashedMaterial);
    lines.frustumCulled = false;
    return lines;
  }, [dashedGeometry, dashedMaterial]);

  useEffect(() => () => solidGeometry.dispose(), [solidGeometry]);
  useEffect(() => () => dashedGeometry.dispose(), [dashedGeometry]);
  useEffect(() => () => solidMaterial.dispose(), [solidMaterial]);
  useEffect(() => () => dashedMaterial.dispose(), [dashedMaterial]);

  useEffect(() => {
    solidMaterial.color.copy(colors.edge);
    dashedMaterial.color.copy(colors.edgeBroken);
  }, [solidMaterial, dashedMaterial, colors, colorsVersion]);

  useFrame((_state, dt) => {
    const speed = propsRef.current.simulationSpeed ?? 1;
    markers.visible = visible && !reducedMotion;
    markers.count = Math.min(256, runtime.edges.solid.length / 144);
    if (visible && !reducedMotion && speed > 0 && document.visibilityState === 'visible') {
      phase.current += Math.min(dt, 0.1) * speed * 0.32;
      const points = runtime.edges.solid;
      markers.count = Math.min(256, points.length / (24 * 6));
      for (let i = 0; i < markers.count; i++) {
        const t = ((phase.current + i * 0.37) % 1) * 24;
        const offset = i * 144 + Math.floor(t) * 6;
        const mix = t % 1;
        const x = points[offset] ?? 0, y = points[offset+1] ?? 0, z = points[offset+2] ?? 0;
        matrix.makeTranslation(x + ((points[offset+3] ?? x)-x)*mix, y + ((points[offset+4] ?? y)-y)*mix, z + ((points[offset+5] ?? z)-z)*mix);
        markers.setMatrixAt(i, matrix);
      }
      markers.instanceMatrix.needsUpdate = true;
      if (markers.count > 0) invalidate();
    }
    solid.visible = visible;
    dashed.visible = visible;
    if (builtRef.current === runtime.structureVersion) {
      return;
    }
    builtRef.current = runtime.structureVersion;
    writePositions(solidGeometry, runtime.edges.solid);
    writePositions(dashedGeometry, runtime.edges.dashed);
    solidGeometry.computeBoundingSphere();
    dashedGeometry.computeBoundingSphere();
    // `LineDashedMaterial` đọc thuộc tính `lineDistance`; thiếu nó thì nét đứt
    // ra nét liền — và lúc đó một quan hệ ĐANG ĐỨT trông y hệt một quan hệ khoẻ.
    dashed.computeLineDistances();
  });

  return (
    <>
      <primitive object={markers} />
      <primitive object={solid} />
      <primitive object={dashed} />
    </>
  );
}

/** Reuse GPU buffers while dragging; release the old allocation when edge count changes. */
function writePositions(geometry: THREE.BufferGeometry, points: number[]): void {
  const attribute = geometry.getAttribute('position');
  if (attribute instanceof THREE.BufferAttribute && attribute.array.length === points.length) {
    attribute.array.set(points);
    attribute.needsUpdate = true;
  } else {
    geometry.dispose();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  }
}
