/**
 * Bố cục 3D — TOÁN THUẦN, không `three`, không DOM.
 *
 * Tách khỏi `k8s-scene-lazy.tsx` vì đây là phần DUY NHẤT của renderer kiểm được
 * mà không cần WebGL. Vị trí của mọi vật là một hàm thuần của `ClusterView`, nên
 * nó test được ở env `node`, chạy trong mili-giây, và một lỗi bố cục (pod chồng
 * lên nhau, pod chưa xếp lịch rơi nhầm lên bệ) đỏ ở đây chứ không đợi ai đó nhìn
 * ảnh chụp màn hình.
 *
 * ⛔ File này KHÔNG được `import 'three'`. Nó nằm NGOÀI chunk lazy (§4.3); một
 * import lạc ở đây kéo `three` vào bundle của mọi trang và làm đỏ ô AC bundle.
 */

import type { ClusterView, EdgeView, NodeView, ObjectView } from '@devops-platform/games';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Bệ nâng của một node. */
export interface NodePlacement {
  readonly name: string;
  readonly ready: boolean;
  readonly cpuUsed: number;
  readonly memoryUsed: number;
  readonly position: Vec3;
  readonly width: number;
  readonly depth: number;
}

/** Vùng một object được đặt vào — quyết định cả hình dạng lẫn ý nghĩa. */
export type PlacementZone =
  /** Pod đã xếp lịch: đứng trên bệ của node. */
  | 'node'
  /** Pod chưa xếp lịch (`nodeName === null`): dải chờ phía TRƯỚC, không có bệ dưới chân. */
  | 'pending'
  /** Không phải Pod (Service, ConfigMap, PVC…): kệ phía sau. */
  | 'shelf';

export interface ObjectPlacement {
  readonly uid: string;
  readonly zone: PlacementZone;
  readonly position: Vec3;
  readonly size: number;
}

export interface EdgePlacement {
  readonly fromUid: string;
  readonly toUid: string;
  readonly kind: EdgeView['kind'];
  readonly healthy: boolean;
}

export interface SceneLayout {
  readonly nodes: readonly NodePlacement[];
  readonly objects: readonly ObjectPlacement[];
  /** Chỉ giữ cạnh mà CẢ HAI đầu có mặt trong `objects` — một cạnh cụt không vẽ được. */
  readonly edges: readonly EdgePlacement[];
  /** Bán kính bao toàn cảnh. Camera dùng để đóng khung, fog dùng để đặt mép xa. */
  readonly radius: number;
}

// ── Hằng số hình học ────────────────────────────────────────────────────────
// Đơn vị world. Chọn quanh 1 đơn vị ≈ 1 mét để giá trị mặc định của ánh sáng và
// shadow camera trong three rơi đúng khoảng chúng được chỉnh cho.

export const PLATFORM_WIDTH = 3.2;
export const PLATFORM_DEPTH = 3.2;
export const PLATFORM_HEIGHT = 0.26;
export const PLATFORM_GAP = 1.15;
/** Mép trong của bệ — pod không đặt sát rìa, nếu không bóng đổ bị cắt cụt ở cạnh. */
const PLATFORM_PADDING = 0.42;

export const POD_SIZE = 0.6;
const POD_GAP_MIN = 0.16;
const POD_GAP_PREFERRED = 0.34;
/** Độ cao NGHỈ của pod trên mặt bệ (§9.2 "lơ lửng rất nhẹ") — không phải biên độ bồng bềnh. */
export const POD_HOVER = 0.34;

const SHELF_Z = -3.6;
const SHELF_SPACING = 1.35;
const SHELF_Y = 0.95;
const SHELF_SIZE = 0.52;

const PENDING_Z = 3.7;
const PENDING_SPACING = 0.92;
const PENDING_Y = 0.42;
const PENDING_SIZE = 0.52;

/**
 * ⚠ Thứ tự đầu vào KHÔNG được quyết định vị trí.
 *
 * Lane B tự do đổi thứ tự `objects[]` giữa hai tick. Nếu vị trí bám theo chỉ số
 * mảng thì cả cảnh nhảy chỗ mỗi lần một pod bị xoá — trông như lỗi vẽ, và làm
 * mọi chuyển tiếp §9.3 vô nghĩa vì không còn phân biệt được "vật đang di chuyển"
 * với "vật vừa đổi chỗ trong mảng".
 *
 * Sắp theo `uid` là ràng buộc duy nhất giữ vị trí bất biến qua các tick.
 */
function byUid(a: { readonly uid: string }, b: { readonly uid: string }): number {
  return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
}

function byName(a: { readonly name: string }, b: { readonly name: string }): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** Toạ độ X của bệ thứ `index` trong hàng `total` bệ, căn giữa quanh gốc. */
export function platformX(index: number, total: number): number {
  const pitch = PLATFORM_WIDTH + PLATFORM_GAP;
  return (index - (total - 1) / 2) * pitch;
}

/**
 * Xếp `count` pod thành lưới trên mặt bệ.
 *
 * Số cột lấy `ceil(sqrt(count))` để lưới gần vuông — một hàng dài 9 pod trên bệ
 * vuông trông như tràn ra ngoài. Bước lưới co lại khi đông nhưng có SÀN
 * (`POD_GAP_MIN`): dưới sàn đó pod dính nhau và không đếm được bằng mắt, lúc ấy
 * thà để tràn nhẹ ra mép bệ còn hơn vẽ ra một khối đặc.
 */
export function podGrid(count: number): { readonly cols: number; readonly rows: number; readonly pitch: number } {
  if (count <= 0) {
    return { cols: 0, rows: 0, pitch: 0 };
  }
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const usable = PLATFORM_WIDTH - PLATFORM_PADDING * 2;
  const preferred = POD_SIZE + POD_GAP_PREFERRED;
  const fitted = cols > 1 ? (usable - POD_SIZE) / (cols - 1) : preferred;
  const pitch = Math.max(POD_SIZE + POD_GAP_MIN, Math.min(preferred, fitted));
  return { cols, rows, pitch };
}

function placePodsOnPlatform(pods: readonly ObjectView[], platformCenterX: number): ObjectPlacement[] {
  const { cols, rows, pitch } = podGrid(pods.length);
  const top = PLATFORM_HEIGHT / 2 + POD_SIZE / 2 + POD_HOVER;
  return pods.map((pod, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      uid: pod.uid,
      zone: 'node' as const,
      position: {
        x: platformCenterX + (col - (cols - 1) / 2) * pitch,
        y: top,
        z: (row - (rows - 1) / 2) * pitch,
      },
      size: POD_SIZE,
    };
  });
}

function placeInRow(
  items: readonly ObjectView[],
  spacing: number,
  y: number,
  z: number,
  size: number,
  zone: PlacementZone,
): ObjectPlacement[] {
  return items.map((item, i) => ({
    uid: item.uid,
    zone,
    position: { x: (i - (items.length - 1) / 2) * spacing, y, z },
    size,
  }));
}

function placeNodes(nodes: readonly NodeView[]): NodePlacement[] {
  const sorted = [...nodes].sort(byName);
  return sorted.map((node, i) => ({
    name: node.name,
    ready: node.ready,
    cpuUsed: node.cpuUsed,
    memoryUsed: node.memoryUsed,
    position: { x: platformX(i, sorted.length), y: 0, z: 0 },
    width: PLATFORM_WIDTH,
    depth: PLATFORM_DEPTH,
  }));
}

/**
 * `ClusterView` → toạ độ. Hàm thuần: cùng đầu vào ⇒ cùng đầu ra, luôn luôn.
 *
 * Ba vùng, và ranh giới giữa chúng là một quyết định dạy học chứ không phải tiện
 * tay: Pod có node thì đứng trên bệ node đó; Pod chưa xếp lịch xuống dải chờ phía
 * TRƯỚC (nhìn là biết ngay "chưa ai nhận"); mọi loại còn lại lên kệ phía sau vì
 * chúng là object logic, không chạy trên một máy cụ thể nào. Vẽ một Service đứng
 * trên một node là dạy sai mô hình Kubernetes.
 */
export function computeLayout(view: ClusterView): SceneLayout {
  const nodes = placeNodes(view.nodes);
  const nodeX = new Map(nodes.map((n) => [n.name, n.position.x]));

  const pods = [...view.objects.filter((o) => o.kind === 'Pod')].sort(byUid);
  const others = [...view.objects.filter((o) => o.kind !== 'Pod')].sort(byUid);

  const scheduled = new Map<string, ObjectView[]>();
  const pending: ObjectView[] = [];
  for (const pod of pods) {
    /*
     * Pod trỏ tới một node KHÔNG có trong `view.nodes` cũng rơi vào dải chờ.
     * Đó là trạng thái thật (node vừa rời cụm), và nếu để lọt thì toạ độ X thành
     * `undefined` → `NaN`. NaN trong ma trận của three KHÔNG ném: vật chỉ lặng lẽ
     * biến mất khỏi khung hình, và không có gì trong log nói tại sao.
     */
    const name = pod.nodeName;
    if (name !== null && nodeX.has(name)) {
      const bucket = scheduled.get(name);
      if (bucket === undefined) {
        scheduled.set(name, [pod]);
      } else {
        bucket.push(pod);
      }
    } else {
      pending.push(pod);
    }
  }

  const objects: ObjectPlacement[] = [];
  for (const node of nodes) {
    objects.push(...placePodsOnPlatform(scheduled.get(node.name) ?? [], node.position.x));
  }
  objects.push(...placeInRow(pending, PENDING_SPACING, PENDING_Y, PENDING_Z, PENDING_SIZE, 'pending'));
  objects.push(...placeInRow(others, SHELF_SPACING, SHELF_Y, SHELF_Z, SHELF_SIZE, 'shelf'));

  const known = new Set(objects.map((o) => o.uid));
  const edges = view.edges
    .filter((e) => known.has(e.fromUid) && known.has(e.toUid))
    .map((e) => ({ fromUid: e.fromUid, toUid: e.toUid, kind: e.kind, healthy: e.healthy }));

  let radius = PLATFORM_WIDTH;
  for (const o of objects) {
    radius = Math.max(radius, Math.hypot(o.position.x, o.position.z) + o.size);
  }
  for (const n of nodes) {
    radius = Math.max(radius, Math.abs(n.position.x) + PLATFORM_WIDTH / 2);
  }

  return { nodes, objects, edges, radius };
}
