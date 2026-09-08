'use client';

import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
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
}: RelationEdgesProps): ReactElement {
  const builtRef = useRef(-1);

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

  useFrame(() => {
    solid.visible = visible;
    dashed.visible = visible;
    if (builtRef.current === runtime.structureVersion) {
      return;
    }
    builtRef.current = runtime.structureVersion;
    solidGeometry.setAttribute('position', new THREE.Float32BufferAttribute(runtime.edges.solid, 3));
    dashedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(runtime.edges.dashed, 3));
    solidGeometry.computeBoundingSphere();
    dashedGeometry.computeBoundingSphere();
    // `LineDashedMaterial` đọc thuộc tính `lineDistance`; thiếu nó thì nét đứt
    // ra nét liền — và lúc đó một quan hệ ĐANG ĐỨT trông y hệt một quan hệ khoẻ.
    dashed.computeLineDistances();
  });

  return (
    <>
      <primitive object={solid} />
      <primitive object={dashed} />
    </>
  );
}
