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
/**
 * Độ cao NGHỈ của pod trên mặt bệ (§9.2 "lơ lửng rất nhẹ") — không phải biên độ bồng bềnh.
 *
 * ⚠ Giá trị cũ 0.34 bằng 57% chiều cao của chính pod (`POD_SIZE` 0.6), và trên
 * màn hình nó KHÔNG đọc ra là "lơ lửng nhẹ" mà là "pod rời khỏi node" — đo trực
 * tiếp 2026-09-08 ở `/games/k8s` level 1: khối pod tách hẳn khỏi mặt bệ trong
 * khi bóng của nó vẫn đổ đúng trên bệ, nên một khung hình chứa hai thông tin
 * mâu thuẫn nhau.
 *
 * SÀN của giá trị này là `BOB_AMPLITUDE` (0.045, `scene-motion.ts`): thấp hơn
 * biên độ bồng bềnh thì đáy pod chui vào trong bệ ở nửa dưới mỗi chu kỳ thở.
 * 0.06 chừa đúng khoảng an toàn đó và không hơn.
 */
export const POD_HOVER = 0.06;

const SHELF_Z = -3.6;
const SHELF_SPACING = 1.35;
const SHELF_Y = 0.23;
const SHELF_SIZE = 0.52;

const PENDING_Z = 3.7;
const PENDING_SPACING = 0.92;
const PENDING_Y = 0.23;
const PENDING_SIZE = 0.52;

/**
 * Vùng trên mặt bệ dành cho pod: tâm và chiều sâu.
 *
 * Bệ sâu `PLATFORM_DEPTH` và tâm ở `z = 0`, nhưng mô hình tủ máy chủ chiếm phần
 * SAU, nên pod chỉ có phần trước. Hai hằng này ghim đúng phần đó, và `podGrid`
 * đọc chúng để bước lưới không bao giờ đẩy hàng cuối ra khỏi bệ.
 */
const POD_ZONE_CENTER_Z = 0.5;
const POD_ZONE_DEPTH = 1.7;

/** Tủ máy chủ lùi hẳn ra sau, nhường phần trước của bệ cho pod. */
const RACK_Z = -1.0;

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
export function podGrid(count: number): {
  readonly cols: number;
  readonly rows: number;
  readonly pitch: number;
} {
  if (count <= 0) {
    return { cols: 0, rows: 0, pitch: 0 };
  }
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const usableX = PLATFORM_WIDTH - PLATFORM_PADDING * 2;
  const preferred = POD_SIZE + POD_GAP_PREFERRED;
  const fittedX = cols > 1 ? (usableX - POD_SIZE) / (cols - 1) : preferred;
  /*
   * Bước lưới phải vừa cả CHIỀU SÂU, không chỉ chiều ngang.
   *
   * Bản trước chỉ tính theo chiều ngang, nên hàng pod thứ hai rơi ra NGOÀI mép
   * trước của bệ — đo trực tiếp ở level 13: pod đứng lửng lơ cạnh bệ trong khi
   * dây `runs-on` vẫn nối vào node, tức một khung hình nói hai điều trái nhau.
   */
  const fittedZ = rows > 1 ? (POD_ZONE_DEPTH - POD_SIZE) / (rows - 1) : preferred;
  const pitch = Math.max(POD_SIZE + POD_GAP_MIN, Math.min(preferred, fittedX, fittedZ));
  return { cols, rows, pitch };
}

/**
 * Pod đứng GIỮA vùng dành cho pod trên mặt bệ, căn giữa theo cả hai trục.
 *
 * Bản trước neo vào `z = 1.3 + row · pitch` — một mép cố định ở phía trước. Với
 * một hàng thì pod đã nằm ngay mép bệ; với hai hàng thì hàng sau rơi hẳn ra
 * ngoài. Căn giữa thì lưới lớn nhỏ thế nào cũng ở trong bệ, và bệ trông như cái
 * khay đựng chứ không như cái mép để pod rơi khỏi.
 */
function placePodsOnPlatform(
  pods: readonly ObjectView[],
  platformCenterX: number,
): ObjectPlacement[] {
  const { cols, rows, pitch } = podGrid(pods.length);
  const top = PLATFORM_HEIGHT + 0.01;
  return pods.map((pod, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      uid: pod.uid,
      zone: 'node' as const,
      position: {
        x: platformCenterX + (col - (cols - 1) / 2) * pitch,
        y: top,
        z: POD_ZONE_CENTER_Z + (row - (rows - 1) / 2) * pitch,
      },
      size: POD_SIZE,
    };
  });
}

/**
 * Xếp một nhóm thành LƯỚI có bề ngang giới hạn, căn giữa quanh gốc.
 *
 * ⚠ Bản trước là `placeInRow`: một hàng thẳng KHÔNG có giới hạn bề ngang. Hai
 * mươi ConfigMap kéo thành một vệt rộng 27 đơn vị, camera phải lùi ra xa để ôm
 * hết, và chính cụm — thứ người chơi cần nhìn — co lại còn một nhúm ở giữa
 * khung. Mỗi món trên vệt đó lại kéo một sợi dây vắt ngang cả cảnh.
 *
 * Lưới thì bề ngang có trần, nên bán kính cảnh tăng theo `sqrt(n)` thay vì theo
 * `n`, và dây ngắn lại theo.
 */
function placeInGrid(
  items: readonly ObjectView[],
  spacing: number,
  y: number,
  z: number,
  size: number,
  zone: PlacementZone,
  maxWidth: number,
  /** `+1` xếp các hàng phụ ra xa gốc, `−1` xếp lại gần. */
  rowDirection: number,
): ObjectPlacement[] {
  if (items.length === 0) {
    return [];
  }
  const cols = Math.max(1, Math.min(items.length, Math.floor(maxWidth / spacing)));
  return items.map((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Hàng cuối thường không đầy; căn giữa RIÊNG nó để lưới không lệch hẳn sang trái.
    const inRow = Math.min(cols, items.length - row * cols);
    return {
      uid: item.uid,
      zone,
      position: {
        x: (col - (inRow - 1) / 2) * spacing,
        y,
        z: z + row * spacing * rowDirection,
      },
      size,
    };
  });
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
  /*
   * Kệ sắp theo LOẠI rồi mới tới tên, không sắp theo `uid`.
   *
   * `uid` là ngẫu nhiên, nên ba Service và ba ConfigMap nằm xen kẽ nhau dọc kệ,
   * và mỗi sợi dây phải vắt qua vài món không liên quan để tới đích. Gom theo
   * loại thì các món cùng họ đứng liền nhau, dây đi thẳng hơn, và người chơi
   * quét mắt tìm "chỗ để ConfigMap" thay vì đọc từng nhãn.
   *
   * Vẫn TẤT ĐỊNH — điều kiện thật sự mà chú thích của `byUid` nói tới: `kind` và
   * `name` của một object không đổi qua các tick, nên vị trí vẫn bất biến.
   */
  const others = [...view.objects.filter((o) => o.kind !== 'Pod' && o.kind !== 'Node')].sort(
    (a, b) => (a.kind === b.kind ? byName(a, b) : a.kind < b.kind ? -1 : 1),
  );

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
  for (const object of view.objects.filter((object) => object.kind === 'Node')) {
    objects.push({
      uid: object.uid,
      zone: 'node',
      position: { x: nodeX.get(object.name) ?? 0, y: 0.43, z: RACK_Z },
      size: 0.95,
    });
  }
  for (const node of nodes) {
    objects.push(...placePodsOnPlatform(scheduled.get(node.name) ?? [], node.position.x));
  }
  /*
   * Bề ngang của kệ và dải chờ bám theo bề ngang của hàng bệ, không phải một số
   * cố định: cụm một node thì kệ hẹp, cụm bốn node thì kệ rộng ra theo. Sàn
   * `PLATFORM_WIDTH * 2` để cụm một node vẫn có chỗ cho vài món trên một hàng.
   */
  const clusterWidth = Math.max(PLATFORM_WIDTH * 2, nodes.length * (PLATFORM_WIDTH + PLATFORM_GAP));
  objects.push(
    ...placeInGrid(
      pending,
      PENDING_SPACING,
      PENDING_Y,
      PENDING_Z,
      PENDING_SIZE,
      'pending',
      clusterWidth,
      1,
    ),
  );
  objects.push(
    ...placeInGrid(others, SHELF_SPACING, SHELF_Y, SHELF_Z, SHELF_SIZE, 'shelf', clusterWidth, -1),
  );

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
