/**
 * Hợp đồng DÙNG CHUNG của hai renderer game Git (17.B.3).
 *
 * Renderer SVG 2D (`../git/git-svg-scene.tsx`, đợt này) và renderer 3D (P17b)
 * nhận ĐÚNG hình dạng props này. Không một dòng nào ở đây được biết tới SVG
 * (`<path>`, `viewBox`, px) hay tới three.js (`Vector3`, material, mesh) — đó
 * là điều kiện để ô nghiệm thu AC-B có nghĩa.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AC-B ĐƯỢC BẢO ĐẢM BẰNG XÂY DỰNG, KHÔNG BẰNG LỜI HỨA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ô AC-B đòi: *cùng một `SceneProps` cho hai renderer ra cùng tập node và cạnh*.
 * Cách duy nhất để ô đó không thành một lời khai là **cả hai renderer đọc tập
 * node/cạnh từ CÙNG MỘT HÀM THUẦN** ở file này — `sceneNodes()` và
 * `sceneEdges()` — thay vì mỗi bên tự lọc `view.nodes` theo cách riêng.
 *
 * P17b KHÔNG được viết lại phép lọc đó. Nó gọi `sceneNodeIds(props)` /
 * `sceneEdgeKeys(props)`, và test AC-B so hai tập trả về từ hai renderer bằng
 * chính hai hàm này. Nếu renderer 3D vẽ theo một danh sách khác thì ô AC-B vẫn
 * xanh mà vô nghĩa — đúng thứ `rules/green-that-proves-nothing.md` cảnh báo —
 * nên hợp đồng là: **thứ được vẽ = thứ hai hàm này trả về**.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ KIỂU Ở ĐÂY LÀ SHIM CẤU TRÚC, KHÔNG PHẢI BẢN CHÉP — BÁO LEAD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `packages/games/package.json` khai `exports` chỉ MỘT subpath (`.`), và barrel
 * `packages/games/src/index.ts` (lead sở hữu) hiện **không export gì của
 * `git/`** — `grep -n "git" packages/games/src/index.ts` trả 0 dòng — cũng
 * không export `core/layout/`. Với `moduleResolution: "bundler"` thì deep
 * import `@devops-platform/games/src/git/contract.ts` bị `exports` chặn.
 *
 * Nên file này KHÔNG import `GitView` / `DagLayout`; nó khai các giao diện
 * **tối thiểu mà renderer THẬT SỰ ĐỌC**. Đây là cố ý và khác một bản chép ở
 * một điểm quyết định: nhờ subtyping cấu trúc, `GitView` thật gán được vào
 * `SceneView` chừng nào nó còn mang đủ những trường dưới đây. Trường hợp đồng
 * THÊM field ⇒ vô hại. Trường bị XOÁ hoặc ĐỔI KIỂU ⇒ đỏ ngay dòng gán, ở lượt
 * đầu tiên lead mở barrel. Một bản chép đầy đủ thì ngược lại: nó vẫn biên dịch
 * xanh sau khi hợp đồng đổi, và trôi trong im lặng.
 *
 * VIỆC CỦA LEAD, một lần, ba dòng ở barrel:
 *
 *     export type { CommitAccent, CommitNodeView, EdgeKind, FileCellView,
 *                   FileStatus, GitEdgeView, GitView, Oid, RefBadgeView }
 *       from './git/contract.ts';
 *     export type { DagLayout, DagNode, LaidOutEdge, LaidOutNode }
 *       from './core/layout/index.ts';
 *     export { layoutDag } from './core/layout/index.ts';
 *
 * Xong ba dòng đó thì bật khối `SHIM GUARD` ở `scene-props.test.ts` lên — nó
 * khẳng định `GitView` gán được vào `SceneView`, tức shim và hợp đồng khớp
 * nhau. Chừng nào khối đó còn tắt, ĐÂY là một khoản nợ có tên chứ không phải
 * một thiết kế.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HAI PHÁT HIỆN VỀ HỢP ĐỒNG — cũng cần lead xem
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **1. Oid KHÔNG đủ làm định danh node của cảnh.** Sau một lần `push`, cùng một
 *    Oid tồn tại ở CẢ HAI kho (đó chính là ý nghĩa của địa chỉ hoá theo nội
 *    dung, và là lý do `mirrorEdges` nối `from === to`). `buildView` ghép
 *    `[...localNodes, ...originNodes]`, nên `view.nodes` có thể chứa hai phần
 *    tử cùng `oid` khác `repo`. Định danh của cảnh vì vậy là
 *    `` `${repo}:${oid}` `` — xem `sceneNodeId()`.
 *
 *    Hệ quả CỨNG cho bên gọi: **không được đưa cả hai kho vào MỘT lượt
 *    `layoutDag`**. `dag-layout.ts` khử id trùng ("chọn bản có dạng serialize
 *    nhỏ nhất"), nên toàn bộ commit đã push của kho `origin` sẽ biến mất khỏi
 *    layout — im lặng, không lỗi. `buildSceneLayouts()` dưới đây gọi `layoutDag`
 *    MỘT LẦN MỖI KHO, và đó là lý do nó tồn tại.
 *
 * **2. `GitEdgeView` không mang `repo`, và danh sách cạnh có phần tử TRÙNG.**
 *    `edgesOf()` chạy riêng cho từng kho rồi hai kết quả được nối lại, nên một
 *    cạnh cha-con đã push xuất hiện HAI LẦN dưới dạng hai object bằng nhau từng
 *    trường. Không có trường nào phân biệt chúng.
 *
 *    `resolveSceneEdges()` xử theo luật khai tường minh: `remote-mirror` luôn là
 *    local → origin (hai đầu cùng Oid, khác kho); mọi loại khác nở ra MỘT cạnh
 *    cho MỖI kho có đủ cả hai đầu. Cùng một cạnh cha-con có ở hai kho thì được
 *    vẽ hai lần — ở hai vùng khác nhau — và đó đúng là thứ phải thấy trên màn
 *    hình. Trùng lặp trong đầu vào bị khử theo khoá, nên kết quả không đổi dù
 *    `buildView` nối bao nhiêu lần.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. SHIM — gương của `packages/games/src/git/contract.ts` §6
// ═══════════════════════════════════════════════════════════════════════════

/** Gương của `CommitAccent`. Sáu trạng thái, mã hoá ba kênh ở `../git/git-palette.ts`. */
export type SceneAccent =
  | 'normal'
  | 'head'
  | 'fresh'
  | 'orphaned'
  | 'duplicate'
  | 'conflicted';

/** Gương của `EdgeKind`. */
export type SceneEdgeKind = 'parent' | 'merge-parent' | 'cherry-source' | 'remote-mirror';

/** Gương của `RefBadgeView['kind']`. */
export type SceneRefKind = 'branch' | 'remote' | 'tag' | 'head';

/** Hai kho là hai khối không gian TÁCH RỜI (design §3.5). */
export type SceneRepo = 'local' | 'origin';

/** Gương của `FileStatus`. */
export type SceneFileStatus =
  | 'unchanged'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'untracked'
  | 'conflicted';

/** Gương của `CommitNodeView`. */
export interface SceneCommitNode {
  readonly oid: string;
  readonly shortOid: string;
  readonly message: string;
  readonly author: string;
  readonly parents: readonly string[];
  readonly logicalTime: number;
  readonly reachable: boolean;
  readonly repo: SceneRepo;
  readonly accent: SceneAccent;
}

/** Gương của `GitEdgeView`. */
export interface SceneEdgeInput {
  readonly from: string;
  readonly to: string;
  readonly kind: SceneEdgeKind;
}

/** Gương của `RefBadgeView`. */
export interface SceneRefBadge {
  readonly name: string;
  readonly shortName: string;
  readonly oid: string;
  readonly kind: SceneRefKind;
  readonly repo: SceneRepo;
  readonly isCurrent: boolean;
}

/** Gương của `FileCellView`. */
export interface SceneFileCell {
  readonly path: string;
  readonly zone: 'worktree' | 'index' | 'head';
  readonly status: SceneFileStatus;
}

/**
 * Phần của `GitView` mà renderer đọc.
 *
 * ⚠ CỐ Ý THIẾU `head` và `pending`. Renderer không đọc chúng: `detached` đã nói
 * đủ về HEAD cho phần vẽ, và nhãn `HEAD` đến qua `refs` (xem `refsOf()` ở
 * `view.ts` — nó đẩy một badge `kind: 'head'` khi detached). Shim hai union đó
 * chỉ để không ai dùng là dựng đúng cái bản-chép-sẽ-trôi mà khối trên cảnh báo.
 */
export interface SceneView {
  readonly nodes: readonly SceneCommitNode[];
  readonly edges: readonly SceneEdgeInput[];
  readonly refs: readonly SceneRefBadge[];
  readonly files: readonly SceneFileCell[];
  readonly detached: boolean;
  readonly hasOrigin: boolean;
  readonly logicalTime: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. SHIM — gương của `packages/games/src/core/layout/`
// ═══════════════════════════════════════════════════════════════════════════

/** Gương của `DagNode`. Đầu vào của `layoutDag`. */
export interface SceneDagNode {
  readonly id: string;
  readonly parents: readonly string[];
  readonly laneHint?: string;
}

/** Gương của `LaidOutNode`. Toạ độ Ô LƯỚI, không phải px. */
export interface SceneLaidOutNode {
  readonly id: string;
  readonly depth: number;
  readonly lane: number;
}

/** Gương của `LaidOutEdge`. `parentIndex` có ở kiểu thật, renderer không đọc. */
export interface SceneLaidOutEdge {
  readonly from: string;
  readonly to: string;
  readonly points: readonly (readonly [number, number])[];
}

/** Gương của `DagLayout`. */
export interface SceneLayout {
  readonly nodes: readonly SceneLaidOutNode[];
  readonly edges: readonly SceneLaidOutEdge[];
  readonly laneCount: number;
  readonly depthCount: number;
}

/** Chữ ký của `layoutDag`, nhận vào dưới dạng tham số — xem khối SHIM ở đầu file. */
export type LayoutDagFn = (nodes: readonly SceneDagNode[]) => SceneLayout;

/**
 * Một layout MỖI KHO. Xem phát hiện #1 ở đầu file: gộp hai kho vào một lượt
 * `layoutDag` làm mất im lặng toàn bộ commit đã push của `origin`.
 */
export interface SceneLayouts {
  readonly local: SceneLayout;
  /** `null` khi level một kho (toàn bộ chương 1). */
  readonly origin: SceneLayout | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. PROPS
// ═══════════════════════════════════════════════════════════════════════════

/** Định danh node trong cảnh: `local:ab12…` / `origin:ab12…`. */
export type SceneNodeId = string;

/** Khoá cạnh trong cảnh: `local:a->local:b#parent`. */
export type SceneEdgeKey = string;

/**
 * Trạng thái tương tác. Thuần dữ liệu + callback; không renderer nào giữ bản
 * sao riêng của `selectedId` — một nguồn duy nhất thì hai renderer đổi qua lại
 * mới không mất chỗ đang chọn.
 */
export interface SceneInteraction {
  readonly selectedId: SceneNodeId | null;
  readonly hoveredId: SceneNodeId | null;
  readonly onSelect: (id: SceneNodeId | null) => void;
  readonly onHover: (id: SceneNodeId | null) => void;
}

/** Hình dạng props mà CẢ HAI renderer nhận. */
export interface SceneProps {
  readonly view: SceneView;
  readonly layouts: SceneLayouts;
  readonly interaction: SceneInteraction;
  /**
   * Nhãn đọc ra cho cả đồ thị, tiếng Việt. Renderer 2D đưa vào `<title>`;
   * renderer 3D đưa vào `aria-label` của phần tử bọc canvas.
   */
  readonly label?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. HÀM THUẦN — nguồn duy nhất của "cái gì được vẽ"
// ═══════════════════════════════════════════════════════════════════════════

export function sceneNodeId(repo: SceneRepo, oid: string): SceneNodeId {
  return `${repo}:${oid}`;
}

export function sceneEdgeKey(from: SceneNodeId, to: SceneNodeId, kind: SceneEdgeKind): SceneEdgeKey {
  return `${from}->${to}#${kind}`;
}

/** Một node ĐÃ CÓ CHỖ ĐỨNG. Toạ độ vẫn là ô lưới. */
export interface ScenePlacedNode {
  readonly id: SceneNodeId;
  readonly node: SceneCommitNode;
  readonly depth: number;
  readonly lane: number;
}

/** Một cạnh đã phân giải về hai đầu có thật trong cảnh. */
export interface SceneResolvedEdge {
  readonly key: SceneEdgeKey;
  readonly kind: SceneEdgeKind;
  readonly from: SceneNodeId;
  readonly to: SceneNodeId;
  /** `null` với `remote-mirror` (bắc qua khoảng trống giữa hai kho). */
  readonly repo: SceneRepo | null;
}

function layoutOf(layouts: SceneLayouts, repo: SceneRepo): SceneLayout | null {
  return repo === 'local' ? layouts.local : layouts.origin;
}

/**
 * Node được vẽ = node có mặt trong `view` **VÀ** có chỗ đứng trong layout của
 * đúng kho nó.
 *
 * Giao chứ không hợp: một node thiếu toạ độ thì không đặt được ở đâu cả, và vẽ
 * nó ở gốc toạ độ là bịa ra một thông tin sai. Ngược lại một mục layout không
 * có node thì không có gì để vẽ.
 *
 * Thứ tự trả về ổn định: `(repo, depth, lane, oid)`. Renderer KHÔNG được phụ
 * thuộc thứ tự này để vẽ đúng, nhưng test AC-B so được bằng `toEqual`.
 */
export function sceneNodes(props: SceneProps): readonly ScenePlacedNode[] {
  const out: ScenePlacedNode[] = [];
  for (const repo of ['local', 'origin'] as const) {
    const layout = layoutOf(props.layouts, repo);
    if (layout === null) continue;
    const placed = new Map(layout.nodes.map((n) => [n.id, n]));
    for (const node of props.view.nodes) {
      if (node.repo !== repo) continue;
      const spot = placed.get(node.oid);
      if (spot === undefined) continue;
      out.push({ id: sceneNodeId(repo, node.oid), node, depth: spot.depth, lane: spot.lane });
    }
  }
  return out.sort(
    (a, b) =>
      a.node.repo.localeCompare(b.node.repo) ||
      a.depth - b.depth ||
      a.lane - b.lane ||
      a.node.oid.localeCompare(b.node.oid),
  );
}

/**
 * Cạnh được vẽ. Luật phân giải kho nằm ở phát hiện #2, đầu file.
 *
 * Khử trùng theo khoá: `buildView` phát cùng một cạnh cha-con hai lần khi
 * commit đã được push, và hai lần đó không phân biệt được bằng dữ liệu.
 */
export function sceneEdges(props: SceneProps): readonly SceneResolvedEdge[] {
  const drawn = new Set(sceneNodes(props).map((n) => n.id));
  const byKey = new Map<SceneEdgeKey, SceneResolvedEdge>();

  for (const edge of props.view.edges) {
    if (edge.kind === 'remote-mirror') {
      const from = sceneNodeId('local', edge.from);
      const to = sceneNodeId('origin', edge.to);
      if (!drawn.has(from) || !drawn.has(to)) continue;
      const key = sceneEdgeKey(from, to, edge.kind);
      byKey.set(key, { key, kind: edge.kind, from, to, repo: null });
      continue;
    }
    for (const repo of ['local', 'origin'] as const) {
      const from = sceneNodeId(repo, edge.from);
      const to = sceneNodeId(repo, edge.to);
      if (!drawn.has(from) || !drawn.has(to)) continue;
      const key = sceneEdgeKey(from, to, edge.kind);
      byKey.set(key, { key, kind: edge.kind, from, to, repo });
    }
  }

  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Tập node — đầu vào ô nghiệm thu AC-B. P17b gọi CHÍNH hàm này, không viết lại. */
export function sceneNodeIds(props: SceneProps): readonly SceneNodeId[] {
  return sceneNodes(props).map((n) => n.id);
}

/** Tập cạnh — đầu vào ô nghiệm thu AC-B. */
export function sceneEdgeKeys(props: SceneProps): readonly SceneEdgeKey[] {
  return sceneEdges(props).map((e) => e.key);
}

/** Nhãn ref bám vào một node cụ thể, đã sắp ổn định. */
export function refsAt(view: SceneView, repo: SceneRepo, oid: string): readonly SceneRefBadge[] {
  return view.refs
    .filter((ref) => ref.repo === repo && ref.oid === oid)
    .sort((a, b) => a.shortName.localeCompare(b.shortName));
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. CHUẨN BỊ ĐẦU VÀO CHO `layoutDag`
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Gán danh tính nhánh cho từng commit của một kho.
 *
 * `DagNode.laneHint` là đường để `main` giữ NGUYÊN một làn suốt phiên chơi —
 * đây chính là phép đo đã loại `d3-dag` (thêm một nhánh làm 4/6 commit cũ nhảy
 * làn). Làn phải mang danh tính NHÁNH, mà danh tính nhánh chỉ có ở `view.refs`,
 * nên phép gán này thuộc về tầng này chứ không thuộc `layoutDag`.
 *
 * Luật: đi theo chuỗi **cha thứ nhất** từ mỗi tip, ref nào tới trước thì giữ.
 * Duyệt ref theo `shortName` tăng dần để kết quả không phụ thuộc thứ tự mảng.
 * Cha thứ nhất chứ không phải mọi cha: cha thứ hai của một commit merge thuộc
 * về nhánh KHÁC, và kéo nó vào cùng làn là xoá mất chỗ hai nhánh gặp nhau.
 */
export function laneHints(view: SceneView, repo: SceneRepo): Readonly<Record<string, string>> {
  const parents = new Map<string, readonly string[]>();
  for (const node of view.nodes) {
    if (node.repo === repo) parents.set(node.oid, node.parents);
  }

  const hints: Record<string, string> = {};
  const tips = view.refs
    .filter((ref) => ref.repo === repo && ref.kind !== 'head')
    .sort((a, b) => a.shortName.localeCompare(b.shortName));

  for (const tip of tips) {
    let cursor: string | undefined = tip.oid;
    while (cursor !== undefined && parents.has(cursor) && hints[cursor] === undefined) {
      hints[cursor] = tip.shortName;
      cursor = parents.get(cursor)?.[0];
    }
  }
  return hints;
}

/** `SceneView` → đầu vào `layoutDag` cho ĐÚNG MỘT kho. Cạnh chỉ gồm quan hệ cha-con. */
export function toDagNodes(view: SceneView, repo: SceneRepo): readonly SceneDagNode[] {
  const hints = laneHints(view, repo);
  const present = new Set(view.nodes.filter((n) => n.repo === repo).map((n) => n.oid));
  return view.nodes
    .filter((node) => node.repo === repo)
    .map((node) => {
      const hint = hints[node.oid];
      const parents = node.parents.filter((p) => present.has(p));
      return hint === undefined ? { id: node.oid, parents } : { id: node.oid, parents, laneHint: hint };
    });
}

/**
 * Làn → tên nhánh, cho phần **lặp nhãn dọc theo làn**.
 *
 * Nghịch lý đo được của VR-Git: lặp nhãn nhánh đỡ rối hơn MỘT nhãn duy nhất ở
 * đầu làn, vì một nhãn duy nhất bắt người đọc phải nhớ "làn thứ ba là nhánh
 * nào" suốt chiều ngang màn hình. Hàm này ở đây chứ không ở renderer vì cả hai
 * renderer cần đúng một bảng làn→tên; hai bản tự suy sẽ lệch nhau ngay lần đầu
 * một làn có hai nhánh cùng đi qua.
 *
 * Làn có nhiều tên ứng viên thì lấy tên nhỏ nhất theo `localeCompare` — tuỳ
 * tiện, nhưng tuỳ tiện một cách tất định, cùng khuôn với cách `dag-layout.ts`
 * khử id trùng.
 */
export function laneLabels(
  view: SceneView,
  layout: SceneLayout,
  repo: SceneRepo,
): Readonly<Record<number, string>> {
  const hints = laneHints(view, repo);
  const byLane = new Map<number, string>();
  for (const spot of layout.nodes) {
    const name = hints[spot.id];
    if (name === undefined) continue;
    const current = byLane.get(spot.lane);
    if (current === undefined || name.localeCompare(current) < 0) byLane.set(spot.lane, name);
  }
  const out: Record<number, string> = {};
  for (const [lane, name] of byLane) out[lane] = name;
  return out;
}

/**
 * Dựng layout cho cả hai kho. **Hai lượt `layoutDag`, không một lượt** — xem
 * phát hiện #1 ở đầu file.
 *
 * Nhận `layoutDag` qua tham số vì barrel chưa mở nó. Khi lead mở, bên gọi viết
 * đúng một dòng: `buildSceneLayouts(view, layoutDag)`.
 */
export function buildSceneLayouts(view: SceneView, layoutDag: LayoutDagFn): SceneLayouts {
  return {
    local: layoutDag(toDagNodes(view, 'local')),
    origin: view.hasOrigin ? layoutDag(toDagNodes(view, 'origin')) : null,
  };
}
