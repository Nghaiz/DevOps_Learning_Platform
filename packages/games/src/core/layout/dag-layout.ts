/**
 * Phân tầng một DAG commit thành toạ độ 2D. **Toán thuần.**
 *
 * Không `three`, không DOM, không React, không `node:*`. Cùng một kết quả ở
 * trình duyệt và ở Node — đó là điều kiện để P18 chấm lại phía máy chủ, và là
 * lý do file này không được phép biết gì về tầng vẽ.
 *
 * Hệ toạ độ trả về là **ô lưới trừu tượng**, không phải pixel:
 *
 *     trục thứ nhất = `depth` = thời gian logic (commit càng mới càng xa gốc)
 *     trục thứ hai  = `lane`  = làn nhánh
 *
 * Renderer nhân với bước lưới của nó. 2D SVG đọc `[depth, lane]` thành `(x, y)`;
 * 3D đọc thành `(x, z)` và giữ trục `y` cho **một** biến duy nhất theo design
 * §3.5. Giữ layout ở đơn vị lưới là thứ cho phép AC-B so **tập** node và cạnh
 * giữa hai renderer thay vì so pixel.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 17.B.2 — ĐO `d3-dag` SO VỚI TỰ VIẾT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Đo ngày **2026-09-14**. `d3-dag` **không** có trong `pnpm-lock.yaml`
 * (`grep -c "d3-dag" pnpm-lock.yaml` = 0), nên nó không được cài vào workspace —
 * cài là đụng lockfile, ngoài quyền của lane này. Thay vào đó tarball
 * `d3-dag@1.2.2` được tải về thư mục tạm và **chạy thật** bằng Node: bundle ESM
 * của nó tự chứa hoàn toàn (không một `import` ngoài nào), nên nạp thẳng được.
 *
 * Phân biệt rõ ĐO ĐƯỢC và TRA ĐƯỢC — `rules/negative-result-scope.md`:
 *
 * | Hạng mục | d3-dag@1.2.2 | Tự viết | Nguồn |
 * |---|---|---|---|
 * | Bundle ESM đã minify | **142.255 B** | 0 B thêm | ĐO (`wc -c` trên dist) |
 * | Bundle ESM gzip -9 | **45.328 B** | 0 B thêm | ĐO |
 * | Phụ thuộc lúc chạy | 4 (đã nội tuyến hết) | 0 | ĐO (0 import ngoài) |
 * | Kích thước gói npm | 595.787 B / 48 file | — | TRA (registry) |
 * | Phụ thuộc bắc cầu | +2.589.619 B chưa giải nén | — | TRA (registry) |
 * | `Math.random` trong bundle | **3 chỗ** | 0 | ĐO (`grep -o`) |
 * | `Math.random` thực sự CHẠY | **0 lời gọi / 5 lượt** | 0 | ĐO (chạy thật) |
 * | Tất định khi lặp cùng đầu vào | ĐẠT | ĐẠT | ĐO |
 * | Tất định qua 5 thứ tự chèn | **TRƯỢT 2/5** | ĐẠT 5/5 | ĐO |
 * | …có bọc thêm sort theo id | ĐẠT 5/5 | ĐẠT | ĐO |
 * | Làn giữ nguyên khi +1 commit | ĐẠT 0/6 nhảy | ĐẠT | ĐO |
 * | Làn giữ nguyên khi +1 nhánh | **TRƯỢT 4/6 nhảy** | ĐẠT | ĐO |
 *
 * `javascript-lp-solver` (2,37 MB chưa giải nén), `quadprog` và
 * `stringify-object` được **nội tuyến** vào bundle ESM — đếm được dấu vân tay
 * `Simplex` ×10, `lastSolvedModel` ×2, `quadprog` ×1. Nên 142 KB ở trên đã là
 * con số trọn gói, không phải phần đỉnh của tảng băng.
 *
 * ⚠ **MỘT GIẢ THUYẾT CỦA CHÍNH LANE NÀY ĐÃ BỊ PHÉP ĐO BÁC BỎ.** Mặc định của
 * `sugiyama()` là `layeringSimplex` + `coordSimplex`, cả hai đi qua bộ giải quy
 * hoạch tuyến tính, mà ba chỗ `Math.random` lại nằm đúng trong bộ giải đó — nên
 * kết luận "mặc định của d3-dag chạm `Math.random`" nghe rất hợp lý. Đo thật thì
 * **0 lời gọi** qua 5 lượt layout. Ghi ra đây để không ai trích lại `Math.random`
 * như lý do loại nó; lý do thật nằm ở dòng cuối bảng.
 *
 * **QUYẾT ĐỊNH: tự viết.** Không phải vì "nhẹ hơn" và không phải vì phổ biến hay
 * không phổ biến — mà vì một phép đo:
 *
 * > Thêm một nhánh vào đồ thị làm **4 trên 6 commit CŨ đổi làn** dưới d3-dag.
 *
 * Design §3.5 đặt "mỗi nhánh một làn riêng, **làn cố định**" thành ràng buộc
 * cứng, và trong game này `git branch` là lệnh thường ngày chứ không phải tình
 * huống hiếm. Một đồ thị mà quá nửa số commit nhảy chỗ mỗi lần người chơi tạo
 * nhánh thì không lần theo được nữa — và lần theo một đường phụ thuộc chính là
 * thứ game dạy. Nguyên nhân gốc không phải lỗi của d3-dag: nó tối ưu toạ độ x
 * cho **từng lượt layout**, còn ta cần làn mang **danh tính nhánh** và giữ
 * nguyên giữa hai lượt vẽ. Đó là kiến thức miền mà một thư viện đồ thị tổng
 * quát không thể có.
 *
 * Hai lý do phụ, không đủ để tự quyết nhưng cùng chiều: 45 KB gzip cho một đồ
 * thị vài trăm node là đắt (trần route ở `scripts/check-bundle-budget.mjs` là
 * 1.850.000 B, `/games/k8s` hôm nay đã dùng 1.433.087 B vì three.js), và ba chỗ
 * `Math.random` tuy hôm nay không chạy vẫn sẽ buộc cổng grep §17.J.2 phải mở một
 * ngoại lệ vĩnh viễn — mà một ngoại lệ trong cổng chống bất định là đúng thứ
 * `rules/green-that-proves-nothing.md` cảnh báo.
 *
 * Chiều ngược lại đã được thử tử tế: bọc `sort` theo id trước khi đưa vào
 * d3-dag **có** chữa được trượt thứ-tự-chèn (5/5 đạt). Nó không chữa được dòng
 * cuối bảng, và dòng cuối bảng mới là dòng quyết định.
 */

import { compareKeys } from '../../git/deterministic.ts';
import { assignLanes } from './lane-assign.ts';
import { routeEdge } from './edge-route.ts';

/** Node đầu vào. `parents` theo thứ tự git: phần tử [0] là cha thứ nhất. */
export interface DagNode {
  readonly id: string;
  readonly parents: readonly string[];
  /**
   * Danh tính nhánh, nếu biết. Các node cùng `laneHint` dùng CHUNG một làn.
   *
   * Đây là đường để tầng trên ghim `main` luôn ở một làn xuyên suốt phiên chơi,
   * thay vì để thuật toán suy ra từ hình dạng — hình dạng đổi mỗi lệnh, danh
   * tính nhánh thì không.
   */
  readonly laneHint?: string;
}

export interface LaidOutNode {
  readonly id: string;
  /** Độ sâu tô-pô: `0` ở gốc, `1 + max(độ sâu các cha)` ở chỗ khác. */
  readonly depth: number;
  /** Chỉ số làn, `0..laneCount-1`. */
  readonly lane: number;
}

export interface LaidOutEdge {
  /** Id **cha**. Cạnh chạy theo chiều thời gian: cha → con. */
  readonly from: string;
  /** Id **con**. */
  readonly to: string;
  /** Vị trí trong `parents` của con. `0` = cha thứ nhất, `>0` = cha của merge. */
  readonly parentIndex: number;
  /** Đường gấp khúc góc vuông, toạ độ `[depth, lane]`. Luôn có ≥ 2 điểm. */
  readonly points: readonly (readonly [number, number])[];
}

export interface DagLayout {
  /** Sắp theo `(depth, lane, id)`. Thứ tự này KHÔNG phụ thuộc thứ tự đầu vào. */
  readonly nodes: readonly LaidOutNode[];
  /** Sắp theo thứ tự node con ở trên, rồi theo `parentIndex`. */
  readonly edges: readonly LaidOutEdge[];
  readonly laneCount: number;
  /** Số tầng. `0` khi đồ thị rỗng, ngược lại `max(depth) + 1`. */
  readonly depthCount: number;
}

/**
 * Chuẩn hoá đầu vào thành một dạng **không phụ thuộc thứ tự đầu vào**.
 *
 * Hai việc, cả hai đều là chỗ tính tất định dễ rò rỉ nhất:
 *
 * 1. **Id trùng.** Đây là lỗi của bên gọi, nhưng "giữ cái đầu tiên" thì lại phụ
 *    thuộc đúng cái thứ tự ta đang cố thoát khỏi. Nên chọn bản có dạng serialize
 *    nhỏ nhất — tuỳ tiện, nhưng tuỳ tiện một cách tất định.
 * 2. **Cha không tồn tại.** Giữ node, bỏ cạnh. Một commit trỏ tới cha đã rời
 *    khỏi cửa sổ đang vẽ là chuyện thường (chương 3 vẽ cả commit mất ref), và
 *    ném ở đây sẽ biến một khung hình thiếu dữ liệu thành một màn hình trắng.
 */
function normalize(nodes: readonly DagNode[]): readonly DagNode[] {
  const byId: Record<string, DagNode> = {};
  for (const node of nodes) {
    const seen = byId[node.id];
    if (seen === undefined) {
      byId[node.id] = node;
      continue;
    }
    const a = JSON.stringify([seen.parents, seen.laneHint ?? null]);
    const b = JSON.stringify([node.parents, node.laneHint ?? null]);
    if (compareKeys(b, a) < 0) byId[node.id] = node;
  }

  const ids = Object.keys(byId).sort(compareKeys);
  const out: DagNode[] = [];
  for (const id of ids) {
    const node = byId[id];
    if (node === undefined) continue;
    const parents = node.parents.filter((p) => Object.hasOwn(byId, p) && p !== id);
    out.push(
      node.laneHint === undefined ? { id, parents } : { id, parents, laneHint: node.laneHint },
    );
  }
  return out;
}

/**
 * Độ sâu theo **đường dài nhất**, không phải đường ngắn nhất.
 *
 * Chọn đường dài nhất là điều kiện để một commit merge đứng SAU cả hai cha nó.
 * Với đường ngắn nhất, một merge giữa một nhánh dài và một nhánh ngắn sẽ bị kéo
 * về sát nhánh ngắn và cạnh kia phải chạy ngược chiều thời gian — đúng thứ làm
 * người đọc mất phương hướng.
 *
 * Duyệt theo LỚP (Kahn từng đợt) thay vì hàng đợi một phần tử: mỗi đợt xử lý
 * toàn bộ node đã sẵn sàng, đã sắp theo id. Không có chỗ nào thứ tự chèn lọt vào.
 */
function computeDepths(nodes: readonly DagNode[]): Readonly<Record<string, number>> {
  const childrenOf: Record<string, string[]> = {};
  const remaining: Record<string, number> = {};
  for (const node of nodes) {
    remaining[node.id] = node.parents.length;
    for (const parent of node.parents) {
      const list = childrenOf[parent];
      if (list === undefined) childrenOf[parent] = [node.id];
      else list.push(node.id);
    }
  }

  const depth: Record<string, number> = {};
  let ready = nodes.filter((n) => n.parents.length === 0).map((n) => n.id);
  for (const id of ready) depth[id] = 0;

  let settled = 0;
  while (ready.length > 0) {
    const layer = [...ready].sort(compareKeys);
    settled += layer.length;
    const next: string[] = [];
    for (const id of layer) {
      const here = depth[id] ?? 0;
      const kids = childrenOf[id];
      if (kids === undefined) continue;
      for (const kid of [...kids].sort(compareKeys)) {
        const known = depth[kid];
        depth[kid] = known === undefined ? here + 1 : Math.max(known, here + 1);
        const left = (remaining[kid] ?? 0) - 1;
        remaining[kid] = left;
        if (left === 0) next.push(kid);
      }
    }
    ready = next;
  }

  /*
   * Còn sót ⇒ có chu trình. Một DAG commit thật không thể có, nhưng dữ liệu tới
   * từ level viết tay và từ 17.Q nhập JSON, nên đây là biên hệ thống. Không ném:
   * gán độ sâu bằng một lượt nới lỏng có chặn số vòng, theo id. Hình dạng vẽ ra
   * vô nghĩa — nhưng nó TẤT ĐỊNH và không làm sập màn hình.
   */
  if (settled < nodes.length) {
    const stuck = nodes.filter((n) => depth[n.id] === undefined);
    for (const node of stuck) depth[node.id] = 0;
    for (let pass = 0; pass < stuck.length; pass += 1) {
      let changed = false;
      for (const node of stuck) {
        let best = 0;
        for (const parent of node.parents) best = Math.max(best, (depth[parent] ?? 0) + 1);
        if (best !== depth[node.id]) {
          depth[node.id] = best;
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  return depth;
}

/**
 * Phân tầng một DAG và trả toạ độ lưới.
 *
 * ⛔ **Tất định tuyệt đối.** Cùng một đồ thị đưa vào ở bất kỳ thứ tự nào cho ra
 * kết quả **bằng nhau từng byte** khi `JSON.stringify`. `determinism.test.ts`
 * khẳng định điều đó qua ≥ 5 thứ tự chèn, và nó là bản sao của điều kiện
 * §17.J.3 áp cho tầng layout.
 */
export function layoutDag(nodes: readonly DagNode[]): DagLayout {
  const clean = normalize(nodes);
  if (clean.length === 0) {
    return { nodes: [], edges: [], laneCount: 0, depthCount: 0 };
  }

  const depthOf = computeDepths(clean);

  /*
   * Thứ tự chuẩn tắc: tầng trước, rồi id. Mọi bước sau đọc theo thứ tự này.
   *
   * ⚠ Phép so `compareKeys(a.id, b.id)` ở đây **thừa về mặt logic** — `normalize`
   * đã trả mảng sắp theo id, và `Array.prototype.sort` ổn định từ ES2019, nên chỉ
   * sắp theo `depth` thôi cũng đã giữ được thứ tự id trong từng tầng. Giữ lại là
   * cố ý: hai neo độc lập cho cùng một tính chất.
   *
   * Nhưng phải biết cái giá của sự thừa đó, vì nó đã được ĐO chứ không phải đoán:
   * gỡ MỘT trong hai neo thì `determinism.test.ts` vẫn XANH (đã thử cả hai chiều),
   * chỉ khi gỡ CẢ HAI nó mới đỏ. Nghĩa là cổng này không bảo vệ được từng neo
   * riêng lẻ. Ai dọn một trong hai vì tưởng nó chết sẽ không thấy gì đỏ, và người
   * dọn nốt neo còn lại sau đó mới là người lãnh lỗi — mà lúc ấy nguyên nhân đã
   * nằm ở một commit khác. Nên: **đừng gỡ neo nào**, và nếu buộc phải gỡ thì gỡ
   * kèm cả chú thích này.
   */
  const ordered = [...clean].sort((a, b) => {
    const da = depthOf[a.id] ?? 0;
    const db = depthOf[b.id] ?? 0;
    return da !== db ? da - db : compareKeys(a.id, b.id);
  });

  const lanes = assignLanes(ordered);

  const laidOut: LaidOutNode[] = ordered.map((node) => ({
    id: node.id,
    depth: depthOf[node.id] ?? 0,
    lane: lanes.laneOf[node.id] ?? 0,
  }));
  laidOut.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.lane !== b.lane) return a.lane - b.lane;
    return compareKeys(a.id, b.id);
  });

  const specOf: Record<string, DagNode> = {};
  for (const node of ordered) specOf[node.id] = node;

  const edges: LaidOutEdge[] = [];
  for (const child of laidOut) {
    const spec = specOf[child.id];
    if (spec === undefined) continue;
    for (let i = 0; i < spec.parents.length; i += 1) {
      const parentId = spec.parents[i];
      if (parentId === undefined) continue;
      const parentDepth = depthOf[parentId];
      const parentLane = lanes.laneOf[parentId];
      if (parentDepth === undefined || parentLane === undefined) continue;
      edges.push({
        from: parentId,
        to: child.id,
        parentIndex: i,
        points: routeEdge(parentDepth, parentLane, child.depth, child.lane, i === 0),
      });
    }
  }

  let maxDepth = 0;
  for (const node of laidOut) maxDepth = Math.max(maxDepth, node.depth);

  return {
    nodes: laidOut,
    edges,
    laneCount: lanes.laneCount,
    depthCount: maxDepth + 1,
  };
}
