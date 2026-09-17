'use client';

/**
 * Cạnh phụ thuộc: đường gấp khúc theo làn + chấm chảy trên đường găng (19.D.3.4).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ KHÔNG BÓ CẠNH (edge bundling)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kế hoạch D.3.4 cấm, và lý do là chức năng chứ không phải thẩm mỹ: bó cạnh gom
 * nhiều đường vào một bó chung để bớt rối, nhưng việc người chơi cần làm ở game
 * này là **lần theo MỘT đường phụ thuộc** từ job này tới job kia. Bó lại thì
 * giữa bó không còn biết đường nào đi đâu — nó xoá đúng thao tác mà cảnh sinh ra
 * để phục vụ.
 *
 * Đường ở đây vẽ đúng `points` mà `placeWorkflow` trả về: mỗi đoạn đổi đúng MỘT
 * toạ độ (`countNonAxialSegments` gác điều đó ở tầng đặt chỗ), nên đường luôn là
 * góc vuông và mắt lần theo được.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BA LOẠI ĐƯỜNG, BA LỆNH VẼ — KHÔNG PHẢI MỘT LỆNH MỖI CẠNH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Toàn bộ cạnh của cảnh gộp vào ba `LineSegments` (thường / đường găng / chờ
 * máy), mỗi cái một bộ đệm đỉnh phẳng. Ba lệnh vẽ cho 8 cạnh cũng như cho 80.
 *
 * Chờ-máy tách riêng vì `DagEdgeView.resourceEdge` nói rõ vì sao: tô một đoạn
 * chờ-máy như thể nó là một phụ thuộc sẽ **dạy sai** — người chơi đi sửa đồ thị
 * trong khi thứ phải sửa là số máy hoặc thứ tự.
 *
 * ## Chấm chảy chỉ sống khi đường ống đang chạy
 *
 * Chấm chảy cần một khung hình mỗi nhịp. Nếu để nó chảy mãi thì
 * `frameloop="demand"` KHÔNG BAO GIỜ dừng sau lượt chạy đầu tiên — đúng cái bẫy
 * `idleSpinAfterMs` đã gài cho arena một lần (vẽ ~14fps vĩnh viễn). Nên cả lớp
 * chấm chỉ hiện khi có node đang chạy, và tắt hẳn khi lượt chạy kết thúc.
 */

import { useEffect, useMemo, type ReactElement } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

import { countEdgeSegments, type DrawEdge, type SceneDraw } from './scene-draw';
import type { CicdThreeColors } from './use-cicd-colors';

/** Khoảng cách giữa hai chấm trên cùng một đoạn, đơn vị thế giới. */
const DOT_SPACING = 0.42;
/** Tốc độ chảy, đơn vị thế giới mỗi giây. */
const DOT_SPEED = 1.35;
/** Trần số chấm — chặn một level rất lớn biến lớp này thành thứ tốn kém nhất cảnh. */
const MAX_DOTS = 512;

type EdgeKind = 'normal' | 'critical' | 'resource';

const EDGE_KINDS: readonly EdgeKind[] = ['normal', 'critical', 'resource'];

function kindOf(edge: DrawEdge): EdgeKind {
  if (edge.resourceEdge) {
    return 'resource';
  }
  return edge.critical ? 'critical' : 'normal';
}

function buildLineGeometry(edges: readonly DrawEdge[]): THREE.BufferGeometry {
  const segments = countEdgeSegments(edges);
  const positions = new Float32Array(Math.max(1, segments) * 6);
  let at = 0;
  for (const edge of edges) {
    for (let i = 1; i < edge.points.length; i += 1) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      if (a === undefined || b === undefined) {
        continue;
      }
      positions[at] = a.x;
      positions[at + 1] = a.y;
      positions[at + 2] = a.z;
      positions[at + 3] = b.x;
      positions[at + 4] = b.y;
      positions[at + 5] = b.z;
      at += 6;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, segments * 2);
  return geometry;
}

const DOT_VERTEX = `
uniform float uTime;
uniform float uSpeed;
uniform float uSize;
attribute vec3 aDir;
attribute float aLen;
attribute float aOffset;
void main() {
  float span = max(aLen, 0.0001);
  float travel = mod(uTime * uSpeed + aOffset, span);
  vec4 mv = modelViewMatrix * vec4(position + aDir * travel, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize;
}
`;

const DOT_FRAGMENT = `
uniform vec3 uColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  gl_FragColor = vec4(uColor, 1.0 - smoothstep(0.04, 0.25, r));
}
`;

interface DotBuffers {
  readonly geometry: THREE.BufferGeometry;
  readonly count: number;
}

/**
 * Rải chấm dọc TỪNG ĐOẠN của đường găng.
 *
 * Rải theo đoạn chứ không theo cả đường: một chấm chạy hết đường gấp khúc cần
 * shader biết toàn bộ danh sách điểm, tức một texture tra cứu cho mỗi đường —
 * đắt hơn nhiều so với thứ nó thêm được. Chấm quấn vòng trong từng đoạn đọc ra
 * vẫn là "có thứ gì đang chảy theo hướng này", và hướng mới là thông tin.
 */
function buildDotBuffers(edges: readonly DrawEdge[]): DotBuffers {
  const starts: number[] = [];
  const dirs: number[] = [];
  const lens: number[] = [];
  const offsets: number[] = [];

  for (const edge of edges) {
    for (let i = 1; i < edge.points.length && starts.length / 3 < MAX_DOTS; i += 1) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      if (a === undefined || b === undefined) {
        continue;
      }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dy, dz);
      if (!Number.isFinite(length) || length < 1e-4) {
        continue;
      }
      const dots = Math.max(1, Math.round(length / DOT_SPACING));
      for (let k = 0; k < dots && starts.length / 3 < MAX_DOTS; k += 1) {
        starts.push(a.x, a.y, a.z);
        dirs.push(dx / length, dy / length, dz / length);
        lens.push(length);
        offsets.push((k / dots) * length);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(starts), 3));
  geometry.setAttribute('aDir', new THREE.BufferAttribute(new Float32Array(dirs), 3));
  geometry.setAttribute('aLen', new THREE.BufferAttribute(new Float32Array(lens), 1));
  geometry.setAttribute('aOffset', new THREE.BufferAttribute(new Float32Array(offsets), 1));
  return { geometry, count: lens.length };
}

export interface EdgeLinesProps {
  readonly draw: SceneDraw;
  readonly colors: CicdThreeColors;
  /** Có node nào đang chạy không. Chấm chảy chỉ sống khi có — xem khối đầu file. */
  readonly flowActive: boolean;
}

export function EdgeLines({ draw, colors, flowActive }: EdgeLinesProps): ReactElement {
  const grouped = useMemo(() => {
    const map = new Map<EdgeKind, DrawEdge[]>();
    for (const kind of EDGE_KINDS) {
      map.set(kind, []);
    }
    for (const edge of draw.edges) {
      map.get(kindOf(edge))?.push(edge);
    }
    return map;
  }, [draw]);

  const geometries = useMemo(
    () => EDGE_KINDS.map((kind) => buildLineGeometry(grouped.get(kind) ?? [])),
    [grouped],
  );

  const materials = useMemo(
    () =>
      EDGE_KINDS.map(
        (kind) =>
          new THREE.LineBasicMaterial({
            transparent: true,
            // Đường găng đậm nhất, chờ-máy mờ nhất: chờ-máy KHÔNG phải quan hệ
            // phụ thuộc, nên nó không được trông như một.
            opacity: kind === 'critical' ? 0.95 : kind === 'resource' ? 0.3 : 0.55,
            toneMapped: false,
          }),
      ),
    [],
  );

  const dots = useMemo(
    () => buildDotBuffers(grouped.get('critical') ?? []),
    [grouped],
  );

  const dotMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: DOT_SPEED },
          uSize: { value: 5 },
          uColor: { value: new THREE.Color() },
        },
        vertexShader: DOT_VERTEX,
        fragmentShader: DOT_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => {
    const [normal, critical, resource] = materials;
    normal?.color.copy(colors.border);
    critical?.color.copy(colors.primary);
    resource?.color.copy(colors.mutedForeground);
    const uniform = dotMaterial.uniforms.uColor;
    if (uniform !== undefined) {
      (uniform.value as THREE.Color).copy(colors.primary);
    }
  }, [materials, dotMaterial, colors]);

  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  useEffect(() => () => dots.geometry.dispose(), [dots]);
  useEffect(() => () => dotMaterial.dispose(), [dotMaterial]);

  useFrame((_state, delta) => {
    if (!flowActive) {
      return;
    }
    const uniform = dotMaterial.uniforms.uTime;
    if (uniform !== undefined) {
      uniform.value = (uniform.value as number) + Math.min(delta, 0.1);
    }
  });

  return (
    <>
      {EDGE_KINDS.map((kind, index) => {
        const geometry = geometries[index];
        const material = materials[index];
        if (geometry === undefined || material === undefined) {
          return null;
        }
        /*
         * ⛔ Lô RỖNG vẫn tốn một lệnh vẽ. Đặt `drawRange` về 0 là chưa đủ: đo
         * 2026-09-17 trên level C13 (chỉ có cạnh thường, không có đường găng và
         * không có cạnh chờ-máy) `__dlpCicdScene()` báo `calls: 4` — một lô thân
         * cộng ĐỦ BA lô cạnh, trong đó hai lô không có lấy một đoạn.
         *
         * Không tháo hẳn thì ô AC-D4 đếm cả những lô không vẽ gì, và con số nó
         * ghim mô tả số lô ta KHAI chứ không mô tả việc cảnh thật sự làm.
         */
        if ((grouped.get(kind) ?? []).length === 0) {
          return null;
        }
        return <lineSegments key={kind} geometry={geometry} material={material} frustumCulled={false} />;
      })}
      {flowActive && dots.count > 0 ? (
        <points geometry={dots.geometry} material={dotMaterial} frustumCulled={false} />
      ) : null}
    </>
  );
}
