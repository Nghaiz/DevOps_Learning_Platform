/**
 * Cầu nối token CSS → màu số, cho tầng 3D game Git.
 *
 * ⛔ **Không `import 'three'`.** File này trả `{r,g,b}` số thực 0..1 trong không
 * gian sRGB; đổi sang `THREE.Color` là việc của `use-git-scene-colors.ts`. Nhờ
 * vậy phần phân tích màu — chỗ dễ sai nhất — test được mà không cần WebGL.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG ĐỌC THẲNG `getPropertyValue('--card')`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Custom property KHÔNG được trình duyệt phân giải thành màu: `getPropertyValue`
 * trả lại đúng chuỗi đã khai, tức `oklch(0.55 0.21 25)`. `THREE.Color.setStyle`
 * không hiểu `oklch()` — nó cảnh báo rồi **giữ màu cũ**, và cả cảnh ra trắng.
 *
 * Đường đúng có HAI bước, và bước hai là bước hay bị bỏ:
 *
 *  1. Bắt trình duyệt tự phân giải: đặt `color: var(--token)` lên một phần tử dò
 *     rồi đọc `getComputedStyle(el).color`.
 *  2. ⚠ Chuỗi trả về vẫn **không chắc là `rgb()`**. Theo CSS Color 4, computed
 *     value của một màu khai bằng `oklch()` được serialize LẠI trong chính không
 *     gian đó — Chrome trả `oklch(...)`. Nên phải vẽ màu đó lên canvas 1×1 rồi
 *     **đọc byte** bằng `getImageData`. Byte không có chuyện serialize; nó đúng
 *     với mọi cú pháp màu hiện tại và mọi cú pháp màu sau này.
 *
 * Arena đã trả giá cho đúng chỗ này. Hai hàm làm phần khó —
 * `createCanvasColorResolver()` và `parseCssRgb()` — là hàm **thuần và generic**
 * (chỉ `readSceneColors()` mới khoá cứng theo danh sách token của K8s), nên ở
 * đây ta **dùng lại**, không chép. `code-conventions.md` § "No Duplicated Logic":
 * một phép phân giải màu có hai bản cài đặt là hai bản sẽ lệch nhau, và lệch màu
 * thì không cổng nào bắt được.
 *
 * ⚠ **NỢ KỸ THUẬT có tên.** Hai hàm đó đang nằm ở `k8s-arena/shared/`, tức thư
 * mục của một game khác — nhà đúng của chúng là `components/games/shared/`. Di
 * chuyển đòi sửa mã arena và mã arena không thuộc phạm vi P17b, nên đợt này
 * **import qua**, và ghi nợ ở đây thay vì im lặng. Import `ObjectView` trong
 * file đó là `import type`, bị xoá lúc biên dịch, nên không có mã K8s nào lọt
 * vào bundle của game Git.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DANH SÁCH TOKEN ĐƯỢC SUY RA, KHÔNG ĐƯỢC KHAI LẠI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `GIT_SCENE_TOKENS` gom từ chính ba bảng trong `git-palette.ts`. Khai tay một
 * danh sách thứ hai là tạo ra một chỗ để quên: thêm một `SceneAccent` mà quên
 * thêm token của nó ⇒ node ra màu dự phòng xám và **không ai giải thích được**,
 * vì cả hai bảng đều "trông đúng" khi đọc riêng.
 */

import {
  createCanvasColorResolver,
  parseCssRgb,
  type Rgb,
} from '../../../k8s-arena/shared/scene-tokens';
import { ACCENT_STYLE, EDGE_STYLE, REF_STYLE, type ColorToken } from '../git-palette.ts';

export { createCanvasColorResolver, parseCssRgb };
export type { Rgb };

/**
 * Mọi token màu mà tầng 3D game Git có thể cần, suy ra từ ba bảng SSOT.
 *
 * Đã sắp xếp để thứ tự ổn định — bảng màu là đầu vào của ảnh chụp so sánh, và
 * một thứ tự đổi theo `Object.keys` làm ảnh chụp lệch mà không đổi nội dung.
 */
export const GIT_SCENE_TOKENS: readonly ColorToken[] = [
  ...new Set<ColorToken>([
    ...Object.values(ACCENT_STYLE).flatMap((s) => [s.fill, s.text, s.stroke]),
    ...Object.values(EDGE_STYLE).map((s) => s.stroke),
    ...Object.values(REF_STYLE).flatMap((s) => [s.fill, s.text]),
    // Nền cảnh và lưới: không thuộc bảng nào ở trên vì chúng không phải trạng
    // thái của một vật thể, nhưng cảnh 3D cần chúng để sương mù cùng màu nền
    // (thiếu là chân trời hiện ra một đường kẻ).
    '--background',
    '--foreground',
    '--muted',
    '--muted-foreground',
  ]),
].sort((a, b) => a.localeCompare(b));

/** Màu đã đọc, tra theo tên biến CSS. */
export type GitSceneColors = Readonly<Record<ColorToken, Rgb>>;

export interface GitSceneColorsResult {
  readonly colors: GitSceneColors;
  /**
   * `true` khi có ÍT NHẤT MỘT token không đọc được và phải dùng màu dự phòng.
   *
   * Đây là một tín hiệu được **phát ra**, không phải một giá trị nuốt vào:
   * `development-principles.md` § "Errors Over Silent Fallbacks". Một cảnh xám
   * toàn bộ mà không ai báo gì là loại lỗi tốn nửa ngày để lần ra.
   */
  readonly degraded: boolean;
}

/** Xám trung tính. Chỉ dùng khi phép đọc hỏng, và luôn kèm `degraded: true`. */
const FALLBACK: Rgb = { r: 0.5, g: 0.5, b: 0.5 };

export function fallbackGitSceneColors(): GitSceneColors {
  const out: Record<ColorToken, Rgb> = {};
  for (const token of GIT_SCENE_TOKENS) out[token] = FALLBACK;
  return out;
}

/**
 * Đọc toàn bộ token qua một phần tử dò.
 *
 * `getComputed` và `resolve` được **tiêm vào** chứ không gọi thẳng `window` —
 * đó là điều làm hàm này test được ở env `node` mà không cần jsdom giả lập
 * canvas. Cùng khuôn với `readSceneColors()` của arena.
 */
export function readGitSceneColors(
  probe: HTMLElement,
  getComputed: (el: HTMLElement) => string,
  resolve: (css: string) => Rgb | null,
): GitSceneColorsResult {
  const out: Record<ColorToken, Rgb> = {};
  let degraded = false;

  for (const token of GIT_SCENE_TOKENS) {
    let rgb: Rgb | null;
    try {
      probe.style.color = `var(${token})`;
      rgb = resolve(getComputed(probe));
    } catch {
      rgb = null;
    }
    if (rgb === null) {
      degraded = true;
      out[token] = FALLBACK;
    } else {
      out[token] = rgb;
    }
  }

  return { colors: out, degraded };
}
