/**
 * Hàm chuyển động — THUẦN, không `three`, không DOM.
 *
 * Tách ra vì đây là phần của §9.3 kiểm được bằng số: một hàm easing sai dấu, hay
 * một pha bồng bềnh giống nhau cho mọi pod, không lộ ra trong ảnh chụp tĩnh mà
 * chỉ lộ khi nhìn cảnh động — tức là không có cổng tự động nào bắt được. Ở đây
 * thì bắt được.
 */

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Ease-out có vượt nhẹ (overshoot), dùng cho pod vừa sinh (§9.3).
 *
 * `OVERSHOOT` 1.70158 là hằng số kinh điển của `easeOutBack`, cho đỉnh vượt ~10%.
 * Vượt nhiều hơn thì pod nảy như bóng cao su, và một cluster nảy thì trông như
 * đồ chơi chứ không như một phòng điều khiển.
 */
const OVERSHOOT = 1.70158;

export function easeOutBack(t: number): number {
  const x = clamp01(t) - 1;
  return 1 + (OVERSHOOT + 1) * x * x * x + OVERSHOOT * x * x;
}

export function easeInQuad(t: number): number {
  const x = clamp01(t);
  return x * x;
}

export function easeOutCubic(t: number): number {
  const x = 1 - clamp01(t);
  return 1 - x * x * x;
}

/**
 * Pha bồng bềnh riêng cho mỗi vật, suy TẤT ĐỊNH từ `uid`.
 *
 * ⚠ §9.3: cùng pha thì cả cảnh đập như một khối và đọc ra là lỗi, không phải là
 * hiệu ứng. Nhưng pha cũng KHÔNG được lấy ngẫu nhiên: một pod phải giữ nguyên
 * pha qua mọi tick, nếu không nó giật mỗi lần trạng thái đổi. Hash của `uid` cho
 * cả hai — khác nhau giữa các pod, bất biến với một pod.
 *
 * FNV-1a 32-bit: đủ tản cho vài trăm chuỗi, và không kéo thêm dependency nào.
 */
export function phaseFromId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash / 0x100000000) * Math.PI * 2;
}

/** Biên độ bồng bềnh, đơn vị world. Rất nhỏ — đủ để thấy là "sống", chưa đủ để mất chỗ đứng. */
export const BOB_AMPLITUDE = 0.045;
/** Chu kỳ bồng bềnh, giây. Chậm hơn nhịp thở người một chút. */
export const BOB_PERIOD_S = 4.2;
/** Chu kỳ nhấp nháy của vật đang lỗi. Nhanh hơn bồng bềnh nhưng vẫn là "thở", không phải "chớp". */
export const PULSE_PERIOD_S = 1.8;

export function bobOffset(elapsedS: number, phase: number): number {
  return Math.sin((elapsedS / BOB_PERIOD_S) * Math.PI * 2 + phase) * BOB_AMPLITUDE;
}

/** 0..1 theo nhịp thở. Dùng cho cường độ phát sáng của vật đang lỗi. */
export function pulse01(elapsedS: number, phase: number): number {
  return (Math.sin((elapsedS / PULSE_PERIOD_S) * Math.PI * 2 + phase) + 1) / 2;
}

/** Thời lượng chuyển tiếp, giây. `reduced` = rút còn ~1 frame theo §9.3. */
export const SPAWN_DURATION_S = 0.45;
export const DEATH_DURATION_S = 0.35;
export const REDUCED_DURATION_S = 1 / 60;

export function transitionDuration(base: number, reducedMotion: boolean): number {
  return reducedMotion ? REDUCED_DURATION_S : base;
}
