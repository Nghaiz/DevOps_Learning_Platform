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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MÓC ĐO CHO E2E — pin ở đây, không để mỗi lane tự đặt tên
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ba ô nghiệm thu đo bằng DOM và không ô nào đo được nếu ba lane đặt ba kiểu
 * tên: AC-D1 (số node vẽ ra = số THỰC THỂ), AC-D3 (đường 2D dùng được, có đối
 * chứng dương), AC-D7 (sân chơi toàn màn hình).
 *
 * ⛔ Đây là hợp đồng, không phải gợi ý. Lane nào đổi tên là ô e2e của lead đỏ,
 * hoặc tệ hơn: nó tìm 0 phần tử rồi ô đó XANH vì đếm 0 === 0.
 */
export const CICD_SCENE_TESTIDS = {
  /** Cảnh 2D — phần tử `<svg>` gốc. */
  scene2d: 'cicd-scene-2d',
  /** Cảnh 3D — phần tử bọc canvas. */
  scene3d: 'cicd-scene-3d',
  /** Sân chơi (vùng chứa cảnh). AC-D7 đo `boundingBox()` của ĐÚNG phần tử này. */
  field: 'cicd-field',
  /** Bảng ba trục. AC 19.E.4: ba số hiện CÙNG LÚC, không sau nút. */
  axesPanel: 'cicd-axes',
} as const;

/**
 * Thuộc tính `data-*` mà mỗi node/cạnh phải mang, ở CẢ HAI renderer.
 *
 * Node: `data-cicd-node` = `InstanceKey`, cộng `data-cicd-state` = `StageRunState`.
 * Cạnh: `data-cicd-edge` = khoá `from->to`, cộng `data-cicd-critical` = `"true"`
 * khi cạnh nằm trên đường găng.
 *
 * Dùng `InstanceKey` chứ KHÔNG `stageId`: một level có `fanOut` sinh nhiều thực
 * thể cùng `stageId`, và một bộ đếm theo `stageId` sẽ đếm 1 ở chỗ đáng lẽ phải
 * là 3 — đúng con bug mà AC-D1 tồn tại để bắt.
 */
export const CICD_NODE_ATTR = 'data-cicd-node';
export const CICD_NODE_STATE_ATTR = 'data-cicd-state';
export const CICD_EDGE_ATTR = 'data-cicd-edge';
export const CICD_EDGE_CRITICAL_ATTR = 'data-cicd-critical';

/**
 * ⛔ **Bộ đếm trên GỐC cảnh — bắt buộc ở CẢ HAI renderer.**
 *
 * Đây không phải thứ thừa bên cạnh `[data-cicd-node]`, và lý do là một cái bẫy
 * đã suýt lọt: **cảnh 3D vẽ trên canvas nên KHÔNG có phần tử DOM cho từng
 * node.** Một ô e2e đếm `[data-cicd-node]` sẽ trả **0** ở chế độ 3D — và vì
 * AC-D1 so "số node vẽ ra" với một con số kỳ vọng, ô đó **XANH khi cả hai vế
 * cùng bằng 0** nếu cảnh không dựng được gì. Nó chỉ có thể báo động giả, không
 * bao giờ báo đúng.
 *
 * Nên gốc cảnh của CẢ HAI renderer mang `data-cicd-node-count` và
 * `data-cicd-edge-count`, lấy thẳng từ `cicdSceneNodes(props).length` /
 * `cicdSceneEdges(props).length`. Ô e2e đọc bộ đếm này, rồi ở 2D đối chiếu thêm
 * với số phần tử `[data-cicd-node]` thật — hai nguồn phải khớp.
 *
 * ⚠ Lấy từ đúng hai hàm đó, KHÔNG từ `view.nodes.length`: hai con số có thể
 * khác nhau (xem `cicdSceneNodes` — nó là phép GIAO), và bộ đếm phải nói về thứ
 * THẬT SỰ được vẽ, không phải thứ đáng lẽ được vẽ.
 */
export const CICD_NODE_COUNT_ATTR = 'data-cicd-node-count';
export const CICD_EDGE_COUNT_ATTR = 'data-cicd-edge-count';

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
