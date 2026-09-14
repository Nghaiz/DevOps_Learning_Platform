/**
 * Định tuyến cạnh theo làn (17.K.5) — **toán thuần, không một dòng `three`**.
 *
 * Cùng ba lý do đã ghi ở đầu `scene3d-contract.ts`: test được ở env `node`, giữ
 * cổng `bundle:check` sạch, và để lane khác đọc được đường đi của một cạnh mà
 * không phải đọc mã dựng buffer.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ KHÔNG EDGE BUNDLING — VÀ ĐÂY LÀ LÝ DO, KHÔNG PHẢI MỘT SỞ THÍCH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gom cạnh thành bó làm cảnh gọn hơn và làm mất đúng thứ cả game dạy: lần theo
 * MỘT đường phụ thuộc từ một commit về tổ tiên của nó. Khi mười cạnh chập vào
 * một bó, câu hỏi "commit này là con của ai" không còn trả lời được bằng mắt —
 * mà đó là câu hỏi duy nhất mà một đồ thị commit tồn tại để trả lời.
 *
 * Hệ quả: mỗi cạnh giữ nguyên đường riêng, kể cả khi hai cạnh chạy sát nhau.
 * Chồng lấn cục bộ ở CHỖ HAI CẠNH GẶP CHUNG MỘT NODE là hình ảnh ĐÚNG (chúng
 * thật sự gặp nhau ở đó); chồng lấn dọc suốt chiều dài mới là thứ phải tránh, và
 * đó là việc của hình chữ Z bên dưới.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HÌNH CHỮ Z — HAI CHỖ RẼ, KHÔNG PHẢI MỘT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Một cạnh đổi làn có ba đoạn: chạy dọc trục X trong làn của mình tới điểm giữa,
 * CẮT NGANG sang làn kia, rồi chạy tiếp dọc X tới đích.
 *
 * Vì sao không phải một chỗ rẽ. Với một chỗ rẽ, đoạn cắt ngang nằm ĐÚNG tại cột
 * X của một trong hai đầu, nên nó dính vào node đó — và mọi cạnh khác cũng chạm
 * node đó bị chập lên nhau suốt cả đoạn còn lại. Đo trên ví dụ nhỏ nhất có thật:
 *
 *     làn 0:  A---B---C          B có hai con: C (làn 0) và E (làn 1)
 *                  \
 *     làn 1:        E
 *
 * Rẽ-một-lần, cắt tại cột của B  ⇒ cạnh E→B và cạnh C→B nằm chồng khít lên nhau
 * trên toàn bộ đoạn giữa cột B và cột C. Hai quan hệ khác nhau, một nét vẽ.
 * Rẽ-hai-lần, cắt ở CHÍNH GIỮA   ⇒ chúng chỉ chập nửa đoạn phía sát B, tức đúng
 * phần "cả hai đều đi về B" — phần mang thông tin thật.
 *
 * ⚠ "Góc vuông" ở đây là góc vuông THẬT trong không gian 3D, dù đoạn cắt ngang
 * đi chéo trong mặt phẳng YZ. Lý do: Y **không phải** một biến độc lập —
 * `deviationY(lane)` sinh nó ra từ chính `lane`, tức Y và Z là HAI HÌNH CHIẾU
 * CỦA MỘT BIẾN. Nên hai hướng đoạn là `(1,0,0)` và `(0,Δy,Δz)`, tích vô hướng
 * bằng 0. Đổi làn là một động tác, và nó được vẽ bằng một đoạn.
 */

import type { SceneEdgeKind } from '../../shared/scene-props.ts';
import {
  NODE_RADIUS,
  PLATE_FLOOR,
  type Routed3D,
  type SceneEdgeKey3D,
  type Vec3,
} from './scene3d-contract.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Hằng số
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sai số gộp hai điểm trùng nhau.
 *
 * Chọn nhỏ hơn `NODE_RADIUS` ba bậc độ lớn: nó chỉ để bắt trùng do phép chia
 * `(a + b) / 2` rơi đúng vào một đầu, không phải để làm tròn hình học.
 */
const EPS = 1e-6;

/**
 * Số đoạn của cung bắc qua khoảng trống giữa hai kho.
 *
 * 14 là ngưỡng dưới của "đọc ra là một đường cong chứ không phải một hình đa
 * giác": ở 8 đoạn, đỉnh cung có một góc gãy thấy rõ khi camera nhìn ngang.
 * Đây là một CẠNH duy nhất trong cả cảnh ở phần lớn level (một commit đã push
 * sinh một cạnh `remote-mirror`), nên chi phí đỉnh không phải mối lo.
 */
export const GAP_ARC_SEGMENTS = 14;

/**
 * Độ vồng của cung, theo tỉ lệ với khoảng cách hai đầu.
 *
 * 0.18 cho một cung rõ ràng là cung mà không bay lên tới vùng mặt phẳng ô file.
 * Trần cứng ở `arcApexY()` mới là thứ bảo đảm điều đó; con số này chỉ là hình
 * dạng mong muốn khi trần chưa cắn.
 */
const GAP_ARC_RISE_RATIO = 0.18;

/**
 * Phần tối đa của tổng chiều dài được phép cắt ở MỖI đầu.
 *
 * `NODE_RADIUS` là lượng cắt mong muốn, nhưng một cạnh ngắn bất thường (hai
 * commit sát nhau) sẽ bị cắt hết và biến mất. 0.4 giữ lại tối thiểu 20% chiều
 * dài — đủ để nét vẽ vẫn tồn tại và vẫn chỉ đúng hướng.
 */
const MAX_TRIM_RATIO = 0.4;

// ═══════════════════════════════════════════════════════════════════════════
// Kiểu
// ═══════════════════════════════════════════════════════════════════════════

/** Một cạnh đã thành đường gấp khúc, sẵn sàng đổ vào buffer. */
export interface EdgeRoute3D {
  readonly key: SceneEdgeKey3D;
  readonly kind: SceneEdgeKind;
  readonly crossesGap: boolean;
  /**
   * Từ 2 điểm trở lên, không có hai điểm liên tiếp trùng nhau, mọi thành phần
   * hữu hạn. Bên vẽ vẫn phải tự kiểm `Number.isFinite` — xem `lane-edges.tsx`.
   */
  readonly points: readonly Vec3[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Hình học cơ bản
// ═══════════════════════════════════════════════════════════════════════════

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Tổng chiều dài một đường gấp khúc. */
export function polylineLength(points: readonly Vec3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += dist(points[i - 1] as Vec3, points[i] as Vec3);
  }
  return total;
}

/** Bỏ các điểm trùng liên tiếp. Giữ nguyên thứ tự; luôn giữ ít nhất hai điểm. */
function dedupe(points: readonly Vec3[]): Vec3[] {
  const out: Vec3[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last === undefined || dist(last, p) > EPS) out.push(p);
  }
  if (out.length < 2) {
    // Hai đầu trùng nhau hoàn toàn. Trả về một đoạn dài 0 thay vì một mảng một
    // phần tử: bên vẽ đọc theo CẶP, và một mảng lẻ làm lệch toàn bộ buffer.
    const only = (out[0] ?? points[0] ?? [0, 0, 0]) as Vec3;
    return [only, only];
  }
  return out;
}

/**
 * Lấy đoạn con của đường gấp khúc theo chiều dài cung, từ `start` tới `end`.
 *
 * Đi theo CHIỀU DÀI CUNG chứ không theo từng đoạn: một cạnh hình chữ Z có đoạn
 * đầu có thể ngắn hơn `NODE_RADIUS`, và phép cắt "trừ vào đoạn đầu" khi ấy sẽ
 * vọt qua đầu kia của đoạn đó rồi sinh ra toạ độ nằm ngoài đường.
 */
function subPolyline(points: readonly Vec3[], start: number, end: number): Vec3[] {
  const out: Vec3[] = [];
  let walked = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Vec3;
    const b = points[i] as Vec3;
    const len = dist(a, b);
    const segStart = walked;
    const segEnd = walked + len;
    walked = segEnd;
    if (len <= EPS) continue;
    if (segEnd < start || segStart > end) continue;
    const from = Math.max(start, segStart);
    const to = Math.min(end, segEnd);
    if (out.length === 0) out.push(lerp3(a, b, (from - segStart) / len));
    out.push(lerp3(a, b, (to - segStart) / len));
  }
  return dedupe(out);
}

/**
 * Lùi hai đầu vào `NODE_RADIUS` để nét vẽ không đâm xuyên ô commit.
 *
 * Ô commit là khối đặc; một nét chui vào giữa nó đọc ra thành "cạnh xuyên qua
 * commit", mà trong một DAG thì đi-xuyên-qua và kết-thúc-tại là hai quan hệ
 * khác hẳn nhau.
 */
function trimEnds(points: readonly Vec3[]): Vec3[] {
  const total = polylineLength(points);
  if (total <= EPS) return dedupe(points);
  const cut = Math.min(NODE_RADIUS, total * MAX_TRIM_RATIO);
  return subPolyline(points, cut, total - cut);
}

// ═══════════════════════════════════════════════════════════════════════════
// Cung bắc qua khoảng trống giữa hai kho
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Đỉnh cung, đã chặn trần dưới vùng mặt phẳng ô file.
 *
 * ⚠ `assertPlanesClearOfDag()` của hợp đồng chỉ gác ĐỘ LỆCH NHÁNH của node — nó
 * không biết gì về cung này. Một cung vồng qua khoảng trống rộng có thể vượt
 * `PLATE_FLOOR` mà cổng đó vẫn xanh, và khi ấy nét vẽ xuyên qua mặt phẳng HEAD.
 * Trần ở đây là thứ duy nhất chặn điều đó.
 */
function arcApexY(from: Vec3, to: Vec3): number {
  const base = Math.max(from[1], to[1]);
  const wanted = base + dist(from, to) * GAP_ARC_RISE_RATIO;
  const ceiling = PLATE_FLOOR - NODE_RADIUS * 2;
  return Math.max(base, Math.min(wanted, ceiling));
}

/**
 * Cung Bézier bậc hai từ `from` tới `to`, vồng lên theo trục Y.
 *
 * Hình dạng KHÁC HẲN cạnh thường là có chủ ý và là thông tin chính của nó: một
 * `remote-mirror` không phải quan hệ cha-con, nó nói "cùng một commit, ở kho
 * kia". Nếu nó cũng là một đường gấp khúc góc vuông thì người chơi phải đọc
 * NHỊP ĐỨT mới phân biệt được — mà nhịp đứt là thứ đầu tiên biến mất ở cỡ nhỏ.
 */
function gapArc(from: Vec3, to: Vec3): Vec3[] {
  const apexY = arcApexY(from, to);
  const midY = (from[1] + to[1]) / 2;
  // Bézier bậc hai đạt `0.25*P0 + 0.5*P1 + 0.25*P2` ở t = 0.5, nên để đỉnh rơi
  // đúng `apexY` thì điểm điều khiển phải là `2*apexY - midY`, không phải
  // `apexY`. Đặt thẳng `apexY` vào đây làm cung thấp đi đúng một nửa.
  const ctrl: Vec3 = [(from[0] + to[0]) / 2, 2 * apexY - midY, (from[2] + to[2]) / 2];
  const out: Vec3[] = [];
  for (let i = 0; i <= GAP_ARC_SEGMENTS; i += 1) {
    const t = i / GAP_ARC_SEGMENTS;
    const u = 1 - t;
    out.push([
      u * u * from[0] + 2 * u * t * ctrl[0] + t * t * to[0],
      u * u * from[1] + 2 * u * t * ctrl[1] + t * t * to[1],
      u * u * from[2] + 2 * u * t * ctrl[2] + t * t * to[2],
    ]);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Định tuyến
// ═══════════════════════════════════════════════════════════════════════════

/** Hai đầu có nằm trên cùng một làn không (Z và Y đều sinh ra từ `lane`). */
function sameLane(from: Vec3, to: Vec3): boolean {
  return Math.abs(from[1] - to[1]) <= EPS && Math.abs(from[2] - to[2]) <= EPS;
}

/**
 * Đường đi của MỘT cạnh. Hàm thuần và tất định: cùng đầu vào ⇒ cùng mảng điểm.
 */
export function routeEdge3d(edge: Routed3D): EdgeRoute3D {
  const { from, to } = edge;
  let raw: readonly Vec3[];
  if (edge.crossesGap) {
    raw = gapArc(from, to);
  } else if (sameLane(from, to)) {
    raw = [from, to];
  } else {
    // Chỗ cắt ngang nằm CHÍNH GIỮA hai cột X — xem khối chữ Z ở đầu file. Khi
    // hai đầu cùng cột (`cherry-source` giữa hai commit cùng thời điểm logic),
    // hai điểm rẽ rơi trùng lên hai đầu và `dedupe()` rút về một đoạn thẳng cắt
    // ngang, đúng hình đáng ra phải có.
    const elbowX = (from[0] + to[0]) / 2;
    raw = [from, [elbowX, from[1], from[2]], [elbowX, to[1], to[2]], to];
  }
  return {
    key: edge.key,
    kind: edge.kind,
    crossesGap: edge.crossesGap,
    points: trimEnds(dedupe(raw)),
  };
}

/** Định tuyến cả cảnh. Giữ nguyên thứ tự của `placement.edges`. */
export function routeEdges3d(edges: readonly Routed3D[]): readonly EdgeRoute3D[] {
  return edges.map(routeEdge3d);
}

/**
 * Đường gấp khúc → mảng phẳng cho `LineSegmentsGeometry.setPositions`.
 *
 * `LineSegments2` đọc theo CẶP ĐỈNH RỜI (`x0 y0 z0 x1 y1 z1` là một đoạn), nên
 * một đường N điểm nở thành `(N-1) * 6` số chứ không phải `N * 3`. Nhầm chỗ này
 * làm mọi đoạn thứ hai nối sai đầu và cả cảnh thành một mớ dây chéo.
 */
export function polylineSegments(points: readonly Vec3[], out: number[]): void {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Vec3;
    const b = points[i] as Vec3;
    out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
}

/** Số đoạn thẳng mà một tuyến sinh ra. Bên vẽ dùng để định cỡ buffer trước. */
export function routeSegmentCount(route: EdgeRoute3D): number {
  return Math.max(0, route.points.length - 1);
}
