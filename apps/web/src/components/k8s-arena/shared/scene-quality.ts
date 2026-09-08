/**
 * Ba bậc chất lượng, tự dò (§9.5).
 *
 * ⚠ Đây KHÔNG phải phần đánh bóng. Chromium headless của Playwright cấp WebGL2
 * qua **SwiftShader** — một bản rasterize bằng CPU: nó chạy được, nên mọi phép
 * kiểm "có WebGL không" đều xanh, rồi bóng mềm + bloom + env map làm mỗi khung
 * hình tốn hàng trăm mili-giây và suite e2e hết giờ. Phải dò và tự hạ bậc.
 *
 * ⛔ Không `import 'three'`: chỉ dùng kiểu WebGL của lib DOM, nên module này nằm
 * ngoài chunk lazy và test được ở env `node`.
 */

export type QualityTier = 'low' | 'medium' | 'high';

/** Lựa chọn của người dùng. `auto` = để bộ dò quyết định. */
export type QualityChoice = 'auto' | QualityTier;

export const QUALITY_CHOICES: readonly QualityChoice[] = ['auto', 'high', 'medium', 'low'];

export const QUALITY_LABEL: Readonly<Record<QualityChoice, string>> = {
  auto: 'Tự động',
  high: 'Cao',
  medium: 'Vừa',
  low: 'Thấp',
};

/**
 * Dấu hiệu của bản dựng rasterize bằng CPU.
 *
 * `swiftshader` là của Chromium headless, `llvmpipe` / `softpipe` / `mesa
 * offscreen` là của Mesa trên Linux không GPU, `basic render driver` là bộ đổ
 * mềm của Windows khi thiếu driver. Cả bốn đều báo cùng một điều: không có GPU,
 * đừng bật hậu kỳ.
 */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|mesa offscreen|basic render|software/i;

export function isSoftwareRenderer(renderer: string | null): boolean {
  return renderer !== null && SOFTWARE_RENDERER.test(renderer);
}

/**
 * Bậc khởi điểm suy từ chuỗi mô tả GPU.
 *
 * Bắt đầu ở `high` chứ không ở `medium`: bộ điều khiển bên dưới CHỈ hạ bậc, nên
 * bắt đầu cao rồi để phép đo khung hình kéo xuống là đường duy nhất máy khoẻ có
 * thể tới bậc cao. Bắt đầu ở `medium` thì không ai lên được `high` bao giờ.
 */
export function tierFromRenderer(renderer: string | null): QualityTier {
  return isSoftwareRenderer(renderer) ? 'low' : 'high';
}

/**
 * Chuỗi mô tả GPU thật, nếu trình duyệt chịu nói.
 *
 * `WEBGL_debug_renderer_info` bị một số cấu hình chặn vì lý do fingerprint; khi
 * đó `getParameter(RENDERER)` trả một chuỗi chung chung ("WebKit WebGL"). Trả
 * `null` cho trường hợp không biết — và `null` KHÔNG được đọc thành "có GPU":
 * `tierFromRenderer(null)` cho `high`, rồi phép đo khung hình mới là thứ nói
 * lời cuối. Đó là đúng thứ tự: đo hơn đoán.
 */
export function detectRendererString(gl: WebGLRenderingContext | WebGL2RenderingContext): string | null {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext !== null) {
      const value: unknown = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      if (typeof value === 'string' && value !== '') {
        return value;
      }
    }
    const plain: unknown = gl.getParameter(gl.RENDERER);
    return typeof plain === 'string' && plain !== '' ? plain : null;
  } catch {
    return null;
  }
}

/** Số khung hình gộp lại thành một cửa sổ đo. ~0.75 giây ở 60fps. */
const WINDOW_FRAMES = 45;
/** Trung vị vượt ngưỡng này (≈ dưới 38fps) thì cửa sổ đó bị coi là chậm. */
const SLOW_FRAME_MS = 26;
/** Số cửa sổ chậm LIÊN TIẾP cần có trước khi hạ bậc. */
const SLOW_WINDOWS_TO_DEMOTE = 2;

const NEXT_TIER_DOWN: Readonly<Record<QualityTier, QualityTier | null>> = {
  high: 'medium',
  medium: 'low',
  low: null,
};

export interface TierController {
  current(): QualityTier;
  /** Nạp thời lượng một khung hình. Trả bậc MỚI khi vừa đổi, `null` khi giữ nguyên. */
  observe(frameMs: number): QualityTier | null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) {
    return 0;
  }
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

/**
 * Bộ hạ bậc theo khung hình đo được.
 *
 * Ba lựa chọn có chủ ý:
 *
 * 1. **Trung vị, không phải trung bình.** Một khung hình 400ms (trình duyệt vừa
 *    biên dịch shader, hoặc tab vừa được bật lại) kéo trung bình đủ để hạ bậc
 *    oan. Trung vị bỏ qua đúng loại đột biến đó.
 * 2. **Hai cửa sổ chậm liên tiếp.** Cửa sổ đầu tiên sau khi mount luôn chậm —
 *    lúc đó shader đang biên dịch và texture đang tải lên. Hạ bậc ngay ở đó là
 *    hạ bậc mọi máy, kể cả máy khoẻ.
 * 3. **Chỉ hạ, không nâng.** Nâng lại sẽ dao động: nâng lên cao ⇒ chậm ⇒ hạ ⇒
 *    nhanh ⇒ nâng, và người dùng thấy cảnh đổi hình thức mỗi giây. Muốn lên bậc
 *    thì có công tắc tay (§9.5) — một quyết định của người, không phải của vòng
 *    lặp điều khiển.
 */
export function createTierController(start: QualityTier): TierController {
  let tier = start;
  let frames: number[] = [];
  let slowWindows = 0;

  return {
    current: () => tier,
    observe(frameMs: number): QualityTier | null {
      if (!Number.isFinite(frameMs) || frameMs <= 0) {
        return null;
      }
      frames.push(frameMs);
      if (frames.length < WINDOW_FRAMES) {
        return null;
      }
      const slow = median(frames) > SLOW_FRAME_MS;
      frames = [];
      if (!slow) {
        slowWindows = 0;
        return null;
      }
      slowWindows += 1;
      if (slowWindows < SLOW_WINDOWS_TO_DEMOTE) {
        return null;
      }
      const next = NEXT_TIER_DOWN[tier];
      if (next === null) {
        return null;
      }
      slowWindows = 0;
      tier = next;
      return tier;
    },
  };
}

export interface TierFeatures {
  readonly shadows: boolean;
  readonly softShadows: boolean;
  readonly bloom: boolean;
  readonly environment: boolean;
  readonly maxPixelRatio: number;
  /** Số mặt của khối bo góc. Bậc thấp dùng khối phẳng cạnh để bớt đỉnh. */
  readonly roundedSegments: number;
  readonly particles: boolean;
}

/** Bảng bật/tắt theo bậc — bản dịch trực tiếp của bảng §9.5. */
export const TIER_FEATURES: Readonly<Record<QualityTier, TierFeatures>> = {
  high: {
    shadows: true,
    softShadows: true,
    bloom: true,
    environment: true,
    maxPixelRatio: 2,
    roundedSegments: 4,
    particles: true,
  },
  medium: {
    shadows: true,
    softShadows: false,
    bloom: false,
    environment: true,
    maxPixelRatio: 1,
    roundedSegments: 2,
    particles: true,
  },
  low: {
    shadows: false,
    softShadows: false,
    bloom: false,
    environment: false,
    maxPixelRatio: 1,
    roundedSegments: 1,
    particles: false,
  },
};
