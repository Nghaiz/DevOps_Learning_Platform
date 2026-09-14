/**
 * Hợp đồng tầng 3D game Git (17.K) — **toán thuần, không một dòng `three`**.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO FILE NÀY KHÔNG IMPORT `three`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ba lý do, cả ba đã có tiền lệ đắt trong repo:
 *
 *  1. **Test được ở env `node`.** `shared/scene-quality.ts` của arena giữ được
 *     điều này và nhờ đó có test thật; mọi file `scene/*.tsx` của arena thì
 *     không. Phép đặt chỗ 3D là thứ dễ sai nhất và cũng là thứ dễ test nhất —
 *     đừng chôn nó trong một component.
 *  2. **Cổng `bundle:check`.** `three` + `@react-three/fiber` + `drei` +
 *     `postprocessing` là ~631KB. P17 đã một lần rò engine sang 6 route không
 *     liên quan vì một barrel (`44f8e39`). File này được import từ test và từ
 *     mã không-3D, nên nó phải sạch `three`.
 *  3. **Hợp đồng đọc được.** Lane khác muốn biết một commit nằm ở đâu thì gọi
 *     `place3d()`, không đọc mã dựng mesh.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BA TRỤC — MỖI TRỤC MỘT NGHĨA, KHÔNG TRỤC NÀO MANG HAI NGHĨA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Đây là ràng buộc K.2, và nó là ràng buộc **ngữ nghĩa** chứ không phải thẩm mỹ:
 * một trục mang hai biến là một trục không đọc được, và người chơi sẽ đọc sai
 * mà không biết mình đọc sai.
 *
 * | Trục | Biến | Nguồn |
 * |---|---|---|
 * | **X** | thời gian logic | `ScenePlacedNode.depth` |
 * | **Z** | làn nhánh | `ScenePlacedNode.lane`, cộng khoảng trống giữa hai kho |
 * | **Y** | **độ lệch khỏi nhánh chính** | `|lane - MAIN_LANE|` |
 *
 * **X dùng chung cho cả hai kho.** Một commit đã push nằm ở CÙNG một X ở khối
 * `local` và khối `origin`. Đó là điều làm cho `push`/`fetch` đọc được: vật thể
 * bay ngang qua khoảng trống theo đúng phương Z, không chéo.
 *
 * ⚠ **Y mang đúng MỘT biến ở tầng DAG.** Ba mặt phẳng HEAD/Index/Worktree của
 * K.3 KHÔNG tranh trục Y với độ lệch nhánh: chúng là một **tầng khác** (ô file),
 * đặt ở ba dải Y nằm HẲN TRÊN vùng DAG (`PLATE_Y`), cách vùng DAG một khoảng
 * lớn hơn độ lệch tối đa có thể. `assertPlanesClearOfDag()` là cổng lúc chạy
 * cho bất biến đó — nếu một level có 40 làn nhánh thì DAG sẽ đâm lên đụng mặt
 * phẳng Index, và cổng đó đỏ thay vì để hai tầng chồng lên nhau trong im lặng.
 *
 * ⚠ **Chiều Y có nghĩa, đừng đảo.** Nhánh phụ **dâng lên** khỏi đường chính
 * (`y >= 0`). Chiều **xuống** để dành cho chuyển động "mất" — `reset --hard`
 * làm commit chìm, `reflog` kéo nó nổi lại (K.7). Nếu nhánh phụ cũng đi xuống
 * thì hai ý nghĩa trái ngược dùng chung một hướng và cả hai mất nghĩa.
 */

import type {
  SceneAccent,
  SceneFileCell,
  SceneProps,
  SceneRepo,
  ScenePlacedNode,
  SceneResolvedEdge,
} from '../../shared/scene-props.ts';
import { sceneEdges, sceneNodes } from '../../shared/scene-props.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Hằng số hình học
// ═══════════════════════════════════════════════════════════════════════════

/** Làn của nhánh chính. `lane-assign.ts` luôn đặt nhánh chính ở làn 0. */
export const MAIN_LANE = 0;

/** Khoảng cách giữa hai mốc thời gian logic liền nhau. */
export const X_STEP = 2.4;

/** Khoảng cách giữa hai làn nhánh liền nhau. */
export const Z_STEP = 2.0;

/** Độ dâng mỗi bậc lệch khỏi nhánh chính. */
export const Y_STEP = 0.55;

/**
 * Số LÀN trống chen giữa khối `local` và khối `origin` (K.8).
 *
 * Đây là "khoảng trống" mà push/fetch bay qua. Nó phải đủ rộng để đọc ra là hai
 * khối tách rời chứ không phải một đồ thị có một chỗ thưa — đo bằng mắt trên
 * level G20 (kho đôi đông nhất): 4 làn là ngưỡng dưới, 6 thì thừa chỗ.
 */
export const REPO_LANE_GAP = 5;

/**
 * Ba mặt phẳng ô file (K.3), theo Y.
 *
 * Thứ tự từ dưới lên: HEAD (đã cam kết, sâu nhất) → Index (đã stage) → Worktree
 * (đang sửa, gần người chơi nhất). Đây là thứ tự **thời gian ngược của dòng
 * chảy git**: thay đổi đi từ Worktree → Index → HEAD, nên đặt Worktree trên
 * cùng làm cho `git add` là một động tác đi XUỐNG, và `checkout` đi LÊN.
 */
export const PLATE_Y = {
  head: 9.0,
  index: 11.5,
  worktree: 14.0,
} as const satisfies Record<SceneFileCell['zone'], number>;

/**
 * Phần một ô file được phép **nhô XUỐNG** dưới dải Y của mặt phẳng nó.
 *
 * Không phải 0: ô `deleted` chìm xuống để trạng thái "đã xoá" đọc được bằng
 * hình học chứ không chỉ bằng màu (đo được 0.29 ở bản của lane D). `PLATE_FLOOR`
 * trừ đi hằng số này, nếu không thì biên an toàn khai báo rộng hơn biên thật
 * đúng một bậc làn — và một cổng nới tay hơn nó tự nói là loại cổng tệ nhất:
 * nó vẫn xanh ở đúng lúc thứ nó gác bắt đầu hỏng.
 */
export const PLATE_OVERHANG = 0.5;

/** Y thấp nhất mà một mặt phẳng ô file chiếm, ĐÃ trừ phần nhô xuống. */
export const PLATE_FLOOR = PLATE_Y.head - PLATE_OVERHANG;

/** Khoảng cách giữa hai ô file liền nhau trên cùng một mặt phẳng. */
export const PLATE_CELL_STEP = 1.6;

/**
 * Z của cả ba mặt phẳng ô file.
 *
 * Âm — tức là ba mặt phẳng nằm ở phía TRƯỚC khối `local` theo trục làn, không
 * lơ lửng giữa hai kho. Vùng file là chuyện của kho cục bộ; `origin` không có
 * worktree, và đặt nó ở giữa sẽ gợi ý sai rằng nó thuộc về cả hai.
 */
export const PLATE_Z = -2 * Z_STEP;

/** Bán kính ô commit — lane hình học và lane bắt tia dùng CHUNG con số này. */
export const NODE_RADIUS = 0.62;

// ═══════════════════════════════════════════════════════════════════════════
// Kiểu
// ═══════════════════════════════════════════════════════════════════════════

/** Toạ độ 3D. Tuple chứ không phải `Vector3` — file này không biết `three`. */
export type Vec3 = readonly [number, number, number];

/** Một commit đã có chỗ đứng trong không gian. */
export interface Placed3D {
  /** `sceneNodeId(repo, oid)`. Khoá SSOT, dùng cho cả bắt tia lẫn AC-B. */
  readonly id: string;
  /**
   * Oid **thô**, chưa gắn kho.
   *
   * Mang sẵn ở đây vì `refsAt(view, repo, oid)` và `laneHints()` đều khoá theo
   * oid thô, còn `id` là `repo:oid`. Thiếu trường này thì **mỗi** lane phải tự
   * dựng một bảng tra từ `view.nodes` — hoặc, tệ hơn, cắt chuỗi `id`, thứ chạy
   * đúng cho tới đúng ngày định dạng `id` đổi rồi hỏng **im lặng** ở mọi chỗ
   * cùng lúc. Lane D đã phải vòng qua chỗ này; thêm một trường rẻ hơn nhiều so
   * với bốn bản sao của cùng một bảng tra.
   */
  readonly oid: string;
  readonly repo: SceneRepo;
  readonly accent: SceneAccent;
  readonly shortOid: string;
  readonly message: string;
  readonly position: Vec3;
  /** Bậc lệch khỏi nhánh chính, đã lấy trị tuyệt đối. 0 = trên nhánh chính. */
  readonly deviation: number;
  readonly depth: number;
  readonly lane: number;
}

/** Một cạnh đã có hai đầu trong không gian. */
export interface Routed3D {
  readonly key: SceneEdgeKey3D;
  readonly kind: SceneResolvedEdge['kind'];
  readonly from: Vec3;
  readonly to: Vec3;
  /** `true` với `remote-mirror` — cạnh bắc qua khoảng trống giữa hai kho. */
  readonly crossesGap: boolean;
}

export type SceneEdgeKey3D = string;

/** Một ô file trên một trong ba mặt phẳng. */
export interface Plate3D {
  readonly key: string;
  readonly path: string;
  readonly zone: SceneFileCell['zone'];
  readonly status: SceneFileCell['status'];
  readonly position: Vec3;
}

/**
 * Hình dạng props của MỌI tầng 3D (instance commit, cạnh, nhãn, mặt phẳng file,
 * chuyển động). Một hình dạng duy nhất cho tất cả, cố định trước khi các tầng
 * được viết song song.
 *
 * ⚠ Không tầng nào được tự gọi `sceneNodes()` / `place3d()` lần nữa. Gốc hợp
 * thành gọi `place3d()` ĐÚNG MỘT LẦN và truyền `placement` xuống. Hai lần gọi
 * là hai mảng khác định danh tham chiếu, và mọi `useMemo` phía dưới mất tác
 * dụng trong im lặng — trang này vẽ lại sau mỗi lệnh người chơi gõ.
 */
export interface Scene3DLayerProps {
  readonly placement: Scene3DPlacement;
  readonly view: SceneProps['view'];
  readonly interaction: SceneProps['interaction'];
  /**
   * Layout gốc ô lưới, đi kèm nguyên vẹn.
   *
   * Cần vì `laneLabels()` — SSOT của bảng làn→tên, **dùng chung với renderer
   * 2D** — nhận một `SceneLayout`, không nhận `Placed3D[]`. Thiếu trường này
   * thì tầng 3D phải dựng lại hình dạng `SceneLayout` từ `placement.nodes`
   * (lane D đã phải làm vậy), hoặc tự suy lại phép hoà tên làn — mà tự suy lại
   * là đúng thứ docblock của `laneLabels()` cảnh báo sẽ lệch khỏi bản 2D. Hai
   * renderer gọi hai tên khác nhau cho cùng một làn là lỗi không cổng nào bắt.
   */
  readonly layouts: SceneProps['layouts'];
}

/** Kết quả đặt chỗ trọn cảnh. */
export interface Scene3DPlacement {
  readonly nodes: readonly Placed3D[];
  readonly edges: readonly Routed3D[];
  readonly plates: readonly Plate3D[];
  /** Số làn của khối `local`. Khối `origin` bắt đầu sau nó + `REPO_LANE_GAP`. */
  readonly localLaneCount: number;
  /** Hộp bao của toàn cảnh — camera dùng để khung-toàn-bộ. */
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 };
}

// ═══════════════════════════════════════════════════════════════════════════
// Đặt chỗ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Z của một làn, đã tính khoảng trống giữa hai kho.
 *
 * Tách ra thành hàm riêng vì BỐN chỗ cần nó (node, cạnh, nhãn làn, khối kho) và
 * ba trong bốn chỗ đó nằm ở lane khác. Một bản sao công thức lệch nửa bước là
 * loại lỗi không ai thấy cho tới khi nhìn ảnh chụp.
 */
export function laneZ(repo: SceneRepo, lane: number, localLaneCount: number): number {
  const offset = repo === 'origin' ? localLaneCount + REPO_LANE_GAP : 0;
  return (offset + lane) * Z_STEP;
}

/** Y của một commit theo bậc lệch khỏi nhánh chính. Luôn `>= 0`. */
export function deviationY(lane: number): number {
  return Math.abs(lane - MAIN_LANE) * Y_STEP;
}

/**
 * Cổng lúc chạy cho bất biến "DAG không đụng mặt phẳng ô file".
 *
 * Trả về `null` khi sạch, hoặc một câu tiếng Việt nêu ĐÚNG con số vi phạm khi
 * không. Gọi ở chỗ dựng cảnh; đừng nuốt kết quả.
 *
 * ⚠ Đây KHÔNG phải một `console.warn` trang trí. Hai tầng chồng lên nhau trông
 * giống một bug render ngẫu nhiên và sẽ tốn một buổi để lần ra.
 */
export function assertPlanesClearOfDag(maxDeviation: number): string | null {
  const top = maxDeviation * Y_STEP + NODE_RADIUS;
  if (top < PLATE_FLOOR) return null;
  return (
    `Vùng DAG cao tới y=${top.toFixed(2)} nhưng mặt phẳng HEAD nằm ở y=${String(PLATE_FLOOR)}. ` +
    `Level này có độ lệch nhánh ${String(maxDeviation)} bậc — nâng PLATE_Y hoặc giảm Y_STEP.`
  );
}

function plateKey(cell: SceneFileCell): string {
  return `${cell.zone}:${cell.path}`;
}

/**
 * Toàn bộ phép đặt chỗ 3D, từ `SceneProps` sang toạ độ.
 *
 * ⚠ **Node và cạnh đến từ `sceneNodes()` / `sceneEdges()`, KHÔNG từ `view` thô.**
 * Hợp đồng ở `shared/scene-props.ts` nói thẳng: thứ được vẽ = thứ hai hàm đó trả
 * về. Lọc lại theo cách riêng sẽ làm ô AC-B xanh mà chẳng chứng minh gì —
 * `rules/green-that-proves-nothing.md`.
 *
 * Hàm thuần và tất định: cùng `SceneProps` ⇒ cùng kết quả, cùng thứ tự.
 */
export function place3d(props: SceneProps): Scene3DPlacement {
  const placed = sceneNodes(props);
  const localLaneCount = props.layouts.local.laneCount;

  const nodes: Placed3D[] = placed.map((p: ScenePlacedNode) => {
    const deviation = Math.abs(p.lane - MAIN_LANE);
    return {
      id: p.id,
      oid: p.node.oid,
      repo: p.node.repo,
      accent: p.node.accent,
      shortOid: p.node.shortOid,
      message: p.node.message,
      position: [
        p.depth * X_STEP,
        deviationY(p.lane),
        laneZ(p.node.repo, p.lane, localLaneCount),
      ] as Vec3,
      deviation,
      depth: p.depth,
      lane: p.lane,
    };
  });

  const at = new Map(nodes.map((n) => [n.id, n.position]));

  const edges: Routed3D[] = [];
  for (const e of sceneEdges(props)) {
    const from = at.get(e.from);
    const to = at.get(e.to);
    // `sceneEdges` đã đảm bảo hai đầu có mặt; giữ lại phép kiểm vì nó rẻ và vì
    // một `undefined` lọt xuống đây thành `NaN` trong buffer geometry, mà `NaN`
    // trong một BufferAttribute làm three vứt TOÀN BỘ draw call đó — im lặng.
    if (from === undefined || to === undefined) continue;
    edges.push({ key: e.key, kind: e.kind, from, to, crossesGap: e.kind === 'remote-mirror' });
  }

  /*
   * Ô file: mỗi vùng một HÀNG riêng chạy dọc trục X, đặt ở dải Y của vùng đó.
   *
   * ⚠ **Cột khoá theo ĐƯỜNG DẪN, không theo thứ tự xuất hiện.** Cả điểm của ba
   * mặt phẳng chồng lớp (K.3) là nhìn thấy MỘT file đi từ Worktree xuống Index
   * khi `git add` — mà muốn thấy được thì `README.md` phải đứng ở cùng một X
   * trên cả ba mặt phẳng. Đánh số theo thứ tự duyệt sẽ hỏng ngay khi một file
   * có mặt ở Worktree mà chưa có ở Index: mọi file phía sau nó lệch một cột, và
   * hình ảnh "rơi xuống" thành "rơi chéo sang bên".
   */
  const column = new Map<string, number>();
  for (const path of [...new Set(props.view.files.map((f) => f.path))].sort()) {
    column.set(path, column.size);
  }
  const plates: Plate3D[] = [...props.view.files]
    .sort((a, b) => a.zone.localeCompare(b.zone) || a.path.localeCompare(b.path))
    .map((cell) => ({
      key: plateKey(cell),
      path: cell.path,
      zone: cell.zone,
      status: cell.status,
      position: [
        (column.get(cell.path) ?? 0) * PLATE_CELL_STEP,
        PLATE_Y[cell.zone],
        PLATE_Z,
      ] as Vec3,
    }));

  return {
    nodes,
    edges,
    plates,
    localLaneCount,
    bounds: boundsOf(nodes),
  };
}

function boundsOf(nodes: readonly Placed3D[]): Scene3DPlacement['bounds'] {
  if (nodes.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const n of nodes) {
    const [x, y, z] = n.position;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return {
    min: [minX - NODE_RADIUS, minY - NODE_RADIUS, minZ - NODE_RADIUS],
    max: [maxX + NODE_RADIUS, maxY + NODE_RADIUS, maxZ + NODE_RADIUS],
  };
}

/** Độ lệch nhánh lớn nhất trong cảnh — đầu vào của `assertPlanesClearOfDag`. */
export function maxDeviationOf(nodes: readonly Placed3D[]): number {
  let max = 0;
  for (const n of nodes) if (n.deviation > max) max = n.deviation;
  return max;
}
