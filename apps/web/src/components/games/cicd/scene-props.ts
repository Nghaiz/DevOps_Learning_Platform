/**
 * Hợp đồng props DÙNG CHUNG của hai renderer game CI/CD (19.D).
 *
 * `scene2d/cicd-svg-scene.tsx` (lane-2d) và `scene3d/` (lane-3d) nhận ĐÚNG hình
 * dạng này. Không một dòng nào ở đây được biết tới SVG (`<path>`, `viewBox`, px)
 * hay tới three.js (`Vector3`, material, mesh) — đó là điều kiện để AC-D2 có
 * nghĩa.
 *
 * ⛔ **File này do LEAD sở hữu.** Không lane nào sửa. Thấy thiếu thứ cần thì
 * dừng việc đó, ghi đề xuất vào báo cáo cuối, làm việc kế tiếp.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AC-D2 ĐƯỢC BẢO ĐẢM BẰNG XÂY DỰNG, KHÔNG BẰNG LỜI HỨA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AC-D2 đòi: *hai renderer vẽ CÙNG tập node và cạnh*. Cách duy nhất để ô đó
 * không thành lời khai là **cả hai renderer lấy tập được vẽ từ CÙNG MỘT HÀM
 * THUẦN** ở đây — `cicdSceneNodes()` / `cicdSceneEdges()` — thay vì mỗi bên tự
 * lọc `view.nodes` theo cách riêng.
 *
 * Nếu lane-3d vẽ theo một danh sách khác thì AC-D2 vẫn xanh mà vô nghĩa, đúng
 * thứ `rules/green-that-proves-nothing.md` cảnh báo. Hợp đồng là: **thứ được vẽ
 * = thứ hai hàm này trả về.** Khuôn này chép từ `shared/scene-props.ts` của game
 * Git (17.B.3), nơi nó đã đứng qua một chặng.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KHÔNG CÓ SHIM — khác game Git
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `shared/scene-props.ts` phải dựng một tầng gương vì barrel `packages/games`
 * lúc đó không export gì của `git/`. Ở đây thì có: `CicdGraphView`,
 * `CicdPlacement` và cả `STATE_ENCODING` đã mở ra ngoài trong `48d8d42`. Nên
 * file này import THẲNG kiểu thật — một bản chép sẽ trôi trong im lặng, còn
 * import thẳng thì đổi hợp đồng là đỏ ngay ở đây.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 2D CHIẾU HAI TRỤC NÀO — quyết định của lead, 2026-09-17
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Phép đặt chỗ trả toạ độ BA chiều; một cảnh 2D chỉ vẽ được hai. Chiếu theo
 * chương:
 *
 * | Chương | 2D vẽ | Trục bị gập |
 * |---|---|---|
 * | CI (`yAxis: 'ci'`) | X ngang, **Z** dọc (làn job song song) | Y (thời gian chờ) → mã hoá bằng ĐỘ ĐẬM/nhãn, không bằng vị trí |
 * | CD (`yAxis: 'cd'`) | X ngang, **Y** dọc (dải môi trường) | Z (làn) → đẩy thành độ lệch nhỏ trong cùng dải |
 *
 * Đọc thẳng từ kế hoạch: D.2.3 nói cạnh đi "theo làn" (Z) và D.2.8 nói chương CD
 * lấy Y làm ba dải môi trường. AC-D2 so TẬP chứ không so pixel, nên hai renderer
 * chiếu khác nhau vẫn hợp lệ — `sceneAxes()` dưới đây là nơi DUY NHẤT phát biểu
 * phép chiếu đó, để lane-2d không phải tự đoán ở mỗi component.
 */

import type {
  CicdGraphView,
  CicdPlacement,
  CicdPlacementEdge,
  CicdPlacementNode,
  DagEdgeView,
  InstanceKey,
  StageNodeView,
} from '@devops-platform/games';

/** Khoá một cạnh trong cảnh: `from->to`. */
export type CicdSceneEdgeKey = string;

export function cicdEdgeKey(from: InstanceKey, to: InstanceKey): CicdSceneEdgeKey {
  return `${from}->${to}`;
}

/**
 * Trạng thái tương tác. Thuần dữ liệu + callback; **không renderer nào giữ bản
 * sao riêng** của `selectedId` — một nguồn duy nhất thì đổi qua lại giữa 2D và
 * 3D mới không mất chỗ đang chọn.
 */
export interface CicdSceneInteraction {
  readonly selectedId: InstanceKey | null;
  readonly hoveredId: InstanceKey | null;
  readonly onSelect: (id: InstanceKey | null) => void;
  readonly onHover: (id: InstanceKey | null) => void;
  /** Mở drill-in các bước bên trong một job (D.2.7). */
  readonly onDrillIn?: (id: InstanceKey) => void;
}

/** Hình dạng props mà CẢ HAI renderer nhận. */
export interface CicdSceneProps {
  readonly view: CicdGraphView;
  readonly placement: CicdPlacement;
  readonly interaction: CicdSceneInteraction;
  /**
   * Nhãn đọc ra cho cả đồ thị, tiếng Việt. 2D đưa vào `<title>` của `<svg>`;
   * 3D đưa vào `aria-label` của phần tử bọc canvas — canvas WebGL là một ô đen
   * với trình đọc màn hình.
   */
  readonly label?: string;
}

/** Một node ĐÃ CÓ CHỖ ĐỨNG: dữ liệu của view ghép với hình học của placement. */
export interface CicdPlacedNode {
  readonly id: InstanceKey;
  readonly node: StageNodeView;
  readonly spot: CicdPlacementNode;
}

/** Một cạnh đã phân giải về hai đầu CÓ THẬT trong cảnh. */
export interface CicdResolvedEdge {
  readonly key: CicdSceneEdgeKey;
  readonly edge: DagEdgeView;
  readonly spot: CicdPlacementEdge;
}

/**
 * Node được vẽ = node có trong `view` **VÀ** có chỗ đứng trong `placement`.
 *
 * Giao chứ không hợp, cùng lý lẽ với game Git: một node thiếu toạ độ thì không
 * đặt được ở đâu, và vẽ nó ở gốc toạ độ là bịa ra thông tin sai; ngược lại một
 * mục placement không có node thì không có gì để vẽ.
 *
 * Thực tế `placeWorkflow(view)` luôn sinh đúng một chỗ cho mỗi `view.nodes`, nên
 * phép giao này hôm nay không loại gì. Nó vẫn ở đây vì bên gọi có thể truyền một
 * `placement` dựng từ một `view` KHÁC (ví dụ giữ lại placement của lượt chạy
 * trước trong lúc chuyển cảnh) — và lúc đó vẽ theo hợp sẽ nổ ở renderer.
 *
 * Thứ tự trả về ổn định theo `(x, z, y, id)`: renderer KHÔNG được phụ thuộc thứ
 * tự này để vẽ đúng, nhưng test AC-D2 so được bằng `toEqual`.
 */
export function cicdSceneNodes(props: CicdSceneProps): readonly CicdPlacedNode[] {
  const spots = new Map(props.placement.nodes.map((n) => [n.instance, n]));
  const out: CicdPlacedNode[] = [];
  for (const node of props.view.nodes) {
    const spot = spots.get(node.instance);
    if (spot === undefined) continue;
    out.push({ id: node.instance, node, spot });
  }
  return out.sort(
    (a, b) =>
      a.spot.x - b.spot.x ||
      a.spot.z - b.spot.z ||
      a.spot.y - b.spot.y ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Cạnh được vẽ. Hai đầu phải nằm trong tập node được vẽ. */
export function cicdSceneEdges(props: CicdSceneProps): readonly CicdResolvedEdge[] {
  const drawn = new Set(cicdSceneNodes(props).map((n) => n.id));
  const spots = new Map(
    props.placement.edges.map((e) => [cicdEdgeKey(e.from, e.to), e] as const),
  );

  const out: CicdResolvedEdge[] = [];
  for (const edge of props.view.edges) {
    if (!drawn.has(edge.from) || !drawn.has(edge.to)) continue;
    const key = cicdEdgeKey(edge.from, edge.to);
    const spot = spots.get(key);
    if (spot === undefined) continue;
    out.push({ key, edge, spot });
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Tập node — đầu vào ô AC-D2. Lane-3d gọi CHÍNH hàm này, không viết lại. */
export function cicdSceneNodeIds(props: CicdSceneProps): readonly InstanceKey[] {
  return cicdSceneNodes(props).map((n) => n.id);
}

/** Tập cạnh — đầu vào ô AC-D2. */
export function cicdSceneEdgeKeys(props: CicdSceneProps): readonly CicdSceneEdgeKey[] {
  return cicdSceneEdges(props).map((e) => e.key);
}

/**
 * Phép chiếu 3D → 2D, phát biểu ĐÚNG MỘT LẦN cho cả lane-2d.
 *
 * Trả về tên hai trục mà cảnh 2D dùng làm ngang/dọc, cộng trục bị gập. Bảng lý
 * lẽ ở đầu file.
 */
export interface SceneAxes {
  readonly horizontal: 'x';
  readonly vertical: 'y' | 'z';
  /** Trục không vẽ bằng vị trí — phải mã hoá bằng kênh khác, hoặc nó biến mất. */
  readonly folded: 'y' | 'z';
}

export function sceneAxes(yAxis: CicdGraphView['yAxis']): SceneAxes {
  return yAxis === 'cd'
    ? { horizontal: 'x', vertical: 'y', folded: 'z' }
    : { horizontal: 'x', vertical: 'z', folded: 'y' };
}

/** Toạ độ 2D của một điểm cảnh, theo phép chiếu của chương. */
export function project2d(
  point: { readonly x: number; readonly y: number; readonly z: number },
  axes: SceneAxes,
): readonly [number, number] {
  return [point.x, axes.vertical === 'y' ? point.y : point.z];
}
