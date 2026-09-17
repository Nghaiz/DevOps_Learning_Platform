/**
 * Phép đặt chỗ cho cảnh game CI/CD — toán THUẦN, không một dòng `three` (19.D.1.1).
 *
 * Phạm vi: `plans/devops-learning-platform/phase-19-d-exec.md` §2.1.
 *
 * ## Ba lý do file này không dính thư viện đồ hoạ nào
 *
 * 1. **Test được ở env `node`.** Phép đặt chỗ là thứ dễ sai nhất và cũng dễ test
 *    nhất — nó là toán, đầu vào ra đầu ra, không cần DOM lẫn WebGL.
 * 2. **Cổng `bundle:check`.** `three` + `@react-three/*` + `postprocessing` là
 *    ~631KB. P17 đã một lần rò engine sang 6 route không liên quan vì một barrel
 *    (`44f8e39`).
 * 3. **Hợp đồng đọc được.** Lane 2D và lane 3D gọi CÙNG hàm này. Nếu không thì ô
 *    AC-D2 ("hai renderer vẽ cùng tập node/cạnh") là lời khai chứ không phải
 *    phép đo.
 *
 * ## Đầu vào là VIEW, không phải `WorkflowSpec` + `RunRecord`
 *
 * Kế hoạch §2.1 đề nghị `placeWorkflow(workflow, record, chapter)`. Chủ dự án
 * chốt 2026-09-17 đi qua `CicdGraphView` thay vào đó, vì đọc thẳng bản ghi buộc
 * file này tự suy lại `state`/`kind`/`statusToken` — thành nguồn sự thật thứ hai
 * cho những thứ `StageNodeView` đã định nghĩa. Lý lẽ đầy đủ: đầu `scene-view.ts`.
 *
 * Tham số `chapter` cũng bỏ, vì `CicdView.yAxis` đã mang đúng thông tin đó và
 * chú thích của nó cấm suy lại từ `level.chapter` ở tầng trên (sandbox 19.H
 * không có level nào).
 *
 * ## Hình học CHỈ, không chép lại dữ liệu của view
 *
 * `CicdPlacementNode` mang toạ độ và **không** mang `status`/`kind`/`stepCount`
 * như kế hoạch §2.1 liệt kê — chúng đã nằm trong `view.nodes`, và chép sang đây
 * là đúng thứ `code-conventions.md` § "No Derived Fields" cấm. Renderer ghép hai
 * bên bằng `instance`.
 */

import type { CicdGraphView } from './scene-view.ts';
import type { EnvironmentId, InstanceKey, StageId, StageNodeView } from './contract.ts';
import { idDict, ownValue } from './id-dict.ts';
import { compareKeys } from '../git/deterministic.ts';
import { layoutDag, type DagNode } from '../core/layout/index.ts';
import { routeEdge, type LayoutPoint } from '../core/layout/edge-route.ts';

/**
 * Khoảng cách giữa hai tầng phụ thuộc, theo đơn vị thế giới.
 *
 * Một đơn vị mỗi ô lưới là chủ ý: nó làm toạ độ ĐỌC ĐƯỢC trong test (`x === 2`
 * nghĩa là tầng 2) và để việc chọn tỉ lệ thật cho renderer, nơi nó phụ thuộc cỡ
 * node và cỡ chữ — hai thứ file này không biết gì.
 */
const LAYER_SPACING = 1;

/** Khoảng cách giữa hai làn job song song. */
const LANE_SPACING = 1;

/**
 * Chiều cao mỗi tick chờ hàng đợi — trục Y của **chương CI**.
 *
 * Nhỏ hơn khoảng cách tầng vì thời gian chờ đo bằng tick và dễ lên vài chục,
 * trong khi số tầng hiếm khi quá mười. Để bằng nhau thì một job chờ 40 tick bay
 * lên cao gấp bốn lần toàn bộ chiều dài đường ống, và cảnh không đóng khung nổi.
 */
const CI_Y_PER_TICK = 0.25;

/** Chiều cao mỗi dải môi trường — trục Y của **chương CD**. */
const CD_Y_PER_BAND = 2;

export interface ScenePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CicdPlacementNode {
  readonly instance: InstanceKey;
  readonly stageId: StageId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Tầng phụ thuộc, đếm từ 0. `x = layer * LAYER_SPACING`. */
  readonly layer: number;
  /** Làn job song song, đếm từ 0. `z = lane * LANE_SPACING`. */
  readonly lane: number;
  /**
   * Dải môi trường, đếm từ 0. `0` = không phát hành vào đâu (build, test…).
   *
   * Luôn có mặt, kể cả ở chương CI, nơi nó luôn bằng 0 — một trường lúc có lúc
   * không buộc mọi chỗ đọc phải kiểm `undefined` cho một thứ không bao giờ thiếu.
   */
  readonly band: number;
}

export interface CicdPlacementEdge {
  readonly from: InstanceKey;
  readonly to: InstanceKey;
  readonly critical: boolean;
  readonly resourceEdge: boolean;
  /**
   * Đường gấp khúc, **mọi đoạn đổi đúng MỘT toạ độ**. Luôn có ≥ 2 điểm.
   *
   * Đây là dạng 3D của tính chất mà `countDiagonalSegments` gác ở tầng lưới:
   * một hàm định tuyến viết sai vẫn trả đủ số điểm và vẫn vẽ ra một đường trông
   * hợp lý, nên "3 điểm" không chứng minh được gì. Cái chứng minh được là mỗi
   * đoạn chỉ đổi một trục. `countNonAxialSegments` đo đúng điều đó.
   */
  readonly points: readonly ScenePoint[];
}

export interface CicdBounds {
  readonly min: ScenePoint;
  readonly max: ScenePoint;
}

export interface CicdPlacement {
  readonly nodes: readonly CicdPlacementNode[];
  readonly edges: readonly CicdPlacementEdge[];
  readonly bounds: CicdBounds;
  readonly layerCount: number;
  readonly laneCount: number;
  /** Số dải môi trường đang dùng, kể cả dải 0. Chương CI luôn là 1. */
  readonly bandCount: number;
}

/** Đếm số đoạn KHÔNG song song trục. Luôn phải là 0. */
export function countNonAxialSegments(points: readonly ScenePoint[]): number {
  let bad = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    let changed = 0;
    if (a.x !== b.x) changed += 1;
    if (a.y !== b.y) changed += 1;
    if (a.z !== b.z) changed += 1;
    if (changed > 1) bad += 1;
  }
  return bad;
}

/**
 * Thứ tự dải môi trường, suy TỪ HÌNH DẠNG đường ống.
 *
 * ⛔ Không có bảng `['dev','staging','prod']` nào ở đây. `EnvironmentId` là chuỗi
 * tự do của level (`contract.ts`), nên ghim ba tên đó là biến một quy ước đặt tên
 * thành luật — và một level đặt tên `canary` hay `eu-west` sẽ rơi ra ngoài trong
 * im lặng, xuống chung dải với `dev`.
 *
 * Luật: **môi trường nào xuất hiện ở tầng phụ thuộc NÔNG hơn thì nằm dưới.** Đó
 * chính là thứ tự phát hành mà người chơi đã gõ — deploy dev đứng trước deploy
 * staging trong đồ thị, nên nó nông hơn. Hoà thì so `compareKeys` để tất định.
 *
 * Dải 0 dành cho stage không phát hành vào đâu, nên artifact "chạy từ dải dưới
 * lên" (19.D.2.8) bắt đầu từ chỗ nó được dựng.
 */
function bandOrder(
  nodes: readonly StageNodeView[],
  layerOf: Readonly<Record<InstanceKey, number>>,
): Readonly<Record<EnvironmentId, number>> {
  const shallowest = idDict<number>();
  for (const node of nodes) {
    const env = node.environment;
    if (env === null) continue;
    const layer = ownValue(layerOf, node.instance) ?? 0;
    const prev = ownValue(shallowest, env);
    if (prev === undefined || layer < prev) shallowest[env] = layer;
  }

  const ordered = Object.keys(shallowest).sort((a, b) => {
    const la = ownValue(shallowest, a) ?? 0;
    const lb = ownValue(shallowest, b) ?? 0;
    return la - lb || compareKeys(a, b);
  });

  const bandOf = idDict<number>();
  ordered.forEach((env, i) => {
    bandOf[env] = i + 1;
  });
  return bandOf;
}

/** Bỏ điểm trùng liên tiếp — một đoạn dài 0 không vẽ được gì và làm hỏng phép đếm. */
function dedupe(points: readonly ScenePoint[]): readonly ScenePoint[] {
  const out: ScenePoint[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last !== undefined && last.x === p.x && last.y === p.y && last.z === p.z) continue;
    out.push(p);
  }
  return out;
}

/**
 * Đặt chỗ cho một view.
 *
 * Ba trục, **mỗi trục đúng một nghĩa** (quyết định #13 của `phase-19.md` §1):
 *
 * | Trục | Chương CI | Chương CD |
 * |---|---|---|
 * | X | tầng Sugiyama (thứ tự phụ thuộc) | như CI |
 * | Z | làn job chạy song song | như CI |
 * | Y | thời gian chờ hàng đợi | dải môi trường |
 *
 * ⛔ Một trục mang hai biến là một trục người chơi đọc sai mà không biết mình
 * đọc sai. Y của chương CI KHÔNG mang thêm môi trường; Y của chương CD KHÔNG
 * mang thêm thời gian chờ. `scene-contract.test.ts` ghim cả hai chiều.
 *
 * ## Cạnh MÁY không tham gia phân tầng
 *
 * `layoutDag` chỉ nhận cạnh PHỤ THUỘC. Một cạnh chờ-máy nói "thằng này xong thì
 * mới có chỗ cho thằng kia chạy" — nó không phải quan hệ phụ thuộc, và nhét vào
 * phép phân tầng sẽ đẩy node xuống tầng sâu hơn, tức bóp méo đúng cái trục X
 * đang biểu diễn thứ tự phụ thuộc. Cạnh máy được định tuyến SAU, trên lưới đã
 * chốt.
 */
export function placeWorkflow(view: CicdGraphView): CicdPlacement {
  const dependency = view.edges.filter((e) => !e.resourceEdge);

  const parentsOf = idDict<InstanceKey[]>();
  for (const node of view.nodes) parentsOf[node.instance] = [];
  for (const edge of dependency) {
    const list = ownValue(parentsOf, edge.to);
    if (list !== undefined) list.push(edge.from);
  }

  // ⚠ SẮP `parents`, và đây KHÔNG phải trang trí.
  //
  // `assignLanes` cho một node kế thừa chuỗi (tức làn) của `parents[0]` — luật
  // "cha thứ nhất" của git, nơi thứ tự cha MANG NGHĨA. Ở CI/CD thì không:
  // `WorkflowSpec` ghi rõ thứ tự mảng là thứ tự TRÌNH BÀY và "một bộ ghi sắp lại
  // thứ tự stage không được phép đổi kết quả". Để nguyên thứ tự cạnh đi vào thì
  // `dependsOn: [b, c]` và `dependsOn: [c, b]` ra HAI bố cục khác nhau cho cùng
  // một đồ thị — đo được: ô "đảo thứ tự node và cạnh" đỏ trên bản chưa sắp, node
  // `d` nhảy từ làn 0 sang làn 1.
  const dagNodes: DagNode[] = view.nodes.map((n) => ({
    id: n.instance,
    parents: [...(ownValue(parentsOf, n.instance) ?? [])].sort(compareKeys),
  }));

  const laid = layoutDag(dagNodes);

  const layerOf = idDict<number>();
  const laneOf = idDict<number>();
  for (const n of laid.nodes) {
    layerOf[n.id] = n.depth;
    laneOf[n.id] = n.lane;
  }

  const bandOf = view.yAxis === 'cd' ? bandOrder(view.nodes, layerOf) : idDict<number>();

  /** Y của một thực thể, theo đúng MỘT biến tuỳ chương. */
  function yOf(node: StageNodeView): number {
    if (view.yAxis === 'cd') {
      const band = node.environment === null ? 0 : (ownValue(bandOf, node.environment) ?? 0);
      return band * CD_Y_PER_BAND;
    }
    // Chương CI: thời gian chờ hàng đợi. Chưa chạy thì chưa chờ ai — nằm ở mặt
    // nền, không lơ lửng.
    if (node.readyTick === null || node.startedTick === null) return 0;
    const wait = Math.max(0, node.startedTick - node.readyTick);
    return wait * CI_Y_PER_TICK;
  }

  const yByInstance = idDict<number>();
  const bandByInstance = idDict<number>();
  const nodes: CicdPlacementNode[] = view.nodes.map((node) => {
    const layer = ownValue(layerOf, node.instance) ?? 0;
    const lane = ownValue(laneOf, node.instance) ?? 0;
    const band =
      view.yAxis === 'cd' && node.environment !== null ? (ownValue(bandOf, node.environment) ?? 0) : 0;
    const y = yOf(node);
    yByInstance[node.instance] = y;
    bandByInstance[node.instance] = band;
    return {
      instance: node.instance,
      stageId: node.stageId,
      x: layer * LAYER_SPACING,
      y,
      z: lane * LANE_SPACING,
      layer,
      lane,
      band,
    };
  });

  // ── Cạnh ──────────────────────────────────────────────────────────────────
  //
  // Định tuyến trong mặt phẳng X–Z ở độ cao của node ĐẦU, rồi một đoạn thẳng
  // đứng cuối cùng nếu hai đầu khác dải. Cách này giữ được tính "mỗi đoạn đổi
  // đúng một trục" mà vẫn đi lên được giữa các dải môi trường — chính là cú
  // promote của 19.D.2.8.
  const edges: CicdPlacementEdge[] = view.edges.map((edge) => {
    const fromLayer = ownValue(layerOf, edge.from) ?? 0;
    const fromLane = ownValue(laneOf, edge.from) ?? 0;
    const toLayer = ownValue(layerOf, edge.to) ?? 0;
    const toLane = ownValue(laneOf, edge.to) ?? 0;
    const yFrom = ownValue(yByInstance, edge.from) ?? 0;
    const yTo = ownValue(yByInstance, edge.to) ?? 0;

    // `isFirstParent` ở đây chọn CHỖ ĐẶT GÓC, không mang nghĩa git nào. Cạnh phụ
    // thuộc rẽ ra (góc ở tầng của cha) đọc khác cạnh chờ-máy gom lại (góc ở tầng
    // của con) — cùng lý lẽ tránh-đè-node của `edge-route.ts`.
    const grid: readonly LayoutPoint[] = routeEdge(
      fromLayer,
      fromLane,
      toLayer,
      toLane,
      !edge.resourceEdge,
    );

    const planar: ScenePoint[] = grid.map(([layer, lane]) => ({
      x: layer * LAYER_SPACING,
      y: yFrom,
      z: lane * LANE_SPACING,
    }));
    if (yTo !== yFrom) {
      planar.push({ x: toLayer * LAYER_SPACING, y: yTo, z: toLane * LANE_SPACING });
    }

    return {
      from: edge.from,
      to: edge.to,
      critical: edge.critical,
      resourceEdge: edge.resourceEdge,
      points: dedupe(planar),
    };
  });

  const bandCount =
    view.yAxis === 'cd' ? Math.max(1, ...nodes.map((n) => n.band + 1)) : 1;

  const bounds: CicdBounds =
    nodes.length === 0
      ? { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }
      : {
          min: {
            x: Math.min(...nodes.map((n) => n.x)),
            y: Math.min(...nodes.map((n) => n.y)),
            z: Math.min(...nodes.map((n) => n.z)),
          },
          max: {
            x: Math.max(...nodes.map((n) => n.x)),
            y: Math.max(...nodes.map((n) => n.y)),
            z: Math.max(...nodes.map((n) => n.z)),
          },
        };

  return {
    nodes,
    edges,
    bounds,
    layerCount: laid.depthCount,
    laneCount: laid.laneCount,
    bandCount,
  };
}
