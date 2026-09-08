'use client';

import { useEffect, useMemo, useRef, type ReactElement, type RefObject } from 'react';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { useFrame, useThree } from '@react-three/fiber';
import type { ArenaSceneProps } from '../arena-contract';
import { EDGE_SEGMENTS, RELATION_KINDS, RELATION_TOKEN } from '../shared/edge-routing';
import type { SceneRuntime } from './scene-entry';
import type { ArenaColors } from './use-arena-colors';

/**
 * Quan hệ giữa các tài nguyên: nét liền cho quan hệ đang khoẻ, nét đứt cho quan
 * hệ ĐÁNG LẼ có mà đang đứt (selector lệch label).
 *
 * ## Vì sao `LineSegments2` chứ không phải `THREE.LineSegments`
 *
 * `LineBasicMaterial.linewidth` **bị WebGL bỏ qua** — mọi trình duyệt vẽ đúng 1
 * pixel bất kể ta khai bao nhiêu. Bản trước dùng nó, và đó là toàn bộ nguyên
 * nhân của lời phàn nàn *"line quá mỏng, rối, khó nhìn"*: ở 1px, hai chục sợi
 * cong bắt chéo nhau thành một đám chỉ rối không thể lần. (Bản tham chiếu
 * k8sgames khai `linewidth: 1.5` và cũng nhận đúng 1px — họ chưa từng vẽ được
 * bề dày mà họ nghĩ là mình đang vẽ.)
 *
 * `LineSegments2` dựng mỗi đoạn thành một dải tam giác nên bề dày là THẬT, tính
 * bằng pixel màn hình. Giá phải trả: vật liệu cần biết độ phân giải khung vẽ
 * (`resolution`) — quên bước đó thì bề dày sai lệch theo tỉ lệ khung, và nó sai
 * một cách âm thầm.
 *
 * ## Một buffer, nhiều màu
 *
 * Vẫn chỉ hai lệnh vẽ, bất kể cụm có bao nhiêu quan hệ: màu đi theo ĐỈNH
 * (`vertexColors`), nên năm loại quan hệ nằm chung một hình học. Màu lấy từ
 * token của chính loại tài nguyên ở đầu phát (`RELATION_TOKEN`) — dây từ một
 * Service mang sắc của Service, nên mắt nối được dây với vật.
 *
 * ## Làm mờ khi có vật được chọn
 *
 * Chọn một vật thì mọi dây KHÔNG dính tới nó bị hạ xuống `DIM`. Đây là cách gỡ
 * rối đúng: người chơi vẫn thấy toàn cảnh, nhưng đường liên quan nổi hẳn lên.
 * Rẻ vì chỉ ghi lại buffer màu — hình học không đụng tới.
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

/** Bề dày, tính bằng pixel màn hình. Nét đứt dày hơn vì nó là tin xấu. */
const WIDTH_SOLID = 2.6;
const WIDTH_BROKEN = 3.4;

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

  const markerGeometry = useMemo(() => new THREE.SphereGeometry(0.055, 8, 6), []);
  const markerMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.9 }),
    [],
  );
  const markers = useMemo(() => {
    const mesh = new THREE.InstancedMesh(markerGeometry, markerMaterial, MARKER_CAP);
    mesh.frustumCulled = false;
    mesh.count = 0;
    return mesh;
  }, [markerGeometry, markerMaterial]);
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  const solidGeometry = useMemo(() => new LineSegmentsGeometry(), []);
  const dashedGeometry = useMemo(() => new LineSegmentsGeometry(), []);

  const solidMaterial = useMemo(
    () =>
      new LineMaterial({
        linewidth: WIDTH_SOLID,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        toneMapped: false,
        // Khử răng cưa theo độ phủ: dây mảnh chạy chéo mà thiếu nó thì viền
        // răng cưa thấy rõ hơn cả chính sợi dây.
        alphaToCoverage: true,
      }),
    [],
  );
  const dashedMaterial = useMemo(
    () =>
      new LineMaterial({
        linewidth: WIDTH_BROKEN,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        toneMapped: false,
        alphaToCoverage: true,
        dashed: true,
        dashSize: 0.3,
        gapSize: 0.22,
      }),
    [],
  );

  const solid = useMemo(() => {
    const lines = new LineSegments2(solidGeometry, solidMaterial);
    lines.frustumCulled = false;
    return lines;
  }, [solidGeometry, solidMaterial]);

  const dashed = useMemo(() => {
    const lines = new LineSegments2(dashedGeometry, dashedMaterial);
    lines.frustumCulled = false;
    return lines;
  }, [dashedGeometry, dashedMaterial]);

  useEffect(
    () => () => {
      markers.dispose();
      markerGeometry.dispose();
      markerMaterial.dispose();
      solidGeometry.dispose();
      dashedGeometry.dispose();
      solidMaterial.dispose();
      dashedMaterial.dispose();
    },
    [
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
    solidMaterial.resolution.set(size.width, size.height);
    dashedMaterial.resolution.set(size.width, size.height);
    invalidate();
  }, [size, solidMaterial, dashedMaterial, invalidate]);

  /** Màu của từng loại quan hệ, theo đúng thứ tự `RELATION_KINDS`. */
  const kindColors = useMemo(() => RELATION_KINDS.map(() => new THREE.Color()), []);
  useEffect(() => {
    for (let i = 0; i < RELATION_KINDS.length; i += 1) {
      const kind = RELATION_KINDS[i];
      const target = kindColors[i];
      if (kind === undefined || target === undefined) {
        continue;
      }
      const token = RELATION_TOKEN[kind];
      // Thiếu token thì lùi về màu dây chung, không lùi về đen: một sợi dây đen
      // trên nền đen là một sợi dây biến mất.
      target.copy(colors.kind[token] ?? colors.edge);
    }
  }, [kindColors, colors, colorsVersion]);

  useFrame((_state, dt) => {
    solid.visible = visible;
    dashed.visible = visible;
    markers.visible = visible && !reducedMotion;
    if (!visible) {
      return;
    }

    const structureChanged = builtRef.current !== runtime.structureVersion;
    if (structureChanged) {
      builtRef.current = runtime.structureVersion;
      writePositions(solidGeometry, runtime.edges.solid);
      writePositions(dashedGeometry, runtime.edges.dashed);
      // `dashed` đọc khoảng cách dọc dây để biết chỗ nào là nét, chỗ nào là
      // khoảng hở. Thiếu bước này thì nét đứt ra nét liền — và lúc đó một quan
      // hệ ĐANG ĐỨT trông y hệt một quan hệ khoẻ.
      dashed.computeLineDistances();
      // Buộc tô lại: hình học mới thì buffer màu cũ không còn khớp số đoạn.
      tintedRef.current = '';
    }

    /*
     * Buffer màu chỉ ghi lại khi có lý do: đổi cấu trúc, đổi theme, hoặc đổi vật
     * đang chọn. Khoá gộp cả ba nên một khung hình bình thường không đụng gì.
     */
    const focus = propsRef.current.selectedUid ?? propsRef.current.hoveredUid ?? '';
    const tintKey = `${runtime.structureVersion}|${colorsVersion}|${focus}`;
    if (tintedRef.current !== tintKey) {
      tintedRef.current = tintKey;
      writeColors(
        solidGeometry,
        runtime.edges.solidKinds,
        runtime.edges.solidLinks,
        runtime.links,
        kindColors,
        colors.edgeBroken,
        focus,
      );
      writeColors(
        dashedGeometry,
        runtime.edges.dashedKinds,
        runtime.edges.dashedLinks,
        runtime.links,
        // Quan hệ đứt KHÔNG mang màu của loại: nó phải đọc ra là hỏng, bất kể nó
        // hỏng ở tầng mạng hay tầng lưu trữ.
        null,
        colors.edgeBroken,
        focus,
      );
    }

    const speed = propsRef.current.simulationSpeed ?? 1;
    const running = !reducedMotion && speed > 0 && document.visibilityState === 'visible';
    if (!running) {
      markers.count = 0;
      return;
    }

    phase.current += Math.min(dt, 0.1) * speed * 0.32;
    // Nét đứt TRÔI NGƯỢC chiều quan hệ: mắt đọc ra "đang cố mà không tới nơi",
    // khác hẳn đoàn hạt xuôi chiều trên dây khoẻ.
    dashedMaterial.dashOffset = phase.current * 0.6;

    const points = runtime.edges.solid;
    const stride = EDGE_SEGMENTS * 6;
    markers.count = Math.min(MARKER_CAP, Math.floor(points.length / stride));
    for (let i = 0; i < markers.count; i += 1) {
      const t = ((phase.current + i * 0.37) % 1) * EDGE_SEGMENTS;
      const offset = i * stride + Math.floor(t) * 6;
      const mix = t % 1;
      const x = points[offset] ?? 0;
      const y = points[offset + 1] ?? 0;
      const z = points[offset + 2] ?? 0;
      matrix.makeTranslation(
        x + ((points[offset + 3] ?? x) - x) * mix,
        y + ((points[offset + 4] ?? y) - y) * mix,
        z + ((points[offset + 5] ?? z) - z) * mix,
      );
      markers.setMatrixAt(i, matrix);
    }
    markers.instanceMatrix.needsUpdate = true;
    if (markers.count > 0) {
      invalidate();
    }
  });

  return (
    <>
      <primitive object={markers} />
      <primitive object={solid} />
      <primitive object={dashed} />
    </>
  );
}

/**
 * Nạp toạ độ. `LineSegmentsGeometry` tự tách thành thuộc tính instance, nên
 * không tái dùng buffer được như `BufferGeometry` — nhưng nó chỉ chạy khi cấu
 * trúc đổi, không chạy mỗi khung hình.
 */
function writePositions(geometry: LineSegmentsGeometry, points: readonly number[]): void {
  if (points.length === 0) {
    // `setPositions([])` để lại thuộc tính rỗng và WebGL cảnh báo mỗi khung hình.
    geometry.setPositions(new Float32Array(6));
    geometry.instanceCount = 0;
    return;
  }
  geometry.setPositions(new Float32Array(points));
  geometry.instanceCount = points.length / 6;
}

/**
 * Nạp màu cho từng đỉnh, có tính chuyện làm mờ.
 *
 * `kindColors === null` nghĩa là mọi đoạn dùng chung `fallback` — dùng cho dây
 * đứt, thứ phải đọc ra là hỏng chứ không đọc ra là "thuộc tầng mạng".
 */
function writeColors(
  geometry: LineSegmentsGeometry,
  kinds: readonly number[],
  owners: readonly number[],
  links: readonly { readonly fromUid: string; readonly toUid: string }[],
  kindColors: readonly THREE.Color[] | null,
  fallback: THREE.Color,
  focus: string,
): void {
  if (kinds.length === 0) {
    geometry.setColors(new Float32Array(6));
    return;
  }
  const out = new Float32Array(kinds.length * 6);
  for (let segment = 0; segment < kinds.length; segment += 1) {
    const kindIndex = kinds[segment] ?? -1;
    const color = (kindColors === null ? undefined : kindColors[kindIndex]) ?? fallback;

    let scale = 1;
    if (focus !== '') {
      const link = links[owners[segment] ?? -1];
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
  geometry.setColors(out);
}
