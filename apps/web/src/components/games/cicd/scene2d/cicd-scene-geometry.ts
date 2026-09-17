/**
 * Hình học px của cảnh 2D game CI/CD — toán THUẦN, không một dòng JSX (19.D.2.1).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐÂY LÀ NƠI DUY NHẤT Ô LƯỚI THẾ GIỚI THÀNH PIXEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `placeWorkflow()` trả toạ độ theo ĐƠN VỊ THẾ GIỚI, một đơn vị mỗi ô lưới, và
 * chú thích của nó nói rõ vì sao: để việc chọn tỉ lệ thật cho renderer, nơi nó
 * phụ thuộc cỡ node và cỡ chữ. File này làm đúng việc đó và **chỉ việc đó** —
 * nên nó test được ở env `node`, không cần DOM.
 *
 * ⛔ Phép chiếu 3D→2D KHÔNG được viết lại ở đây. `sceneAxes()` + `project2d()`
 * của `../scene-props.ts` là nơi DUY NHẤT phát biểu nó (lead sở hữu). File này
 * chỉ nhân với tỉ lệ và cộng lề.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TRỤC BỊ GẬP KHÔNG ĐƯỢC BIẾN MẤT — VÀ HAI CHƯƠNG XỬ LÝ KHÁC NHAU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `sceneAxes().folded` nói trục nào không vẽ được bằng vị trí. Nó là thứ bài học
 * dạy, nên "không vẽ được bằng vị trí" phải thành "vẽ bằng kênh khác", không
 * thành "không vẽ".
 *
 * | Chương | Gập | Cách cứu |
 * |---|---|---|
 * | CI | Y = thời gian chờ hàng đợi | **`waitTicks()`** → badge số tick trên node (`cicd-scene-node.tsx`) |
 * | CD | Z = làn job song song | **`foldNudge()`** → lệch dọc nhỏ TRONG cùng dải |
 *
 * Hai cách khác nhau vì hai đại lượng khác nhau. Thời gian chờ ở chương CI lên
 * tới vài chục tick — đẩy nó thành lệch vị trí thì một job chờ 40 tick bay ra
 * khỏi khung (chính lý do `CI_Y_PER_TICK` nhỏ hơn `LAYER_SPACING` ở tầng đặt
 * chỗ). Làn ở chương CD thì hiếm khi quá năm, nên một lệch nhỏ đủ tách hai job
 * cùng dải mà không ai đọc nhầm nó thành "khác môi trường".
 *
 * `foldNudge()` đọc `p.z` chứ không đọc `lane`, và đó là điều làm nó dùng được
 * cho CẢ node lẫn điểm gấp khúc của cạnh: `ScenePoint` của cạnh không mang
 * `lane`, nhưng `z = lane * LANE_SPACING` nên hai bên lệch ĐÚNG như nhau và cạnh
 * vẫn chạm node. Một hàm nudge đọc `lane` sẽ làm cạnh trôi khỏi node ở chương CD
 * mà không gì đỏ.
 */

import type { CicdBounds, ScenePoint } from '@devops-platform/games';
import {
  project2d,
  type CicdPlacedNode,
  type CicdResolvedEdge,
  type SceneAxes,
} from '../scene-props';

// ═══════════════════════════════════════════════════════════════════════════
// Tỉ lệ — px
// ═══════════════════════════════════════════════════════════════════════════

/** Hộp một job. Đủ rộng cho ~16 ký tự tên ở cỡ chữ 15px. */
export const NODE_W = 168;
export const NODE_H = 84;

/** px mỗi đơn vị thế giới theo trục NGANG (một tầng phụ thuộc). */
export const H_STEP = 232;

/**
 * px mỗi đơn vị thế giới theo trục DỌC, **khác nhau theo chương**.
 *
 * Chương CI: một đơn vị = một làn (`LANE_SPACING = 1`) ⇒ 136px giữa hai làn.
 * Chương CD: một đơn vị = nửa dải (`CD_Y_PER_BAND = 2`) ⇒ 176px giữa hai dải.
 *
 * ⚠ Hai số này KHÔNG được gộp làm một. Gộp thì hoặc hai làn CI dính vào nhau,
 * hoặc ba dải môi trường CD kéo cảnh dài gấp đôi màn hình.
 */
export const V_STEP_CI = 136;
export const V_STEP_CD = 88;

/** Lệch dọc của mỗi làn trong cùng một dải môi trường (chương CD). */
export const CD_LANE_NUDGE = 30;

/** Lề trái: chừa chỗ cho nhãn dải môi trường / nhãn tầng. */
export const GUTTER = 148;
export const PAD_TOP = 108;
export const PAD_RIGHT = 96;
export const PAD_BOTTOM = 72;

/** Bán kính bo góc của đường gấp khúc. */
export const CORNER_RADIUS = 16;

export type Px = readonly [number, number];

export function vStep(axes: SceneAxes): number {
  return axes.vertical === 'y' ? V_STEP_CD : V_STEP_CI;
}

/**
 * Lệch dọc cứu trục bị gập. Chỉ khác 0 ở chương CD (gập Z).
 *
 * Ở chương CI trục gập là Y và nó được cứu bằng `waitTicks()` + badge, **không**
 * bằng vị trí — xem bảng ở đầu file.
 */
export function foldNudge(point: ScenePoint, axes: SceneAxes): number {
  return axes.folded === 'z' ? point.z * CD_LANE_NUDGE : 0;
}

/** Tâm của một điểm cảnh, tính bằng px. */
export function scenePx(point: ScenePoint, axes: SceneAxes): Px {
  const [u, v] = project2d(point, axes);
  return [GUTTER + u * H_STEP, PAD_TOP + v * vStep(axes) + foldNudge(point, axes)];
}

export interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * `viewBox` khớp `bounds` của phép đặt chỗ, cộng lề và nửa hộp node ở mỗi phía.
 *
 * ⚠ Cộng `NODE_W / 2` KHÔNG phải trang trí: `scenePx()` trả TÂM node, nên một
 * node ở `bounds.max.x` thò ra ngoài khung đúng nửa hộp. Thiếu phần cộng này
 * thì cột cuối bị cắt mất một nửa ở mọi level — và nó chỉ lộ ra ở level nào có
 * node sát mép, tức không lộ ở level thử nghiệm.
 *
 * ⚠ `foldNudge` của chương CD cũng cộng vào chiều cao, qua `laneCount`. Bên gọi
 * truyền `laneCount` vì `bounds` không mang thông tin làn ở chương CD (Z không
 * nằm trên trục dọc).
 */
export function sceneViewBox(
  bounds: CicdBounds,
  axes: SceneAxes,
  laneCount: number,
): ViewBox {
  const [x0, y0] = scenePx(bounds.min, axes);
  const [x1, y1] = scenePx(bounds.max, axes);
  const nudge = axes.folded === 'z' ? Math.max(0, laneCount - 1) * CD_LANE_NUDGE : 0;
  const left = Math.min(x0, x1) - NODE_W / 2 - GUTTER;
  const top = Math.min(y0, y1) - NODE_H / 2 - PAD_TOP;
  const right = Math.max(x0, x1) + NODE_W / 2 + PAD_RIGHT;
  const bottom = Math.max(y0, y1) + nudge + NODE_H / 2 + PAD_BOTTOM;
  return {
    x: round(left),
    y: round(top),
    width: round(Math.max(1, right - left)),
    height: round(Math.max(1, bottom - top)),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Cạnh
// ═══════════════════════════════════════════════════════════════════════════

function samePx(a: Px, b: Px): boolean {
  return Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;
}

/**
 * Bỏ điểm trùng SAU khi chiếu.
 *
 * Bắt buộc, không phải dọn dẹp: một đoạn 3D chỉ đổi trục bị GẬP chiếu xuống
 * thành một đoạn dài 0 (hai đầu rơi đúng một chỗ). `placeWorkflow` đã bỏ trùng ở
 * không gian 3D rồi, nhưng phép chiếu sinh ra trùng MỚI — và một đoạn dài 0 làm
 * phép bo góc chia cho 0.
 */
export function dedupePx(points: readonly Px[]): readonly Px[] {
  const out: Px[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last !== undefined && samePx(last, p)) continue;
    out.push(p);
  }
  return out;
}

/** Đường gấp khúc của một cạnh, đã chiếu và bỏ trùng. */
export function edgePx(edge: CicdResolvedEdge, axes: SceneAxes): readonly Px[] {
  return dedupePx(edge.spot.points.map((p) => scenePx(p, axes)));
}

function dist(a: Px, b: Px): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function towards(from: Px, to: Px, d: number): Px {
  const len = dist(from, to);
  if (len === 0) return from;
  const t = Math.min(1, d / len);
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(p: Px): string {
  return `${round(p[0])} ${round(p[1])}`;
}

/**
 * `d` của một đường GÓC VUÔNG bo góc.
 *
 * Bán kính bị kẹp xuống một nửa đoạn ngắn nhất kề góc. Không kẹp thì ở một cạnh
 * có đoạn ngắn hơn `2 * CORNER_RADIUS`, hai cung bo chồng lên nhau và đường vẽ
 * ra quay ngược — trông như một nút thắt, và không có gì đỏ.
 */
export function orthPath(points: readonly Px[], radius = CORNER_RADIUS): string {
  const pts = dedupePx(points);
  const first = pts[0];
  if (first === undefined) return '';
  if (pts.length === 1) return `M ${fmt(first)}`;

  let d = `M ${fmt(first)}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    if (prev === undefined || cur === undefined || next === undefined) continue;
    const r = Math.min(radius, dist(prev, cur) / 2, dist(cur, next) / 2);
    d += ` L ${fmt(towards(cur, prev, r))} Q ${fmt(cur)} ${fmt(towards(cur, next, r))}`;
  }
  const last = pts.at(-1);
  if (last !== undefined) d += ` L ${fmt(last)}`;
  return d;
}

/** Độ dài đường gấp khúc, px. Dùng làm chu kỳ chạy của chấm dòng chảy. */
export function pathLength(points: readonly Px[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    total += dist(a, b);
  }
  return round(total);
}

// ═══════════════════════════════════════════════════════════════════════════
// Thời gian — trục bị gập của chương CI, và nhãn đường găng
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Số tick một job nằm chờ HÀNG ĐỢI (phụ thuộc xong rồi mà chưa có máy).
 *
 * Đây CHÍNH LÀ trục Y của chương CI — thứ phép chiếu 2D gập đi. `null` khi lượt
 * chạy chưa tới job này (chưa `readyTick` hoặc chưa `startedTick`), khác hẳn với
 * `0` (đã tới lượt và có máy ngay).
 *
 * ⛔ Không cất hiệu số này ở đâu cả — `contract.ts` ghi rõ `readyTick` là dữ
 * kiện gốc và `code-conventions.md` § "No Derived Fields" cấm lưu hiệu số.
 */
export function waitTicks(node: CicdPlacedNode): number | null {
  const ready = node.node.readyTick;
  const started = node.node.startedTick;
  if (ready === null || started === null) return null;
  return Math.max(0, started - ready);
}

/**
 * Tổng thời gian lượt chạy, tính bằng tick: tick job cuối cùng kết thúc.
 *
 * `null` khi chưa job nào xong — lúc đó nhãn đường găng không hiện con số nào
 * thay vì hiện `0 tick`, vì `0` ở đây đọc ra là "chạy xong tức thì" chứ không
 * phải "chưa chạy".
 *
 * ⚠ Đơn vị là TICK, không phải giây. `CicdGraphView` là `Pick<CicdView, 'nodes'
 * | 'edges' | 'yAxis'>` nên nó KHÔNG mang `tickSeconds` — đổi ra giây ở đây là
 * bịa một hệ số. Đã ghi vào báo cáo lane như một đề xuất cho hợp đồng.
 */
export function runTotalTicks(nodes: readonly CicdPlacedNode[]): number | null {
  let max: number | null = null;
  for (const n of nodes) {
    const finished = n.node.finishedTick;
    if (finished === null) continue;
    if (max === null || finished > max) max = finished;
  }
  return max;
}

/** Số cạnh nằm trên đường găng. `0` ⇒ không vẽ nhãn đường găng. */
export function criticalCount(edges: readonly CicdResolvedEdge[]): number {
  return edges.filter((e) => e.edge.critical).length;
}

/**
 * `true` khi đường găng đi qua ÍT NHẤT một đoạn chờ-máy.
 *
 * Đây là câu mà giao diện phải nói ra thành chữ. Một người chơi thấy đường găng
 * tô sáng sẽ đi rút ngắn các stage trên đó — nhưng nếu đoạn quyết định là một
 * cạnh `resourceEdge` thì thứ phải sửa là **số máy**, và không có cách nào đoán
 * ra điều đó từ hình vẽ.
 */
export function criticalHasResourceWait(edges: readonly CicdResolvedEdge[]): boolean {
  return edges.some((e) => e.edge.critical && e.edge.resourceEdge);
}

// ═══════════════════════════════════════════════════════════════════════════
// Dải môi trường — chương CD (D.2.8)
// ═══════════════════════════════════════════════════════════════════════════

export interface EnvBand {
  readonly band: number;
  readonly label: string;
  /** Tâm dải, px. */
  readonly y: number;
}

/**
 * Ba (hay N) dải môi trường của chương CD, suy từ chính các node.
 *
 * ⛔ Không có bảng `['dev','staging','prod']` nào ở đây, cùng lý do
 * `scene-contract.ts` đã ghi: `EnvironmentId` là chuỗi tự do của level, nên ghim
 * ba tên đó biến một quy ước đặt tên thành luật và một level đặt tên `canary`
 * rơi ra ngoài trong im lặng.
 *
 * Trả mảng RỖNG ở chương CI — ở đó Y là thời gian chờ, và vẽ "dải môi trường"
 * lên một trục thời gian là dạy sai đúng cái quyết định #13 lập ra để tránh.
 */
export function envBands(
  nodes: readonly CicdPlacedNode[],
  axes: SceneAxes,
): readonly EnvBand[] {
  if (axes.vertical !== 'y') return [];
  const byBand = new Map<number, { label: string; y: number }>();
  for (const n of nodes) {
    const band = n.spot.band;
    if (byBand.has(band)) continue;
    const env = n.node.environment;
    byBand.set(band, {
      label: env ?? 'chưa phát hành',
      y: PAD_TOP + n.spot.y * V_STEP_CD,
    });
  }
  return [...byBand.entries()]
    .map(([band, v]) => ({ band, label: v.label, y: round(v.y) }))
    .sort((a, b) => a.band - b.band);
}

/**
 * `true` khi cạnh này là một cú PROMOTE — đi LÊN một dải môi trường.
 *
 * Dùng `spot.points` chứ không dùng `band` của hai đầu: điểm gấp khúc là thứ
 * thật sự được vẽ, và một cạnh promote luôn kết thúc bằng một đoạn thẳng đứng
 * (xem `placeWorkflow`). Ở chương CI hàm này luôn trả `false` vì Y ở đó là thời
 * gian chờ — một job chờ lâu hơn KHÔNG phải một cú promote.
 */
export function isPromotion(edge: CicdResolvedEdge, axes: SceneAxes): boolean {
  if (axes.vertical !== 'y') return false;
  const pts = edge.spot.points;
  const first = pts[0];
  const last = pts.at(-1);
  if (first === undefined || last === undefined) return false;
  return last.y > first.y;
}

// ═══════════════════════════════════════════════════════════════════════════
// Bàn phím (D.2.9)
// ═══════════════════════════════════════════════════════════════════════════

/** Phím điều hướng giữa các job. Tách khỏi component để test được không cần DOM. */
export type NavKey = 'ArrowRight' | 'ArrowLeft' | 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

export function isNavKey(key: string): key is NavKey {
  return (
    key === 'ArrowRight' ||
    key === 'ArrowLeft' ||
    key === 'ArrowDown' ||
    key === 'ArrowUp' ||
    key === 'Home' ||
    key === 'End'
  );
}

/**
 * Job kế tiếp khi bấm một phím điều hướng. `null` = không đi đâu (giữ nguyên
 * chỗ đang đứng, KHÔNG nhảy về đầu).
 *
 * `→` / `←` đi **theo cạnh** — đó là quan hệ mà game dạy, nên bàn phím phải đi
 * được dọc nó chứ không chỉ đi theo thứ tự đọc. Không có cạnh thì rơi về node
 * kế tiếp theo thứ tự ngang, để không bao giờ có ngõ cụt.
 *
 * `↑` / `↓` đi sang làn/dải kề, ưu tiên node gần nhất theo trục ngang.
 *
 * Cạnh `resourceEdge` **cũng đi được**: nó là một quan hệ có thật ("thằng này
 * đang giữ máy của thằng kia") và bỏ nó ra khỏi bàn phím là làm người dùng bàn
 * phím không tới được một phần đồ thị mà chuột tới được.
 */
export function navigateFrom(
  nodes: readonly CicdPlacedNode[],
  edges: readonly CicdResolvedEdge[],
  currentId: string,
  key: NavKey,
  axes: SceneAxes,
): string | null {
  if (nodes.length === 0) return null;

  const ordered = [...nodes].sort((a, b) => {
    const [ax, ay] = scenePx(a.spot, axes);
    const [bx, by] = scenePx(b.spot, axes);
    return ax - bx || ay - by || (a.id < b.id ? -1 : 1);
  });

  const firstNode = ordered[0];
  const lastNode = ordered.at(-1);
  if (key === 'Home') return firstNode?.id ?? null;
  if (key === 'End') return lastNode?.id ?? null;

  const index = ordered.findIndex((n) => n.id === currentId);
  if (index < 0) return firstNode?.id ?? null;
  const current = ordered[index];
  if (current === undefined) return null;

  if (key === 'ArrowRight' || key === 'ArrowLeft') {
    const forward = key === 'ArrowRight';
    const linked = edges
      .filter((e) => (forward ? e.edge.from === currentId : e.edge.to === currentId))
      .map((e) => (forward ? e.edge.to : e.edge.from));
    const candidates = ordered.filter((n) => linked.includes(n.id));
    const viaEdge = forward ? candidates[0] : candidates.at(-1);
    if (viaEdge !== undefined) return viaEdge.id;
    const fallback = ordered[index + (forward ? 1 : -1)];
    return fallback?.id ?? null;
  }

  // ↑ / ↓ — node gần nhất theo chiều dọc, ưu tiên cùng cột.
  const [cx, cy] = scenePx(current.spot, axes);
  const down = key === 'ArrowDown';
  let best: { id: string; cost: number } | null = null;
  for (const n of ordered) {
    if (n.id === currentId) continue;
    const [nx, ny] = scenePx(n.spot, axes);
    const dy = ny - cy;
    if (down ? dy <= 0.01 : dy >= -0.01) continue;
    const cost = Math.abs(dy) + Math.abs(nx - cx) * 2;
    if (best === null || cost < best.cost) best = { id: n.id, cost };
  }
  return best?.id ?? null;
}
