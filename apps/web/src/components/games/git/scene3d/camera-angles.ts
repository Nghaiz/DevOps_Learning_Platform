/**
 * Toán camera orthographic cho tầng 3D game Git (K.1 + K.9) — **thuần, không một
 * dòng `three`**.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO TÁCH RA KHỎI COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cùng ba lý do mà `scene3d-contract.ts` đã ghi cho phép đặt chỗ, cộng một lý
 * do riêng của camera: **"khung-toàn-bộ có thật sự chứa trọn cảnh không" là một
 * câu hỏi trả lời được bằng số**, và nó là câu hỏi camera dễ sai nhất. Chôn
 * phép chiếu trong một `useFrame` thì không cổng nào kiểm được; để ở đây thì
 * test chạy env `node` khẳng định được cho CẢ TÁM góc rằng không một đỉnh nào
 * của hộp bao rơi ra ngoài khung.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ `zoom` Ở ĐÂY LÀ SỐ PIXEL TRÊN MỘT ĐƠN VỊ WORLD — KHÔNG PHẢI MỘT HỆ SỐ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Camera orthographic của three có khung nhìn định bởi `left/right/top/bottom`,
 * còn `zoom` chia đều bốn số đó. `ortho-camera-rig.tsx` khai khung nhìn ĐÚNG
 * bằng kích thước canvas tính bằng pixel (`width/-2 … width/2`), nên
 * `zoom = 1` nghĩa là 1 đơn vị world vẽ ra 1 pixel, và `frameZoom()` dưới đây
 * trả về đúng số pixel-trên-đơn-vị cần để ôm trọn hộp bao.
 *
 * Nếu ai đó đổi khung nhìn của rig sang một hệ khác (ví dụ `-aspect … aspect`)
 * thì MỌI con số ở file này sai theo — và sai một cách im lặng, vì cảnh vẫn vẽ
 * ra, chỉ ở sai tỉ lệ. Hai chỗ đó là một cặp, đừng tách.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ KHOẢNG CÁCH KHÔNG ĐỔI ĐỘ LỚN — ĐỪNG "SỬA" `frameDistance()`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Với phép chiếu song song, dời camera ra xa KHÔNG làm vật nhỏ đi. Phản xạ từ
 * camera phối cảnh ("cảnh bị cắt mất, lùi ra xa thêm") ở đây chỉ đổi xem cái gì
 * còn nằm giữa `near` và `far`. Muốn thu nhỏ thì giảm `zoom`, và chỉ có `zoom`.
 */

import { NODE_RADIUS, type Scene3DPlacement, type Vec3 } from './scene3d-contract.ts';
import { sceneNodeId } from '../../shared/scene-props.ts';
import type { SceneNodeId, SceneRefBadge, SceneRepo, SceneView } from '../../shared/scene-props.ts';

/** Hộp bao của cảnh. Lấy nguyên hình dạng của hợp đồng, không khai lại. */
export type Scene3DBounds = Scene3DPlacement['bounds'];

// ═══════════════════════════════════════════════════════════════════════════
// Tập góc nhìn cố định
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tám góc quanh trục Y, mỗi góc 45 độ.
 *
 * Tám chứ không phải bốn vì bốn góc chính (0/90/180/270) đều là góc NHÌN THẲNG
 * vào một mặt: ở 0 và 180 thì trục Z (làn nhánh) chạy thẳng vào mắt và các làn
 * chồng khít lên nhau; ở 90 và 270 thì đến lượt trục X (thời gian logic) biến
 * mất. Bốn góc chéo là những góc duy nhất đọc được cả ba trục cùng lúc, nên
 * chúng phải có mặt — mà đã có chúng thì bước 45 độ là bước tự nhiên.
 *
 * Cũng không nhiều hơn tám: người chơi đổi góc bằng cách bấm liên tiếp, và một
 * vòng 16 bước biến "quay ra mặt sau" thành tám lần bấm.
 */
export const ANGLE_COUNT = 8;

/** Bước phương vị giữa hai góc liền nhau, radian. */
export const AZIMUTH_STEP_RAD = (Math.PI * 2) / ANGLE_COUNT;

/**
 * Góc nghiêng CỐ ĐỊNH, radian. Không có cách nào đổi nó lúc chạy — đó là chủ ý.
 *
 * 30 độ là góc thấp nhất còn tách được các làn theo trục Z trên màn hình; cao
 * hơn nữa (nhìn từ trên xuống) thì trục Y — độ lệch khỏi nhánh chính — dẹp lại
 * thành không, mà Y là thứ mang nghĩa "nhánh phụ dâng lên" của hợp đồng.
 */
export const ELEVATION_RAD = (30 * Math.PI) / 180;

/**
 * Góc mở màn: chỉ số 1, tức phương vị 45 độ.
 *
 * Không phải 0. Ở chỉ số 0 camera nhìn thẳng dọc trục Z và mọi làn nhánh xếp
 * chồng lên nhau — đúng cảnh tệ nhất để mở màn một đồ thị nhiều nhánh.
 */
export const DEFAULT_ANGLE_INDEX = 1;

// ═══════════════════════════════════════════════════════════════════════════
// Chỉ số góc — quay vòng
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bước một chỉ số vòng quanh một danh sách độ dài `length`.
 *
 * Một hàm cho cả góc camera lẫn danh sách ref: phép quay vòng an toàn với số âm
 * (`% ` của JS giữ dấu, nên `-1 % 8` là `-1` chứ không phải `7`) là chỗ dễ sai,
 * và sai thì lộ ra ở đúng MỘT biên — biên mà một test viết vội không chạm tới.
 */
export function cycleIndex(current: number, length: number, direction: number): number {
  if (length <= 0) return 0;
  const base = Number.isFinite(current) ? Math.trunc(current) : 0;
  const step = direction < 0 ? -1 : 1;
  return (((base + step) % length) + length) % length;
}

/**
 * Đưa một chỉ số bất kỳ về `[0, ANGLE_COUNT)`. Đầu vào không hữu hạn thì về góc
 * mở màn.
 *
 * ⚠ Cộng rồi chia dư LẦN NỮA, chứ không phải `wrapped < 0 ? wrapped + N`. Bản
 * đó trả về `-0` cho mọi bội số âm của `ANGLE_COUNT` (`-8 % 8` là `-0`, và
 * `-0 < 0` là `false` nên không nhánh nào sửa) — `-0` bằng `0` với `===` nhưng
 * KHÁC `0` với `Object.is`, tức khác với `toBe(0)`, với `Set`, và với mọi phép
 * so khoá. Test bắt được ngay lượt chạy đầu.
 */
export function normalizeAngleIndex(index: number): number {
  if (!Number.isFinite(index)) return DEFAULT_ANGLE_INDEX;
  return ((Math.trunc(index) % ANGLE_COUNT) + ANGLE_COUNT) % ANGLE_COUNT;
}

export function nextAngle(index: number): number {
  return cycleIndex(normalizeAngleIndex(index), ANGLE_COUNT, 1);
}

export function prevAngle(index: number): number {
  return cycleIndex(normalizeAngleIndex(index), ANGLE_COUNT, -1);
}

/** Phương vị của một góc, radian. */
export function angleAzimuthRad(index: number): number {
  return normalizeAngleIndex(index) * AZIMUTH_STEP_RAD;
}

// ═══════════════════════════════════════════════════════════════════════════
// Hệ trục của camera
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ba vec-tơ đơn vị mô tả một góc nhìn.
 *
 * - `direction` — hướng từ ĐIỂM NGẮM ra CAMERA (ngược chiều nhìn). Vị trí camera
 *   là `điểm ngắm + direction × khoảng cách`.
 * - `right` — trục ngang của màn hình, trong toạ độ world.
 * - `up` — trục dọc của màn hình, trong toạ độ world.
 *
 * `right`/`up` là thứ phép chiếu dùng; chúng KHÔNG suy được từ `direction` một
 * cách duy nhất nếu không cố định trục đứng thế giới, nên chúng ở cùng một chỗ
 * với `direction` thay vì được tính lại ở mỗi bên gọi.
 */
export interface CameraBasis {
  readonly direction: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
}

export function cameraBasis(index: number): CameraBasis {
  const azimuth = angleAzimuthRad(index);
  const sinAz = Math.sin(azimuth);
  const cosAz = Math.cos(azimuth);
  const sinEl = Math.sin(ELEVATION_RAD);
  const cosEl = Math.cos(ELEVATION_RAD);

  // Suy từ `cross(trụcĐứngThếGiới, direction)` rồi chuẩn hoá — với trục đứng
  // (0,1,0) thì kết quả rút gọn còn đúng hai thành phần, nên không cần một phép
  // `cross` tổng quát chỉ để chia lại cho `cos(el)`.
  return {
    direction: [sinAz * cosEl, sinEl, cosAz * cosEl],
    right: [cosAz, 0, -sinAz],
    up: [-sinEl * sinAz, cosEl, -sinEl * cosAz],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Hộp bao
// ═══════════════════════════════════════════════════════════════════════════

export function boundsCenter(bounds: Scene3DBounds): Vec3 {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

/** Tám đỉnh của hộp bao. Thứ tự không mang nghĩa; bên gọi chỉ duyệt hết. */
export function boundsCorners(bounds: Scene3DBounds): readonly Vec3[] {
  const out: Vec3[] = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        out.push([x, y, z]);
      }
    }
  }
  return out;
}

export function boundsDiagonal(bounds: Scene3DBounds): number {
  const dx = bounds.max[0] - bounds.min[0];
  const dy = bounds.max[1] - bounds.min[1];
  const dz = bounds.max[2] - bounds.min[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Lề an toàn giữa mặt phẳng `near` và đỉnh gần nhất của cảnh.
 *
 * Cảnh rỗng có hộp bao suy biến về một điểm, và khi đó đường chéo bằng 0 — nếu
 * khoảng cách cũng về 0 thì camera nằm ĐÚNG trên điểm ngắm và three không dựng
 * nổi ma trận nhìn. Số hạng cộng này giữ cho trường hợp suy biến vẫn hợp lệ.
 */
export const FRAME_DISTANCE_MARGIN = 4;

/**
 * Khoảng cách đặt camera. Xem khối cảnh báo ở đầu file: con số này KHÔNG đổi độ
 * lớn của cảnh, nó chỉ quyết định cảnh có nằm lọt giữa `near` và `far` không.
 */
export function frameDistance(bounds: Scene3DBounds): number {
  return boundsDiagonal(bounds) + FRAME_DISTANCE_MARGIN;
}

export const CAMERA_NEAR = 0.1;

/** `far` đủ ôm cả hộp bao kể cả khi điểm ngắm nằm ở một góc của nó. */
export function cameraFar(bounds: Scene3DBounds): number {
  return frameDistance(bounds) * 2 + boundsDiagonal(bounds);
}

/** Vị trí camera cho một góc và một điểm ngắm. */
export function cameraPosition(index: number, target: Vec3, distance: number): Vec3 {
  const { direction } = cameraBasis(index);
  return [
    target[0] + direction[0] * distance,
    target[1] + direction[1] * distance,
    target[2] + direction[2] * distance,
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// Khung-toàn-bộ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Nửa bề rộng tối thiểu của cảnh, đơn vị world.
 *
 * Cảnh rỗng (`place3d` trả hộp bao suy biến) cho bề rộng 0, và `zoom` khi đó là
 * vô cực — một `Infinity` đi thẳng vào ma trận chiếu, nơi nó biến thành `NaN` và
 * xoá sạch khung hình mà không báo gì. Lấy bán kính một ô commit làm sàn: cảnh
 * một commit duy nhất cũng phải nhìn ra được.
 */
export const MIN_HALF_EXTENT = NODE_RADIUS;

/** Chừa lề quanh cảnh khi khung-toàn-bộ. Cảnh chạm sát mép đọc như bị cắt. */
export const FRAME_FILL = 0.86;

/** Toạ độ MÀN HÌNH (đơn vị world, gốc ở điểm ngắm) của một điểm. */
export function projectToScreen(
  point: Vec3,
  center: Vec3,
  index: number,
): readonly [number, number] {
  const { right, up } = cameraBasis(index);
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  const dz = point[2] - center[2];
  return [dx * right[0] + dy * right[1] + dz * right[2], dx * up[0] + dy * up[1] + dz * up[2]];
}

export interface ScreenExtent {
  readonly halfWidth: number;
  readonly halfHeight: number;
}

/** Nửa kích thước của hình chiếu hộp bao lên mặt phẳng màn hình, đơn vị world. */
export function screenExtent(bounds: Scene3DBounds, index: number): ScreenExtent {
  const center = boundsCenter(bounds);
  let halfWidth = 0;
  let halfHeight = 0;
  for (const corner of boundsCorners(bounds)) {
    const [u, v] = projectToScreen(corner, center, index);
    halfWidth = Math.max(halfWidth, Math.abs(u));
    halfHeight = Math.max(halfHeight, Math.abs(v));
  }
  return {
    halfWidth: Math.max(halfWidth, MIN_HALF_EXTENT),
    halfHeight: Math.max(halfHeight, MIN_HALF_EXTENT),
  };
}

/** Kích thước khung vẽ, đơn vị pixel. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * `zoom` để toàn bộ hộp bao lọt trong khung vẽ, đã chừa lề.
 *
 * Lấy `min` của hai tỉ lệ chứ không phải tỉ lệ theo chiều dài hơn: khung vẽ hẹp
 * và cảnh rộng thì chiều ngang mới là chiều ràng buộc, và chọn nhầm chiều làm
 * cảnh tràn ra ngoài đúng ở khổ màn hình mà người ta hay dùng nhất.
 */
export function frameZoom(
  bounds: Scene3DBounds,
  index: number,
  viewport: Viewport,
  fill: number = FRAME_FILL,
): number {
  const { halfWidth, halfHeight } = screenExtent(bounds, index);
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  return Math.min(width / (2 * halfWidth), height / (2 * halfHeight)) * fill;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phóng của người chơi
// ═══════════════════════════════════════════════════════════════════════════

/** Hệ số nhân mỗi bước phóng. Nhân chứ không cộng — phóng là thang loga. */
export const ZOOM_STEP = 1.25;
export const MIN_ZOOM_SCALE = 0.35;
export const MAX_ZOOM_SCALE = 4;

export function clampZoomScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_ZOOM_SCALE, Math.max(MIN_ZOOM_SCALE, scale));
}

export function stepZoomScale(scale: number, direction: number): number {
  const base = clampZoomScale(scale);
  return clampZoomScale(direction < 0 ? base / ZOOM_STEP : base * ZOOM_STEP);
}

// ═══════════════════════════════════════════════════════════════════════════
// Giảm chấn độc lập nhịp khung hình
// ═══════════════════════════════════════════════════════════════════════════

/** Tốc độ giảm chấn của chuyển cảnh camera. */
export const CAMERA_DAMP_RATE = 4.2;

/**
 * Phần đường còn lại đi được trong `dt` giây.
 *
 * `1 - exp(-dt·k)` chứ không phải một hằng số: với hằng số, một máy chạy 120fps
 * bay tới nơi nhanh gấp đôi một máy chạy 60fps, và "nhanh gấp đôi" ở đây là một
 * cảm giác khác hẳn chứ không phải một sai số.
 *
 * Tính chất kiểm được: `(1 - f(dt/2))² = 1 - f(dt)`, tức chia một khung thành
 * hai nửa cho ra ĐÚNG cùng một chỗ. Test khẳng định đẳng thức đó — đó là định
 * nghĩa của "độc lập nhịp khung hình", không phải một lời hứa.
 *
 * ⚠ Lấy bản sao ở đây thay vì import `k8s-arena/shared/scene-motion.ts`: file đó
 * KHÔNG export hệ số giảm chấn (arena tính thẳng trong `useFrame`), và kéo một
 * cạnh phụ thuộc từ `games/git` sang `k8s-arena` chỉ để dùng `lerp` là đúng
 * hình dạng đã làm rò 631KB engine sang 6 route ở P17. Chỗ đúng cho một bản
 * dùng chung là `games/shared/` — đã ghi trong báo cáo lane.
 */
export function dampFactor(dtSeconds: number, rate: number = CAMERA_DAMP_RATE): number {
  if (!(dtSeconds > 0)) return 0;
  return 1 - Math.exp(-dtSeconds * rate);
}

// ═══════════════════════════════════════════════════════════════════════════
// K.9 — điểm đến của phép teleport
// ═══════════════════════════════════════════════════════════════════════════

/** Một ref đã có chỗ đứng trong không gian — đích của một cú nhảy camera. */
export interface RefTarget {
  /** Khoá ổn định qua các lượt dựng lại: `kho:loại:tên`. */
  readonly key: string;
  readonly name: string;
  readonly kind: SceneRefBadge['kind'];
  readonly repo: SceneRepo;
  readonly isCurrent: boolean;
  readonly id: SceneNodeId;
  readonly position: Vec3;
}

/**
 * Danh sách ref nhảy tới được, đã sắp.
 *
 * Ref nào KHÔNG trỏ tới một commit có chỗ đứng thì bị loại — nhảy camera tới một
 * toạ độ bịa ra là cách chắc chắn nhất để người chơi tin rằng commit đó tồn tại
 * ở đó. Đây cùng một luật giao-chứ-không-hợp mà `sceneNodes()` đã đặt.
 *
 * ⚠ **Thứ tự là một quyết định sản phẩm.** Nhánh HEAD đang đứng xếp TRƯỚC, nên
 * phím `1` luôn đưa người chơi về chỗ họ đang làm việc — thứ họ cần nhất và
 * cũng là thứ họ hay lạc mất nhất sau một cú `checkout`. Sau đó mới tới thứ tự
 * kho rồi tên, để danh sách không đổi chỗ giữa hai lệnh không liên quan.
 */
export function refTargets(view: SceneView, placement: Scene3DPlacement): readonly RefTarget[] {
  const at = new Map(placement.nodes.map((node) => [node.id, node.position]));
  const seen = new Set<string>();
  const out: RefTarget[] = [];

  for (const ref of view.refs) {
    const id = sceneNodeId(ref.repo, ref.oid);
    const position = at.get(id);
    if (position === undefined) continue;
    const key = `${ref.repo}:${ref.kind}:${ref.shortName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      name: ref.shortName,
      kind: ref.kind,
      repo: ref.repo,
      isCurrent: ref.isCurrent,
      id,
      position,
    });
  }

  return out.sort(
    (a, b) =>
      Number(b.isCurrent) - Number(a.isCurrent) ||
      a.repo.localeCompare(b.repo) ||
      a.name.localeCompare(b.name),
  );
}

/** Vị trí của ref mang khoá này, hoặc `null` khi ref đã biến mất khỏi cảnh. */
export function refTargetPosition(targets: readonly RefTarget[], key: string | null): Vec3 | null {
  if (key === null) return null;
  return targets.find((target) => target.key === key)?.position ?? null;
}

/**
 * Khoá của ref kế tiếp theo một chiều, hoặc `null` khi không có ref nào.
 *
 * Ref hiện tại không còn trong danh sách (vừa bị xoá nhánh) thì quay về đầu
 * danh sách thay vì trả `null`: người chơi bấm "ref kế tiếp" là muốn ĐI ĐÂU ĐÓ,
 * và đứng im là câu trả lời khó hiểu nhất cho thao tác đó.
 */
export function cycleRefKey(
  targets: readonly RefTarget[],
  current: string | null,
  direction: number,
): string | null {
  if (targets.length === 0) return null;
  const at = current === null ? -1 : targets.findIndex((target) => target.key === current);
  if (at < 0) return targets[0]?.key ?? null;
  return targets[cycleIndex(at, targets.length, direction)]?.key ?? null;
}
