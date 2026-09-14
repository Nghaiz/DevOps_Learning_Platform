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
 * ⚠ **Điều đó KHÔNG được bảo đảm bằng xây dựng** — đừng đọc câu trên như một
 * bảo đảm. `depth` đến từ hai lượt `layoutDag` độc lập, và chúng chỉ khớp khi
 * mỗi tập node đóng-với-tổ-tiên. `Scene3DPlacement.depthDisagreement` **đếm**
 * chỗ vỡ; xem `depthDisagreementOf()` để biết vì sao phải đếm thay vì khai.
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

/**
 * Nửa cạnh hộp bao ô commit ở cỡ gốc — lane hình học và lane bắt tia dùng CHUNG
 * con số này.
 *
 * "Nửa cạnh hộp bao", **không phải bán kính cầu**: mọi hình khối của
 * `accent-3d.ts` dựng ở cỡ đơn vị rồi phóng lên `2 * NODE_RADIUS * scale`.
 */
export const NODE_RADIUS = 0.62;

/**
 * Trần hệ số phóng mà một accent được phép dùng.
 *
 * Tồn tại vì một lý do đo được: `ACCENT_3D` phóng `head` lên **1.18** để nó nổi
 * hơn các accent khác, nên ô commit cao nhất **không** cao `NODE_RADIUS` mà cao
 * `NODE_RADIUS * 1.18`. `assertPlanesClearOfDag()` từng tính bằng `NODE_RADIUS`
 * trần trụi, tức **lạc quan 18%** — nó trả `null` trong khi DAG đã chạm mặt
 * phẳng HEAD. Một cổng nới tay hơn thứ nó gác vẫn xanh đúng vào lúc bắt đầu
 * hỏng, và đó là kiểu hỏng tệ nhất (`rules/green-that-proves-nothing.md`).
 *
 * Hợp đồng khai **trần**; `accent-3d.ts` phải nằm dưới nó. Đặt 1.25 chứ không
 * đặt đúng 1.18 để một accent mới có chỗ mà không phải sửa hợp đồng — nhưng
 * vượt 1.25 thì phải sửa ở đây, có chủ ý, chứ không âm thầm nới cổng.
 */
export const MAX_NODE_SCALE = 1.25;

/** Nửa cao thật lớn nhất mà một ô commit có thể chiếm. */
export const MAX_NODE_HALF_EXTENT = NODE_RADIUS * MAX_NODE_SCALE;

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
  /**
   * Id hai đầu (`sceneNodeId(repo, oid)`) — **cùng khoá với `Placed3D.id`**.
   *
   * Mang sẵn vì nếu không, tầng cạnh chỉ có `key` (một chuỗi tổng hợp dạng
   * `local:a->local:b#parent`) và buộc phải **cắt chuỗi** để biết cạnh nào chạm
   * commit đang chọn — đúng cái bẫy mà `Placed3D.oid` được thêm để chữa, chỉ
   * dịch xuống một tầng. Lane C báo, và nó đang chặn một việc thật: làm mờ cạnh
   * không liên quan khi người chơi chọn một commit.
   */
  readonly fromId: string;
  readonly toId: string;
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
  /** Hộp bao của toàn cảnh — node VÀ ba mặt phẳng ô file. Camera khung-toàn-bộ đọc nó. */
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 };
  /**
   * Số commit có mặt ở **cả hai kho** mà `depth` không khớp. `0` là lành.
   *
   * Khác 0 nghĩa là bất biến "X dùng chung cho cả hai kho" đã vỡ, và cạnh
   * `remote-mirror` sẽ đi chéo thay vì thẳng theo Z. Gốc hợp thành phải phát nó
   * ra cảnh báo dev — đừng nuốt. Xem `depthDisagreementOf()` để biết vì sao đây
   * là một phép đo chứ không phải một dòng chú thích.
   */
  readonly depthDisagreement: number;
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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `extraLift` — THỨ BA LANE ĐÃ TỰ VÁ RIÊNG TRƯỚC KHI THAM SỐ NÀY TỒN TẠI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hàm này chỉ đo độ lệch nhánh của **node**, nhưng tên nó hứa nhiều hơn thế. Nó
 * mù với mọi thứ khác nhô lên: cung của cạnh `remote-mirror`, nhãn nổi trên
 * node, và vòm của chuyển động `reflog`.
 *
 * Và đó không phải một suy đoán: **ba lane độc lập đâm vào đúng chỗ này và mỗi
 * lane tự vá cục bộ** — `edge-route-3d.ts` chặn trần cung, `label-priority.test.ts`
 * ghim khe hở, `motion-script.ts` tự giới hạn `arcLift()`. Ba bản vá riêng cho
 * một khe hở là dấu hiệu cổng đặt sai tầng, không phải dấu hiệu ba lane bất cẩn.
 *
 * `extraLift` là chỗ đúng cho phần nhô thêm đó: phần cao nhất mà **bất cứ thứ
 * gì khác** dựng lên trên đỉnh node. Mặc định `0` KHÔNG phải một fallback im
 * lặng — nó là câu trả lời đúng cho câu hỏi hẹp "chỉ riêng node có chạm không",
 * và những chỗ hỏi đúng câu hẹp đó vẫn gọi một tham số như trước.
 */
export function assertPlanesClearOfDag(maxDeviation: number, extraLift = 0): string | null {
  const top = maxDeviation * Y_STEP + MAX_NODE_HALF_EXTENT + extraLift;
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
    edges.push({
      key: e.key,
      kind: e.kind,
      fromId: e.from,
      toId: e.to,
      from,
      to,
      crossesGap: e.kind === 'remote-mirror',
    });
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
  /*
   * ⚠ MỘT phép so chuỗi cho cả hai chỗ, không phải hai.
   *
   * Bản đầu đánh số cột bằng `.sort()` trần (thứ tự UTF-16) rồi sắp mảng plate
   * bằng `localeCompare` — hai phép so **khác nhau** trên cùng một tập đường
   * dẫn. Với đường dẫn ASCII chúng trùng nhau nên không ai thấy gì; với đường
   * dẫn tiếng Việt thì không (`localeCompare` xếp `đ` sau `d`, UTF-16 xếp nó
   * sau `z`). Lane E tìm ra. Cùng một họ lỗi với chuyện Postgres và JS bất đồng
   * về thứ tự tiếng Việt — và cùng một cách chữa: chọn MỘT phép so, gọi nó ở
   * mọi chỗ.
   */
  const byPath = (a: string, b: string): number => a.localeCompare(b, 'vi');

  const column = new Map<string, number>();
  for (const path of [...new Set(props.view.files.map((f) => f.path))].sort(byPath)) {
    column.set(path, column.size);
  }
  const plates: Plate3D[] = [...props.view.files]
    .sort((a, b) => a.zone.localeCompare(b.zone) || byPath(a.path, b.path))
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
    bounds: boundsOf(nodes, plates),
    depthDisagreement: depthDisagreementOf(nodes),
  };
}

/**
 * Hộp bao của **toàn cảnh** — node VÀ ba mặt phẳng ô file.
 *
 * ⚠ Bản đầu chỉ duyệt `nodes`, và đó là một lỗi có hậu quả nhìn thấy được:
 * `assertPlanesClearOfDag()` bảo đảm vùng DAG luôn nằm **dưới** `PLATE_FLOOR`,
 * nên ba mặt phẳng ô file nằm **hoàn toàn ngoài** hộp bao — bấm khung-toàn-bộ
 * sẽ cắt sạch cả K.3 khỏi màn hình. Camera lúc đó làm đúng thứ `bounds` nói;
 * chính `bounds` mới là thứ không mô tả cả cảnh. Lane A tìm ra khi nối camera.
 *
 * Cạnh không cần duyệt: hai đầu cạnh đều là node, và cung của cạnh qua khoảng
 * trống giữa hai kho vồng theo Z — nằm trong bao của hai đầu ở trục X/Y, còn
 * phần vồng thì `edge-route-3d.ts` giữ trong biên mà nó tự khai.
 */
function boundsOf(
  nodes: readonly Placed3D[],
  plates: readonly Plate3D[],
): Scene3DPlacement['bounds'] {
  if (nodes.length === 0 && plates.length === 0) {
    // Đệm cả nhánh rỗng: một hộp bao suy biến `[0,0,0]..[0,0,0]` bắt camera
    // chia cho 0 khi tính khung-toàn-bộ.
    return {
      min: [-MAX_NODE_HALF_EXTENT, -MAX_NODE_HALF_EXTENT, -MAX_NODE_HALF_EXTENT],
      max: [MAX_NODE_HALF_EXTENT, MAX_NODE_HALF_EXTENT, MAX_NODE_HALF_EXTENT],
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const eat = ([x, y, z]: Vec3, pad: number): void => {
    if (x - pad < minX) minX = x - pad;
    if (y - pad < minY) minY = y - pad;
    if (z - pad < minZ) minZ = z - pad;
    if (x + pad > maxX) maxX = x + pad;
    if (y + pad > maxY) maxY = y + pad;
    if (z + pad > maxZ) maxZ = z + pad;
  };
  for (const n of nodes) eat(n.position, MAX_NODE_HALF_EXTENT);
  for (const p of plates) eat(p.position, Math.max(PLATE_CELL_STEP / 2, PLATE_OVERHANG));
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/**
 * Đo bất biến "**X dùng chung cho cả hai kho**" thay vì khai nó.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO ĐÂY LÀ PHÉP ĐO CHỨ KHÔNG PHẢI MỘT DÒNG CHÚ THÍCH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Đầu file này từng viết bất biến đó như thể nó được bảo đảm bằng xây dựng.
 * **Không phải.** `place3d()` lấy `depth` từ HAI lượt `layoutDag` **độc lập**
 * trên hai tập node khác nhau. Đọc `core/layout/dag-layout.ts` → `computeDepths`:
 * `depth` là **đường dài nhất từ một gốc** trong đúng tập được đưa vào. Nên hai
 * lượt cho cùng một kết quả **với điều kiện** mỗi tập node đóng-với-tổ-tiên
 * (chứa mọi tổ tiên của mọi commit trong nó) — đúng với kho git thật, nhưng
 * **không có dòng mã nào ở đây khẳng định điều kiện đó**.
 *
 * Nếu điều kiện vỡ, hậu quả không phải một lỗi ném ra: cạnh `remote-mirror` đi
 * **chéo** thay vì thẳng theo Z, và nó đi chéo đúng ở những level dạy
 * `push`/`fetch` — tức là ở đúng chỗ hình ảnh đó phải nói lên điều gì.
 *
 * Nên: đếm, và phát ra. Một giả định được đo là một giả định; một giả định
 * trong chú thích là một lời khai (`rules/green-that-proves-nothing.md`).
 *
 * @returns số oid có mặt ở CẢ HAI kho mà `depth` không khớp. `0` là lành.
 */
function depthDisagreementOf(nodes: readonly Placed3D[]): number {
  const local = new Map<string, number>();
  for (const n of nodes) if (n.repo === 'local') local.set(n.oid, n.depth);

  let disagreements = 0;
  for (const n of nodes) {
    if (n.repo !== 'origin') continue;
    const mirror = local.get(n.oid);
    if (mirror !== undefined && mirror !== n.depth) disagreements += 1;
  }
  return disagreements;
}

/** Độ lệch nhánh lớn nhất trong cảnh — đầu vào của `assertPlanesClearOfDag`. */
export function maxDeviationOf(nodes: readonly Placed3D[]): number {
  let max = 0;
  for (const n of nodes) if (n.deviation > max) max = n.deviation;
  return max;
}
