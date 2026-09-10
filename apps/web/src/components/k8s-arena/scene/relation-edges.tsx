'use client';

import { useEffect, useMemo, useRef, type ReactElement, type RefObject } from 'react';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { useFrame, useThree } from '@react-three/fiber';
import type { ResourceKind } from '@devops-platform/games';
import type { ArenaSceneProps, QualityTier } from '../arena-contract';
import { EDGE_SEGMENTS } from '../shared/edge-routing';
import { RESOURCE_HSL, RESOURCE_KINDS } from '../shared/resource-identity';
import type { SceneRuntime } from './scene-entry';
import { createEdgeMarkerMaterial } from './edge-marker-material';
import type { ArenaColors } from './use-arena-colors';

/** Batched, screen-space relationship strokes with moving flow markers. */
export interface RelationEdgesProps {
  readonly propsRef: RefObject<ArenaSceneProps>;
  readonly reducedMotion: boolean;
  readonly runtime: SceneRuntime;
  readonly colors: ArenaColors;
  readonly colorsVersion: number;
  /** Người chơi tắt dây quan hệ trong bảng cài đặt khi cụm đông và cảnh rối. */
  readonly visible: boolean;
  readonly tier: QualityTier;
}

/** Bề dày, tính bằng pixel màn hình. Nét đứt dày hơn vì nó là tin xấu. */
const WIDTH_SOLID = 2.7;
const WIDTH_BROKEN = 3.0;

/** Hệ số nhân màu cho dây không dính tới vật đang chọn. */
const DIM = 0.22;

/** Số phần tử tối đa của đoàn hạt chạy trên dây khoẻ. */
const MARKER_CAP = 256;

export function RelationEdges({
  runtime,
  colors,
  colorsVersion,
  visible,
  propsRef,
  reducedMotion,
}: RelationEdgesProps): ReactElement {
  const builtRef = useRef(-1);
  const tintedRef = useRef('');
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const phase = useRef(0);
  const rendered = useRef({ solid: [] as number[], dashed: [] as number[] });
  const routeTarget = useRef({ solid: [] as number[], dashed: [] as number[] });
  const routeTopology = useRef('');
  const routeBlending = useRef(false);
  const routeFrame = useRef(0);

  const markerGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    for (const name of ['position', 'color']) {
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(new Float32Array(MARKER_CAP * 3), 3).setUsage(
          THREE.DynamicDrawUsage,
        ),
      );
    }
    geometry.setDrawRange(0, 0);
    return geometry;
  }, []);
  const markerMaterial = useMemo(createEdgeMarkerMaterial, []);
  const markers = useMemo(() => {
    const points = new THREE.Points(markerGeometry, markerMaterial);
    points.frustumCulled = false;
    points.renderOrder = 5;
    return points;
  }, [markerGeometry, markerMaterial]);

  const solidGeometry = useMemo(() => new LineSegmentsGeometry(), []);
  const dashedGeometry = useMemo(() => new LineSegmentsGeometry(), []);

  const solidMaterial = useMemo(
    () =>
      new LineMaterial({
        linewidth: WIDTH_SOLID,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        toneMapped: false,
        fog: false,
        // Khử răng cưa theo độ phủ: dây mảnh chạy chéo mà thiếu nó thì viền
        // răng cưa thấy rõ hơn cả chính sợi dây.
        alphaToCoverage: true,
        depthWrite: false,
      }),
    [],
  );
  const dashedMaterial = useMemo(
    () =>
      new LineMaterial({
        linewidth: WIDTH_BROKEN,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        toneMapped: false,
        fog: false,
        alphaToCoverage: true,
        depthWrite: false,
        dashed: true,
        dashSize: 0.3,
        gapSize: 0.22,
      }),
    [],
  );

  const solid = useMemo(() => {
    const lines = new LineSegments2(solidGeometry, solidMaterial);
    lines.frustumCulled = false;
    lines.renderOrder = 2;
    return lines;
  }, [solidGeometry, solidMaterial]);

  const dashed = useMemo(() => {
    const lines = new LineSegments2(dashedGeometry, dashedMaterial);
    lines.frustumCulled = false;
    lines.renderOrder = 2;
    return lines;
  }, [dashedGeometry, dashedMaterial]);

  const focused = useMemo(
    () =>
      [false, true].map((broken) => {
        const geometry = new LineSegmentsGeometry();
        const material = new LineMaterial({
          linewidth: 3.2,
          vertexColors: true,
          transparent: true,
          opacity: 1,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
          fog: false,
          dashed: broken,
          dashSize: 0.3,
          gapSize: 0.22,
        });
        const line = new LineSegments2(geometry, material);
        line.frustumCulled = false;
        line.renderOrder = 4;
        return line;
      }),
    [],
  );

  useEffect(
    () => () => {
      focused.forEach((line) => {
        line.geometry.dispose();
        line.material.dispose();
      });
      markerGeometry.dispose();
      markerMaterial.dispose();
      solidGeometry.dispose();
      dashedGeometry.dispose();
      solidMaterial.dispose();
      dashedMaterial.dispose();
    },
    [
      focused,
      markers,
      markerGeometry,
      markerMaterial,
      solidGeometry,
      dashedGeometry,
      solidMaterial,
      dashedMaterial,
    ],
  );

  /*
   * ⚠ Bề dày của `LineSegments2` được tính trong shader từ `resolution`. Không
   * cập nhật nó theo khung vẽ thì dây dày đúng ở một kích thước cửa sổ và sai ở
   * mọi kích thước khác — sai âm thầm, không lỗi, không cảnh báo.
   */
  useEffect(() => {
    // LineSegments2 normally overwrites this with device pixels at draw time.
    solid.onBeforeRender = () => solidMaterial.resolution.set(size.width, size.height);
    dashed.onBeforeRender = () => dashedMaterial.resolution.set(size.width, size.height);
    solidMaterial.resolution.set(size.width, size.height);
    dashedMaterial.resolution.set(size.width, size.height);
    for (const line of focused) {
      line.onBeforeRender = () => line.material.resolution.set(size.width, size.height);
      line.material.resolution.set(size.width, size.height);
    }
    invalidate();
  }, [size, solid, dashed, solidMaterial, dashedMaterial, focused, invalidate]);

  const resourceColors = useMemo(
    () =>
      new Map(
        RESOURCE_KINDS.map((kind) => {
          const { h, s, l } = RESOURCE_HSL[kind];
          return [
            kind,
            new THREE.Color().setHSL(h, s, Math.min(0.76, l + 0.08), THREE.SRGBColorSpace),
          ];
        }),
      ),
    [],
  );

  useFrame((state, dt) => {
    focused.forEach((line) => {
      line.visible = visible && !!propsRef.current.selectedUid;
    });
    solid.visible = visible;
    dashed.visible = visible;
    markers.visible = visible;
    if (!visible) {
      return;
    }

    const structureChanged = builtRef.current !== runtime.structureVersion;
    if (structureChanged) {
      const topology = runtime.links
        .map((link) => `${link.fromUid}:${link.toUid}:${link.kind}:${link.healthy}`)
        .join('|');
      routeTarget.current = { solid: [...runtime.edges.solid], dashed: [...runtime.edges.dashed] };
      if (
        topology !== routeTopology.current ||
        reducedMotion ||
        rendered.current.solid.length !== runtime.edges.solid.length ||
        rendered.current.dashed.length !== runtime.edges.dashed.length
      ) {
        rendered.current = { solid: [...runtime.edges.solid], dashed: [...runtime.edges.dashed] };
        routeTopology.current = topology;
      }
      routeBlending.current = true;
      builtRef.current = runtime.structureVersion;
      tintedRef.current = '';
    }
    if (routeBlending.current) {
      const blend = reducedMotion ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 22);
      let remaining = 0;
      for (const batch of ['solid', 'dashed'] as const) {
        const points = rendered.current[batch],
          target = routeTarget.current[batch];
        for (let i = 0; i < target.length; i++) {
          const at = i % (EDGE_SEGMENTS * 6);
          // Attachment points track resources immediately; curve changes ease in.
          const endpoint = at < 3 || at >= EDGE_SEGMENTS * 6 - 3;
          const delta = target[i]! - (points[i] ?? target[i]!);
          points[i] = endpoint || Math.abs(delta) < 0.001 ? target[i]! : points[i]! + delta * blend;
          if (!endpoint) remaining = Math.max(remaining, Math.abs(delta));
        }
      }
      writePositions(solidGeometry, rendered.current.solid);
      writePositions(dashedGeometry, rendered.current.dashed);
      writeDistances(solidGeometry, rendered.current.solid);
      writeDistances(dashedGeometry, rendered.current.dashed);
      routeFrame.current++;
      routeBlending.current = remaining > 0.001;
      if (routeBlending.current) invalidate();
    }

    /*
     * Buffer màu chỉ ghi lại khi có lý do: đổi cấu trúc, đổi theme, hoặc đổi vật
     * đang chọn. Khoá gộp cả ba nên một khung hình bình thường không đụng gì.
     */
    const focus = propsRef.current.selectedUid ?? '';
    const tintKey = `${runtime.structureVersion}|${colorsVersion}|${focus}`;
    if (tintedRef.current !== tintKey) {
      tintedRef.current = tintKey;
      writeColors(
        solidGeometry,
        runtime.edges.solidKinds,
        runtime.edges.solidLinks,
        runtime.links,
        runtime,
        resourceColors,
        colors.edgeBroken,
        focus,
      );
      writeColors(
        dashedGeometry,
        runtime.edges.dashedKinds,
        runtime.edges.dashedLinks,
        runtime.links,
        runtime,
        resourceColors,
        colors.edgeBroken,
        focus,
      );
    }

    const focusKey = `${routeFrame.current}:${colorsVersion}:${focus}`;
    if (focused[0]!.userData.key !== focusKey) {
      focused[0]!.userData.key = focusKey;
      for (let batch = 0; batch < focused.length; batch++) {
        const points = batch ? rendered.current.dashed : rendered.current.solid;
        const owners = batch ? runtime.edges.dashedLinks : runtime.edges.solidLinks;
        const kinds = batch ? runtime.edges.dashedKinds : runtime.edges.solidKinds;
        const selectedPoints: number[] = [],
          selectedOwners: number[] = [],
          selectedKinds: number[] = [];
        for (let segment = 0; segment < owners.length; segment++) {
          const link = runtime.links[owners[segment]!];
          if (!focus || !link || (link.fromUid !== focus && link.toUid !== focus)) continue;
          selectedPoints.push(...points.slice(segment * 6, segment * 6 + 6));
          selectedOwners.push(owners[segment]!);
          selectedKinds.push(kinds[segment]!);
        }
        const geometry = focused[batch]!.geometry;
        writePositions(geometry, selectedPoints);
        writeDistances(geometry, selectedPoints);
        writeColors(
          geometry,
          selectedKinds,
          selectedOwners,
          runtime.links,
          runtime,
          resourceColors,
          colors.edgeBroken,
          focus,
        );
      }
    }

    const speed = propsRef.current.simulationSpeed ?? 1;
    const running = !reducedMotion && speed > 0 && document.visibilityState === 'visible';
    if (running) phase.current = (phase.current + Math.min(dt, 0.1) * speed * 0.16) % 1;

    // Broken relationships carry their own moving dash pattern, never dots.
    // A negative offset moves dashes in increasing path-distance direction.
    dashedMaterial.dashOffset = -phase.current * 0.52 * 8;
    focused[1]!.material.dashOffset = dashedMaterial.dashOffset;
    markerMaterial.uniforms.pixelRatio!.value = state.gl.getPixelRatio();
    markerMaterial.depthTest = !focus;
    const positions = markerGeometry.getAttribute('position') as THREE.BufferAttribute;
    const dotColors = markerGeometry.getAttribute('color') as THREE.BufferAttribute;
    const stride = EDGE_SEGMENTS * 6;
    let count = 0;
    for (const batch of ['solid'] as const) {
      const points = rendered.current[batch];
      const owners = runtime.edges.solidLinks;
      for (let i = 0; i < points.length / stride && count < MARKER_CAP; i++) {
        const link = runtime.links[owners[i * EDGE_SEGMENTS]!];
        if (focus && link?.fromUid !== focus && link?.toUid !== focus) continue;
        const source = link ? runtime.entries.get(link.fromUid) : undefined;
        const color = (source ? resourceColors.get(source.kind) : undefined) ?? colors.edge;
        const t = ((phase.current + i * 0.381966) % 1) * EDGE_SEGMENTS;
        const offset = i * stride + Math.floor(t) * 6;
        const mix = t % 1;
        for (let axis = 0; axis < 3; axis++) {
          const start = points[offset + axis]!;
          positions.array[count * 3 + axis] = start + (points[offset + axis + 3]! - start) * mix;
        }
        dotColors.setXYZ(count, color.r, color.g, color.b);
        count++;
      }
    }
    markerGeometry.setDrawRange(0, count);
    positions.needsUpdate = true;
    dotColors.needsUpdate = true;
    if (running && (count > 0 || rendered.current.dashed.length > 0)) invalidate();
  });

  return (
    <>
      {focused.map((line, i) => (
        <primitive key={`focus-${i}`} object={line} />
      ))}
      <primitive object={markers} />
      <primitive object={solid} />
      <primitive object={dashed} />
    </>
  );
}

/** Reuse position buffers while the number of segments remains unchanged. */
function writePositions(geometry: LineSegmentsGeometry, points: readonly number[]): void {
  const attribute = geometry.getAttribute('instanceStart') as
    THREE.InterleavedBufferAttribute | undefined;
  if (attribute && attribute.data.array.length === Math.max(6, points.length)) {
    attribute.data.array.set(points);
    attribute.data.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  } else {
    // Release old GPU buffers before replacing attributes on topology changes.
    geometry.dispose();
    geometry.setPositions(points.length ? new Float32Array(points) : new Float32Array(6));
  }
  geometry.instanceCount = points.length / 6;
}

/** Source resource identity stays readable on both solid and broken edges. */
function writeColors(
  geometry: LineSegmentsGeometry,
  kinds: readonly number[],
  owners: readonly number[],
  links: readonly { readonly fromUid: string; readonly toUid: string }[],
  runtime: SceneRuntime,
  resourceColors: ReadonlyMap<ResourceKind, THREE.Color>,
  fallback: THREE.Color,
  focus: string,
): void {
  if (kinds.length === 0) {
    geometry.setColors(new Float32Array(6));
    return;
  }
  const out = new Float32Array(kinds.length * 6);
  for (let segment = 0; segment < kinds.length; segment += 1) {
    const link = links[owners[segment] ?? -1];
    const source = link ? runtime.entries.get(link.fromUid) : undefined;
    const color = (source ? resourceColors.get(source.kind) : undefined) ?? fallback;

    let scale = 1;
    if (focus !== '') {
      const related = link !== undefined && (link.fromUid === focus || link.toUid === focus);
      scale = related ? 1 : DIM;
    }

    const base = segment * 6;
    const r = color.r * scale;
    const g = color.g * scale;
    const b = color.b * scale;
    // Hai đỉnh của một đoạn dùng chung màu: chuyển sắc dọc dây sẽ đánh nhau với
    // đoàn hạt đang chạy trên chính nó.
    out[base] = r;
    out[base + 1] = g;
    out[base + 2] = b;
    out[base + 3] = r;
    out[base + 4] = g;
    out[base + 5] = b;
  }
  const attribute = geometry.getAttribute('instanceColorStart') as
    THREE.InterleavedBufferAttribute | undefined;
  if (attribute && attribute.data.array.length === out.length) {
    attribute.data.array.set(out);
    attribute.data.needsUpdate = true;
  } else {
    geometry.setColors(out);
  }
}

/** Each relationship starts its own dash phase; reuse the GPU distance buffer
 * while endpoints move instead of allocating one on every animation frame. */
function writeDistances(geometry: LineSegmentsGeometry, points: readonly number[]): void {
  const attribute = geometry.getAttribute('instanceDistanceStart') as
    THREE.InterleavedBufferAttribute | undefined;
  const length = Math.max(2, points.length / 3);
  const data =
    attribute?.data.array.length === length
      ? attribute.data
      : new THREE.InstancedInterleavedBuffer(new Float32Array(length), 2, 1);
  let distance = 0;
  for (let segment = 0; segment < points.length / 6; segment++) {
    if (segment % EDGE_SEGMENTS === 0) distance = 0;
    const offset = segment * 6;
    data.array[segment * 2] = distance;
    distance += Math.hypot(
      points[offset + 3]! - points[offset]!,
      points[offset + 4]! - points[offset + 1]!,
      points[offset + 5]! - points[offset + 2]!,
    );
    data.array[segment * 2 + 1] = distance;
  }
  if (data !== attribute?.data) {
    geometry.setAttribute(
      'instanceDistanceStart',
      new THREE.InterleavedBufferAttribute(data, 1, 0),
    );
    geometry.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(data, 1, 1));
  }
  data.needsUpdate = true;
}
