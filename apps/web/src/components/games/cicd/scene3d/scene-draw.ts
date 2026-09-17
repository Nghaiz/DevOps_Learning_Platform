/**
 * Mô hình vẽ của cảnh 3D — toán thuần, **không `three`** (19.D.3).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐÂY LÀ CHỖ AC-D2 ĐƯỢC BẢO ĐẢM BẰNG XÂY DỰNG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AC-D2 đòi hai renderer vẽ CÙNG tập node và cạnh. `scene-props.ts` nói rõ cách
 * duy nhất để ô đó không thành lời khai: cả hai bên lấy tập được vẽ từ CÙNG hai
 * hàm thuần `cicdSceneNodes()` / `cicdSceneEdges()`.
 *
 * Nên **mọi** thứ cảnh 3D vẽ đi qua đúng file này, và file này gọi đúng hai hàm
 * đó. Không component `.tsx` nào dưới `scene3d/` được đụng vào `props.view.nodes`
 * — chúng nhận `SceneDraw` đã dựng sẵn. Một phép lọc riêng ở tầng component sẽ
 * làm AC-D2 xanh mà vô nghĩa, đúng thứ `green-that-proves-nothing.md` cảnh báo.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NODE BỊ LOẠI VÌ TOẠ ĐỘ HỎNG KHÔNG ĐƯỢC PHÉP BIẾN MẤT TRONG IM LẶNG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `toWorld` trả `null` cho điểm không hữu hạn — bắt buộc, vì một `NaN` trong một
 * `BufferAttribute` làm three vứt TOÀN BỘ draw call đó mà không ném gì.
 *
 * Nhưng "đã loại" là một sự kiện phải đếm được: `dropped` đi ra ngoài và phần tử
 * bọc canvas dựng thêm một `data-*` khi nó khác 0. Không có nó, một lỗi ở tầng
 * đặt chỗ hiện ra thành "cảnh thiếu vài node" và không có gì để lần theo.
 *
 * ⚠ Bộ đếm `data-cicd-node-count` mà AC-D1 đọc vẫn lấy từ `cicdSceneNodes()`
 * đúng như hợp đồng của lead, **không** trừ đi phần bị loại. Hai con số lệch
 * nhau chính là tín hiệu; gộp chúng lại là xoá mất tín hiệu đó.
 */

import {
  STATE_ENCODING,
  type InstanceKey,
  type NodeGeometry,
  type StageRunState,
} from '@devops-platform/games';

import {
  cicdSceneEdges,
  cicdSceneNodes,
  type CicdSceneEdgeKey,
  type CicdSceneProps,
} from '../scene-props';
import { bodyStyleOf, ringCountOf, type BodyStyle } from './node-visuals';
import { toWorld, toWorldPath, type WorldPoint } from './scene-3d-math';
import type { CicdStatusToken } from './cicd-scene-tokens';

export interface DrawNode {
  readonly id: InstanceKey;
  /** Tâm khối, toạ độ thế giới. Đã qua `toWorld`, nên chắc chắn hữu hạn. */
  readonly world: WorldPoint;
  readonly state: StageRunState;
  /** Token màu. Lấy từ `view`, KHÔNG suy lại từ `state` — xem ghi chú dưới. */
  readonly token: CicdStatusToken;
  readonly geometry: NodeGeometry;
  readonly style: BodyStyle;
  readonly rings: 0 | 1 | 2;
  readonly icon: string;
  readonly name: string;
  readonly ariaLabel: string;
}

export interface DrawEdge {
  readonly key: CicdSceneEdgeKey;
  readonly points: readonly WorldPoint[];
  readonly critical: boolean;
  readonly resourceEdge: boolean;
}

export interface SceneDraw {
  readonly nodes: readonly DrawNode[];
  readonly edges: readonly DrawEdge[];
  /** Node gom theo kiểu thân — mỗi khoá là một `InstancedMesh`, một lệnh vẽ. */
  readonly byStyle: ReadonlyMap<BodyStyle, readonly DrawNode[]>;
  /** Node có vành, phẳng ra theo từng vành: `ringed` một mục, `ringed-double` hai. */
  readonly ringSlots: readonly RingSlot[];
  /** Node cần lớp vỏ phát sáng (`running` / `retrying`). */
  readonly glowNodes: readonly DrawNode[];
  /** Trạng thái của mọi node được vẽ — đầu vào của `needsContinuousFrames`. */
  readonly states: readonly StageRunState[];
  /** Số node/cạnh bị loại vì toạ độ không hữu hạn. Khác 0 là có lỗi ở tầng dưới. */
  readonly droppedNodes: number;
  readonly droppedEdges: number;
  /** Bộ đếm hợp đồng của AC-D1 — trước khi loại. Xem khối đầu file. */
  readonly nodeCount: number;
  readonly edgeCount: number;
}

export interface RingSlot {
  readonly node: DrawNode;
  /** 0 hoặc 1. Vành thứ hai của `ringed-double` vẽ lệch bán kính. */
  readonly index: 0 | 1;
}

/**
 * Dựng mô hình vẽ từ props.
 *
 * ⚠ `token` lấy thẳng từ `view.nodes[i].statusToken`, KHÔNG tra lại
 * `STATE_ENCODING[state].statusToken`. Hai đường phải cho cùng kết quả — chú
 * thích của `scene-encoding.ts` nói `scene-view.ts` điền `statusToken` bằng
 * chính bảng đó — nhưng đọc lại từ bảng là dựng một đường thứ hai, và nếu hai
 * đường có ngày lệch nhau thì renderer sẽ vẽ theo đường KHÔNG phải đường mà
 * `view` mang, tức là vẽ khác thứ mọi tầng trên đang nói. Đọc từ view là một
 * nguồn; icon và hình học thì bảng là nguồn duy nhất nên lấy từ bảng.
 */
export function buildSceneDraw(props: CicdSceneProps): SceneDraw {
  const placed = cicdSceneNodes(props);
  const resolved = cicdSceneEdges(props);

  const nodes: DrawNode[] = [];
  const states: StageRunState[] = [];
  const byStyle = new Map<BodyStyle, DrawNode[]>();
  const ringSlots: RingSlot[] = [];
  const glowNodes: DrawNode[] = [];
  let droppedNodes = 0;

  for (const entry of placed) {
    const world = toWorld(entry.spot);
    if (world === null) {
      droppedNodes += 1;
      continue;
    }
    const encoding = STATE_ENCODING[entry.node.state];
    const geometry = encoding.geometry;
    const rings = ringCountOf(geometry);
    const node: DrawNode = {
      id: entry.id,
      world,
      state: entry.node.state,
      token: entry.node.statusToken,
      geometry,
      style: bodyStyleOf(geometry),
      rings,
      icon: encoding.icon,
      name: entry.node.name,
      ariaLabel: entry.node.ariaLabel,
    };
    nodes.push(node);
    states.push(node.state);

    const bucket = byStyle.get(node.style);
    if (bucket === undefined) {
      byStyle.set(node.style, [node]);
    } else {
      bucket.push(node);
    }

    for (let i = 0; i < rings; i += 1) {
      ringSlots.push({ node, index: i === 0 ? 0 : 1 });
    }
    if (node.state === 'running' || node.state === 'retrying') {
      glowNodes.push(node);
    }
  }

  const edges: DrawEdge[] = [];
  let droppedEdges = 0;
  for (const entry of resolved) {
    const points = toWorldPath(entry.spot.points);
    if (points === null) {
      droppedEdges += 1;
      continue;
    }
    edges.push({
      key: entry.key,
      points,
      critical: entry.edge.critical,
      resourceEdge: entry.edge.resourceEdge,
    });
  }

  return {
    nodes,
    edges,
    byStyle,
    ringSlots,
    glowNodes,
    states,
    droppedNodes,
    droppedEdges,
    nodeCount: placed.length,
    edgeCount: resolved.length,
  };
}

/**
 * Số ĐOẠN thẳng của toàn bộ tập cạnh — dung lượng cần cấp cho bộ đệm đỉnh.
 *
 * Tính trước chứ không nối mảng dần: `LineSegments` cần một `Float32Array` cỡ cố
 * định, và cấp lại bộ đệm mỗi lần đồ thị đổi là cấp phát lớn ngay giữa lượt chơi.
 */
export function countEdgeSegments(edges: readonly DrawEdge[]): number {
  let total = 0;
  for (const edge of edges) {
    total += Math.max(0, edge.points.length - 1);
  }
  return total;
}

/** Tổng chiều dài một đường gấp khúc — dùng để rải chấm chảy cho đều. */
export function pathLength(points: readonly WorldPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) {
      continue;
    }
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return total;
}
