/**
 * Toán của cảnh 3D CI/CD — **KHÔNG một dòng `three`** (19.D.3).
 *
 * Cùng ba lý do đã ghi ở đầu `packages/games/src/cicd/scene-contract.ts`, và ở
 * đây còn một lý do thứ tư riêng của lane này: test chạy ở env `node`/jsdom, nơi
 * **không có WebGL**. Phép biến đổi toạ độ và phép đóng khung camera là hai chỗ
 * dễ sai nhất của cả cảnh; để chúng dính `three` là tự bỏ mất khả năng kiểm.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO TỈ LỆ KHÁC NHAU THEO TỪNG TRỤC
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `placeWorkflow` trả một ô lưới = 1 đơn vị trên cả ba trục, và chú thích của nó
 * nói rõ việc chọn tỉ lệ thật là việc của renderer. Nhưng ba trục KHÔNG cùng một
 * đại lượng (`phase-19-d-exec.md` §2.1):
 *
 * - **X** đếm tầng phụ thuộc — hiếm khi quá mười.
 * - **Z** đếm làn job song song — cũng nhỏ.
 * - **Y** ở chương CI là `0.25 × số tick chờ`, và số tick chờ lên vài chục dễ
 *   dàng; ở chương CD nó là `2 × số dải`.
 *
 * Nhân cả ba bằng một hệ số thì hoặc đồ thị bẹp dí theo chiều cao (hệ số nhỏ),
 * hoặc một job chờ 40 tick bay lên cao gấp mấy lần chiều dài đường ống (hệ số
 * lớn). Nên mỗi trục có hệ số riêng, và cả ba nằm ĐÚNG ở đây — không renderer
 * component nào được nhân thêm một hệ số thứ hai.
 *
 * ⛔ **Mọi điểm đi vào cảnh phải qua `toWorld` / `toWorldPath`.** Một `NaN` lọt
 * vào một `BufferAttribute` làm three vứt **TOÀN BỘ** draw call đó, **im lặng** —
 * không lỗi, không cảnh báo, chỉ là một phần cảnh biến mất. Hai hàm này là chỗ
 * duy nhất chặn được điều đó, và chúng trả `null` chứ không trả một điểm gốc toạ
 * độ: vẽ một node sai chỗ là bịa ra thông tin, còn không vẽ nó thì phép đếm
 * `data-cicd-node-count` lệch và ô AC-D1 đỏ — tức là có người biết.
 */

/** Điểm trong không gian đặt chỗ (`CicdPlacement`), chưa nhân tỉ lệ. */
export interface ScenePointLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Điểm trong không gian THẾ GIỚI của cảnh three. */
export interface WorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Hệ số của từng trục. Lý lẽ ở khối đầu file.
 *
 * `lane` nhỏ hơn `layer` vì cạnh chạy dọc theo X (thứ tự phụ thuộc) và cần chỗ
 * để gấp khúc, còn các làn chỉ cần đủ tách nhau để đọc.
 */
export const WORLD_SCALE = {
  layer: 2,
  lane: 1.6,
  height: 1,
} as const;

/** Nửa cạnh của khối node, đơn vị thế giới. Nhỏ hơn nửa `lane` để hai làn còn khe. */
export const NODE_HALF = { x: 0.62, y: 0.17, z: 0.52 } as const;

function finite(p: ScenePointLike): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

/** Đổi một điểm đặt chỗ sang toạ độ thế giới. `null` = điểm không dùng được. */
export function toWorld(p: ScenePointLike): WorldPoint | null {
  if (!finite(p)) {
    return null;
  }
  return {
    x: p.x * WORLD_SCALE.layer,
    y: p.y * WORLD_SCALE.height,
    z: p.z * WORLD_SCALE.lane,
  };
}

/**
 * Đổi cả một đường gấp khúc.
 *
 * Một điểm hỏng làm hỏng CẢ đường: vẽ nửa đường là vẽ một quan hệ phụ thuộc đi
 * tới một chỗ không phải đích của nó — sai hơn hẳn việc không vẽ. Đường dưới hai
 * điểm cũng trả `null`: không có đoạn nào để vẽ.
 */
export function toWorldPath(points: readonly ScenePointLike[]): readonly WorldPoint[] | null {
  const out: WorldPoint[] = [];
  for (const p of points) {
    const w = toWorld(p);
    if (w === null) {
      return null;
    }
    out.push(w);
  }
  return out.length >= 2 ? out : null;
}

export interface SceneBoundsLike {
  readonly min: ScenePointLike;
  readonly max: ScenePointLike;
}

/**
 * Tâm của khung bao, trong toạ độ thế giới.
 *
 * `null` khi khung bao có thành phần không hữu hạn — chỗ gọi rơi về gốc toạ độ
 * và vẫn hiện được một cảnh rỗng, thay vì đẩy `NaN` vào ma trận camera (lúc đó
 * cả cảnh biến mất và không gì nói tại sao).
 */
export function worldCenter(bounds: SceneBoundsLike): WorldPoint | null {
  const min = toWorld(bounds.min);
  const max = toWorld(bounds.max);
  if (min === null || max === null) {
    return null;
  }
  return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
}

/**
 * Tám đỉnh của khung bao, đã nới thêm nửa khối node.
 *
 * Nới ra là bắt buộc: `CicdPlacement.bounds` bao các TÂM node, nên đóng khung
 * theo đúng nó sẽ cắt mất nửa khối ở mọi mép — và cắt đúng những node ngoài
 * cùng, tức node đầu và node cuối đường ống.
 */
export function boundsCorners(bounds: SceneBoundsLike): readonly WorldPoint[] {
  const min = toWorld(bounds.min);
  const max = toWorld(bounds.max);
  if (min === null || max === null) {
    return [];
  }
  const lo = { x: min.x - NODE_HALF.x, y: min.y - NODE_HALF.y, z: min.z - NODE_HALF.z };
  const hi = { x: max.x + NODE_HALF.x, y: max.y + NODE_HALF.y, z: max.z + NODE_HALF.z };
  const out: WorldPoint[] = [];
  for (const x of [lo.x, hi.x]) {
    for (const y of [lo.y, hi.y]) {
      for (const z of [lo.z, hi.z]) {
        out.push({ x, y, z });
      }
    }
  }
  return out;
}

/** Ba vec-tơ trực chuẩn của camera: hướng nhìn ngược, phải, lên. */
export interface CameraBasis {
  /** Từ điểm ngắm TỚI mắt, đã chuẩn hoá. Vị trí mắt = tâm + `dir × khoảng cách`. */
  readonly dir: WorldPoint;
  readonly right: WorldPoint;
  readonly up: WorldPoint;
}

function normalize(x: number, y: number, z: number, fallback: WorldPoint): WorldPoint {
  const len = Math.hypot(x, y, z);
  if (!Number.isFinite(len) || len < 1e-9) {
    return fallback;
  }
  return { x: x / len, y: y / len, z: z / len };
}

function cross(a: WorldPoint, b: WorldPoint): { x: number; y: number; z: number } {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function dot(a: WorldPoint, b: WorldPoint): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Hệ trục của camera cho một cặp (phương vị, độ cao).
 *
 * `right` lấy từ `cross(trục đứng, dir)`, `up` từ `cross(dir, right)` — nên cả
 * ba luôn trực chuẩn và `up` không bao giờ lật khi phương vị quay hết một vòng.
 *
 * Trường hợp suy biến duy nhất là nhìn thẳng từ trên xuống (`dir` trùng trục
 * đứng): lúc đó `cross` cho vec-tơ 0 và không có "bên phải" nào đúng hơn bên
 * nào. Chọn `+x` thay vì trả `null`, vì camera nhìn từ đỉnh vẫn là một góc nhìn
 * hợp lệ của cảnh này — chỉ cần một quy ước, và quy ước im lặng ở đây không giấu
 * lỗi gì: hình ảnh vẫn đúng, chỉ là xoay theo một cách đã chọn trước.
 */
export function cameraBasis(azimuth: number, elevation: number): CameraBasis {
  const ce = Math.cos(elevation);
  const dir = normalize(ce * Math.sin(azimuth), Math.sin(elevation), ce * Math.cos(azimuth), {
    x: 0,
    y: 0,
    z: 1,
  });
  const rawRight = cross({ x: 0, y: 1, z: 0 }, dir);
  const right = normalize(rawRight.x, rawRight.y, rawRight.z, { x: 1, y: 0, z: 0 });
  const rawUp = cross(dir, right);
  const up = normalize(rawUp.x, rawUp.y, rawUp.z, { x: 0, y: 1, z: 0 });
  return { dir, right, up };
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** Phần khung hình mà đồ thị được phép chiếm. Phần còn lại là lề cho nhãn. */
export const FRAME_FILL = 0.82;

/** Giới hạn `zoom` của camera trực giao. Ngoài khoảng này thì cảnh vô dụng. */
export const ZOOM_RANGE = { min: 4, max: 320 } as const;

/** Bề rộng tối thiểu của đồ thị khi tính `zoom` — chặn chia cho 0 ở cảnh một node. */
const MIN_EXTENT = 0.5;

/**
 * `zoom` của camera TRỰC GIAO sao cho cả đồ thị lọt khung.
 *
 * Với camera trực giao mặc định của R3F, khung nhìn là `[-w/2, w/2] × [-h/2,
 * h/2]` **pixel**, và `zoom` là số pixel trên mỗi đơn vị thế giới. Nên một bề
 * rộng thế giới `E` chiếm `E × zoom` pixel, và điều kiện lọt khung là
 * `zoom ≤ width / E`. Lấy min theo hai chiều rồi nhân phần lề.
 *
 * ⚠ Chiếu ĐỦ TÁM đỉnh chứ không chỉ hai đỉnh `min`/`max`: ở một phương vị chéo,
 * đỉnh chiếu ra xa nhất theo trục ngang của màn hình KHÔNG phải là một trong hai
 * đỉnh đó. Lấy hai đỉnh thì cảnh bị cắt đúng ở những góc nhìn 45° — tức là ở sáu
 * trong tám góc mặc định.
 */
export function fitOrthographicZoom(
  corners: readonly WorldPoint[],
  basis: CameraBasis,
  viewport: Viewport,
  fill: number = FRAME_FILL,
): number {
  if (corners.length === 0 || viewport.width <= 0 || viewport.height <= 0) {
    return ZOOM_RANGE.min;
  }
  let minR = Number.POSITIVE_INFINITY;
  let maxR = Number.NEGATIVE_INFINITY;
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  for (const corner of corners) {
    const r = dot(corner, basis.right);
    const u = dot(corner, basis.up);
    if (!Number.isFinite(r) || !Number.isFinite(u)) {
      return ZOOM_RANGE.min;
    }
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
  }
  const extentR = Math.max(maxR - minR, MIN_EXTENT);
  const extentU = Math.max(maxU - minU, MIN_EXTENT);
  const zoom = Math.min(viewport.width / extentR, viewport.height / extentU) * fill;
  if (!Number.isFinite(zoom)) {
    return ZOOM_RANGE.min;
  }
  return Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, zoom));
}

/**
 * Bán kính bao của đồ thị — dùng để đặt mắt camera đủ xa và chọn `near`/`far`.
 *
 * Camera trực giao không đổi kích cỡ theo khoảng cách, nên con số này KHÔNG ảnh
 * hưởng tới hình ảnh; nó chỉ quyết định mặt cắt gần có xén mất phần đồ thị ở gần
 * mắt hay không.
 */
export function boundingRadius(corners: readonly WorldPoint[], center: WorldPoint): number {
  let max = 0;
  for (const corner of corners) {
    const d = Math.hypot(corner.x - center.x, corner.y - center.y, corner.z - center.z);
    if (Number.isFinite(d) && d > max) {
      max = d;
    }
  }
  return Math.max(max, 1);
}
