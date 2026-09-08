/**
 * Bảng màu của đấu trường, suy từ design token. TOÁN THUẦN, không `three`.
 *
 * ## Vì sao nền KHÔNG dùng thẳng token `--background`
 *
 * Yêu cầu là nền TỐI, và đó là một quyết định về CHIỀU SÂU chứ không phải về
 * theme: trên nền sáng, sương mù cùng màu nền và bóng đổ tiếp xúc gần như biến
 * mất, nên khung cảnh 3D dẹt ra thành một bức hình cắt dán. Bản cũ để nền sáng
 * và đó chính là chỗ nó mất hết chiều sâu.
 *
 * Nhưng cũng KHÔNG hardcode một màu đen: làm vậy là dựng một nguồn màu thứ hai
 * ngoài `globals.css` và nó sẽ trôi khỏi bản gốc. Đường ở giữa: giữ SẮC của
 * token, ép ĐỘ SÁNG xuống trần tối. Theme tối vốn đã dưới trần nên không đổi gì;
 * theme sáng ra một nền tối cùng tông với giao diện thay vì một màu lạ.
 *
 * ⛔ KHÔNG `import 'three'` (giữ file ngoài chunk lazy, và test được ở env node).
 */

import type { Rgb, SceneColors, StatusToken } from '../shared/scene-tokens';

export interface Hsl {
  readonly h: number;
  readonly s: number;
  readonly l: number;
}

export function rgbToHsl(rgb: Rgb): Hsl {
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rgb.r) {
    h = (rgb.g - rgb.b) / d + (rgb.g < rgb.b ? 6 : 0);
  } else if (max === rgb.g) {
    h = (rgb.b - rgb.r) / d + 2;
  } else {
    h = (rgb.r - rgb.g) / d + 4;
  }
  return { h: h / 6, s, l };
}

function hueChannel(p: number, q: number, t: number): number {
  const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
  if (x < 1 / 6) {
    return p + (q - p) * 6 * x;
  }
  if (x < 1 / 2) {
    return q;
  }
  if (x < 2 / 3) {
    return p + (q - p) * (2 / 3 - x) * 6;
  }
  return p;
}

export function hslToRgb(hsl: Hsl): Rgb {
  if (hsl.s === 0) {
    return { r: hsl.l, g: hsl.l, b: hsl.l };
  }
  const q = hsl.l < 0.5 ? hsl.l * (1 + hsl.s) : hsl.l + hsl.s - hsl.l * hsl.s;
  const p = 2 * hsl.l - q;
  return {
    r: hueChannel(p, q, hsl.h + 1 / 3),
    g: hueChannel(p, q, hsl.h),
    b: hueChannel(p, q, hsl.h - 1 / 3),
  };
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/** Giữ sắc, ép độ sáng vào khoảng `[minL, maxL]` và kẹp độ bão hoà. */
export function reshade(rgb: Rgb, minL: number, maxL: number, maxS: number): Rgb {
  const hsl = rgbToHsl(rgb);
  const l = hsl.l < minL ? minL : hsl.l > maxL ? maxL : hsl.l;
  const s = hsl.s > maxS ? maxS : hsl.s;
  return hslToRgb({ h: hsl.h, s, l });
}

export interface ArenaPalette {
  readonly background: Rgb;
  readonly ground: Rgb;
  readonly platform: Rgb;
  readonly platformReady: Rgb;
  readonly platformDown: Rgb;
  readonly edge: Rgb;
  readonly edgeBroken: Rgb;
  readonly select: Rgb;
  readonly hover: Rgb;
  /** Màu thân vật — đã pha về phía bệ để ra CHẤT LIỆU chứ không phải ô màu. */
  readonly body: Readonly<Record<StatusToken, Rgb>>;
  /** Màu hào quang — giữ nguyên độ tươi của token, đây là ánh sáng. */
  readonly glow: Readonly<Record<StatusToken, Rgb>>;
  /** Màu thân theo LOẠI tài nguyên, tra bằng token của `KIND_ACCENT`. */
  readonly kind: Readonly<Record<string, Rgb>>;
  /** Ô lưới nhỏ và đường phân khu của sàn. */
  readonly gridCell: Rgb;
  readonly gridSection: Rgb;
}

const STATUS_TOKENS: readonly StatusToken[] = [
  'success',
  'destructive',
  'warning',
  'status-progress',
  'status-locked',
];

/** Trần độ sáng của nền. Trên mức này thì sương mù và bóng tiếp xúc mất tác dụng. */
const BACKGROUND_MAX_L = 0.055;

const KIND_TOKENS: readonly string[] = [
  'kind-pod',
  'kind-controller',
  'kind-batch',
  'kind-network',
  'kind-config',
  'kind-storage',
  'kind-security',
  'kind-cluster',
];

export function deriveArenaPalette(colors: SceneColors): ArenaPalette {
  const background = reshade(colors['kind-pod'], 0.035, BACKGROUND_MAX_L, 0.38);
  // Sàn sáng hơn nền một chút để có một đường chân trời đọc được; cùng sắc nên
  // sương mù vẫn hoà được hai thứ vào nhau ở xa.
  const ground = reshade(background, 0.045, 0.065, 0.32);
  const platform = reshade(colors['kind-cluster'], 0.32, 0.4, 0.3);

  const body: Record<string, Rgb> = {};
  const glow: Record<string, Rgb> = {};
  for (const token of STATUS_TOKENS) {
    const pure = reshade(colors[token], 0.42, 0.68, 0.95);
    // Pha về phía bệ: một khối tô nguyên màu trạng thái đọc ra là một ô màu, không
    // phải một vật có chất liệu. 0.34 giữ nhận ra được trạng thái mà vẫn ra khối.
    body[token] = mixRgb(pure, platform, 0.34);
    glow[token] = pure;
  }

  const kind: Record<string, Rgb> = {};
  for (const token of KIND_TOKENS) {
    const value = (colors as Readonly<Record<string, Rgb>>)[token];
    if (value === undefined) {
      continue;
    }
    // Nâng độ sáng lên hẳn so với bệ: đây là thân vật trên nền tối, và nó phải
    // đọc được ở khoảng cách xa nhất mà camera cho phép.
    kind[token] = reshade(value, 0.46, 0.7, 0.95);
  }

  return {
    kind,
    // Lưới sàn phải THẤY ĐƯỢC nhưng không được tranh nhìn với cụm: đường phân
    // khu đậm hơn ô nhỏ, cả hai đều là xám của token viền chứ không phải màu.
    gridCell: reshade(colors['kind-network'], 0.12, 0.16, 0.24),
    gridSection: reshade(colors['kind-network'], 0.21, 0.27, 0.3),
    background,
    ground,
    platform,
    platformReady: mixRgb(platform, reshade(colors.primary, 0.4, 0.6, 0.9), 0.16),
    platformDown: mixRgb(platform, reshade(colors.destructive, 0.4, 0.6, 0.9), 0.3),
    edge: reshade(colors.primary, 0.45, 0.7, 0.85),
    edgeBroken: reshade(colors.destructive, 0.45, 0.7, 0.95),
    select: reshade(colors.primary, 0.6, 0.78, 0.9),
    hover: reshade(colors.foreground, 0.55, 0.75, 0.35),
    body: body as Readonly<Record<StatusToken, Rgb>>,
    glow: glow as Readonly<Record<StatusToken, Rgb>>,
  };
}

