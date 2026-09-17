/**
 * Đọc màu của một cảnh game từ design token, KHÔNG hardcode (§4.5, §9.6).
 *
 * Đây là phần DÙNG CHUNG cho mọi game: nó không biết game nào có những token
 * nào. Mỗi game truyền vào bảng `token → tên biến CSS` của chính mình
 * (`k8s-arena/shared/scene-tokens.ts` cho arena, `cicd/…` cho chương CI/CD), và
 * nhận lại bảng màu mang ĐÚNG những khoá đó — kiểu suy ra từ bảng đã truyền,
 * nên bên gọi vẫn được gợi ý tên token của mình chứ không phải một
 * `Record<string, Rgb>` trống nghĩa.
 *
 * ⛔ File này không `import 'three'`: nó trả `{r,g,b}` số thực 0..1 trong không
 * gian sRGB, còn việc đổi sang `THREE.Color` là việc của chunk lazy. Nhờ vậy
 * phần phân tích màu — chỗ dễ sai nhất — test được mà không cần WebGL, và cảnh
 * 2D (SVG) dùng lại được đúng bộ phân giải này.
 *
 * ## Vì sao KHÔNG đọc thẳng `getPropertyValue('--primary')`
 *
 * Custom property KHÔNG được trình duyệt phân giải thành màu: `getPropertyValue`
 * trả lại đúng chuỗi đã khai, tức `oklch(0.55 0.21 25)`. `THREE.Color.setStyle`
 * không hiểu `oklch()` (nó biết hex, `rgb()`, `hsl()`, tên màu CSS) — nên đường
 * "đọc biến rồi đưa thẳng cho three" hỏng lặng lẽ: `setStyle` cảnh báo rồi giữ
 * màu cũ, và cả cảnh ra màu trắng.
 *
 * Đường đi đúng là bắt trình duyệt tự phân giải: đặt `color: var(--token)` lên
 * một phần tử dò rồi đọc `getComputedStyle(el).color`. Lúc đó giá trị đã là
 * *used value* của một thuộc tính màu thật.
 *
 * ⚠ Nhưng chuỗi trả về vẫn KHÔNG chắc là `rgb()`. Theo CSS Color 4, computed
 * value của một màu khai bằng `oklch()` được serialize LẠI trong chính không
 * gian đó — Chrome trả `oklch(...)`. Nên phải có bước hai: vẽ màu đó lên canvas
 * 1×1 rồi ĐỌC BYTE ra bằng `getImageData`. Byte thì không có chuyện serialize;
 * nó đúng với mọi cú pháp màu hiện tại và mọi cú pháp màu sau này.
 */

/** Thành phần sRGB, 0..1. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * Bảng `tên token → tên biến CSS` mà một game truyền vào.
 *
 * Cố ý là `Record<string, string>` chứ không phải một union đóng: danh sách
 * token là việc của từng game. Ràng buộc "thiếu token là đỏ lúc biên dịch" vẫn
 * đặt được, nhưng đặt Ở PHÍA GAME bằng `satisfies Record<TokenCuaGame, string>`
 * trên chính bảng của nó — chỗ duy nhất biết đủ để phát biểu ràng buộc đó.
 */
export type SceneTokenVars = Readonly<Record<string, string>>;

/** Bảng màu đã phân giải, mang đúng những khoá của bảng token đã truyền vào. */
export type SceneColorsOf<Vars extends SceneTokenVars> = Readonly<Record<keyof Vars, Rgb>>;

export interface SceneColorsResultOf<Vars extends SceneTokenVars> {
  readonly colors: SceneColorsOf<Vars>;
  /**
   * `true` = ít nhất một token không phân giải được và đang dùng màu dự phòng.
   *
   * Trả ra chứ không nuốt: theo `development-principles.md` một fallback chỉ
   * được phép tồn tại khi nó được ghi log VÀ hiện ra cho người dùng. Vỏ game đọc
   * cờ này để hiện một dòng cảnh báo, thay vì để người ta ngồi đoán tại sao cảnh
   * toàn màu xám.
   */
  readonly degraded: boolean;
}

/**
 * Màu dự phòng khi không phân giải được gì: xám trung tính.
 *
 * KHÔNG phải hex (cổng màu grep của lane A cấm) và cố ý không phải đen: đen trên
 * nền tối là vô hình, mà "vô hình" đọc ra thành "cảnh hỏng". Xám thì nhìn thấy
 * được và nhìn là biết ngay có gì đó sai.
 */
const FALLBACK: Rgb = { r: 0.5, g: 0.5, b: 0.5 };

/*
 * ⚠ Hai hằng dưới là REGEX PHÂN TÍCH CHUỖI, không phải màu. `#` ở đây neo đầu
 * chuỗi đầu vào; không có giá trị màu nào được khai ở file này ngoài `FALLBACK`
 * (ba số thực).
 */
const HEX_SHORT = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i;
const HEX_LONG = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function channel(raw: string): number | null {
  const text = raw.trim();
  if (text === '') {
    return null;
  }
  if (text.endsWith('%')) {
    const pct = Number(text.slice(0, -1));
    return Number.isFinite(pct) ? clamp01(pct / 100) : null;
  }
  const n = Number(text);
  return Number.isFinite(n) ? clamp01(n / 255) : null;
}

/**
 * Phân tích `rgb()` / `rgba()` / `#hex` — đường NHANH, không cần canvas.
 *
 * Có mặt vì phần lớn trình duyệt vẫn serialize computed `color` thành `rgb()`
 * khi màu nguồn nằm trong sRGB, và vì nó là phần duy nhất của module này test
 * được trong jsdom (jsdom không có canvas 2D). Không phân tích `oklch()` bằng
 * tay: viết lại phép chuyển oklch→sRGB ở đây là dựng một bản sao thứ hai của
 * thứ trình duyệt đã làm đúng, và nó sẽ trôi khỏi bản gốc.
 */
export function parseCssRgb(value: string): Rgb | null {
  const text = value.trim();
  if (text === '') {
    return null;
  }

  const long = HEX_LONG.exec(text);
  if (long !== null) {
    return {
      r: parseInt(long[1] ?? '', 16) / 255,
      g: parseInt(long[2] ?? '', 16) / 255,
      b: parseInt(long[3] ?? '', 16) / 255,
    };
  }

  const short = HEX_SHORT.exec(text);
  if (short !== null) {
    const dup = (h: string | undefined): number => parseInt(`${h ?? ''}${h ?? ''}`, 16) / 255;
    return { r: dup(short[1]), g: dup(short[2]), b: dup(short[3]) };
  }

  const lower = text.toLowerCase();
  if (!lower.startsWith('rgb(') && !lower.startsWith('rgba(')) {
    return null;
  }
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open < 0 || close <= open) {
    return null;
  }
  // Cú pháp cũ dùng dấu phẩy, cú pháp CSS Color 4 dùng khoảng trắng + `/` cho
  // alpha. Chuẩn hoá cả hai về một danh sách rồi bỏ alpha — cảnh không dùng alpha
  // từ token, độ trong suốt do vật liệu quyết định.
  const parts = text
    .slice(open + 1, close)
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .filter((p) => p !== '');
  if (parts.length < 3) {
    return null;
  }
  const r = channel(parts[0] ?? '');
  const g = channel(parts[1] ?? '');
  const b = channel(parts[2] ?? '');
  if (r === null || g === null || b === null) {
    return null;
  }
  return { r, g, b };
}

/**
 * Bộ phân giải tổng quát: để CHÍNH trình duyệt vẽ màu rồi đọc byte ra.
 *
 * Đúng với `oklch()`, `color(display-p3 …)`, `lab()`, và mọi cú pháp màu chưa ra
 * đời — vì không có bước serialize nào ở giữa. Trả `null` khi không có canvas 2D
 * (jsdom, hoặc trình duyệt chặn canvas), để chỗ gọi rơi về màu dự phòng thay vì
 * ném giữa lúc dựng cảnh.
 */
export function createCanvasColorResolver(doc: Document): (css: string) => Rgb | null {
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    const canvas = doc.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    ctx = null;
  }

  return (css: string): Rgb | null => {
    const fast = parseCssRgb(css);
    if (fast !== null) {
      return fast;
    }
    if (ctx === null || css.trim() === '') {
      return null;
    }
    try {
      /*
       * Đặt một màu ĐÃ BIẾT trước: `fillStyle` giữ nguyên giá trị cũ khi được
       * gán một chuỗi không hợp lệ (spec canvas: gán sai thì bỏ qua, không ném).
       * Không có mốc này thì một token hỏng sẽ trả về màu của token TRƯỚC ĐÓ —
       * một lỗi im lặng, và là lỗi tệ nhất trong cả module này.
       */
      ctx.fillStyle = 'rgb(0, 0, 0)';
      ctx.fillStyle = css;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      return { r: (data[0] ?? 0) / 255, g: (data[1] ?? 0) / 255, b: (data[2] ?? 0) / 255 };
    } catch {
      return null;
    }
  };
}

/**
 * Đọc toàn bộ bảng màu của MỘT game qua một phần tử dò đặt trong cây DOM đang
 * mang theme.
 *
 * `probe` phải nằm TRONG document và dưới `<html>` (nơi `.dark` được gắn), nếu
 * không nó thừa hưởng nhánh sáng và đổi theme sẽ không đổi màu cảnh.
 *
 * Thứ tự đọc là thứ tự khai trong `vars` (`Object.entries` giữ thứ tự chèn với
 * khoá chuỗi) — có test của arena khẳng định điều đó, vì nó là thứ duy nhất cho
 * phép kiểm "đã đặt `var()` đúng tên biến cho đúng token".
 */
export function readSceneColors<Vars extends SceneTokenVars>(
  vars: Vars,
  probe: HTMLElement,
  getComputedColor: (el: HTMLElement) => string,
  resolve: (css: string) => Rgb | null,
): SceneColorsResultOf<Vars> {
  const colors: Record<string, Rgb> = {};
  let degraded = false;

  for (const [name, cssVar] of Object.entries(vars)) {
    let value: Rgb | null;
    try {
      probe.style.color = `var(${cssVar})`;
      value = resolve(getComputedColor(probe));
    } catch {
      value = null;
    }
    if (value === null) {
      degraded = true;
      value = FALLBACK;
    }
    colors[name] = value;
  }

  return { colors: colors as SceneColorsOf<Vars>, degraded };
}

/** Bảng dự phòng đồng nhất — dùng khi chưa có DOM (SSR, frame đầu). */
export function fallbackSceneColors<Vars extends SceneTokenVars>(vars: Vars): SceneColorsOf<Vars> {
  const colors: Record<string, Rgb> = {};
  for (const name of Object.keys(vars)) {
    colors[name] = FALLBACK;
  }
  return colors as SceneColorsOf<Vars>;
}
