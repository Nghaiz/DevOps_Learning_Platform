import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Cổng hợp đồng C1 (`plans/devops-learning-platform/phase-13-exec.md` §2) cho
 * TOKEN — không phải cho component.
 *
 * Vì sao một test trong `packages/ui` lại đọc file của `apps/web`: token là
 * SSOT ở `apps/web/src/app/globals.css` (D1 chốt thế — Tailwind v4 CSS-first,
 * không có `tailwind.config.*`), nhưng thứ TIÊU THỤ token là mọi component ở
 * đây. Không có `import` runtime nào vượt biên (ui KHÔNG phụ thuộc web); đây
 * là một phép ĐỌC FILE trong test, đúng dạng contract-test. Đặt test ở
 * `apps/web` thay vào đó sẽ chôn nó giữa các route mà lane khác sở hữu.
 *
 * Ba thứ được gác ở đây, và cả ba đều IM LẶNG khi hỏng nếu không gác:
 *
 * 1. **Token thiếu ở một trong hai theme.** Một biến chỉ khai ở `:root` mà
 *    quên `.dark` không gây lỗi CSS — nó chỉ kế thừa giá trị theme sáng, nên
 *    chế độ tối hiện đúng một mảng màu sai. Không cảnh báo build, không lỗi
 *    runtime.
 * 2. **`@theme inline` không map.** Thiếu `--color-x: var(--x)` thì class
 *    `bg-x` KHÔNG được Tailwind sinh ra; JSX vẫn biên dịch, thuộc tính class
 *    vẫn có mặt trong HTML, chỉ là không có luật CSS nào khớp. Đây chính là
 *    hình dạng của lỗi `@source` đã đo ngày 2026-08-13 (xem đầu globals.css).
 * 3. **Contrast tụt dưới WCAG.** axe-core (cổng 13.H) chỉ đo contrast của CHỮ.
 *    Nó KHÔNG có rule nào cho viền/ranh giới control, nên SC 1.4.11 phải được
 *    đo ở đây hoặc không ở đâu cả.
 */

/**
 * ⚠ KHÔNG dùng `import.meta.url` ở đây. Môi trường test là jsdom, và vitest
 * cấp cho module một `import.meta.url` mang scheme **http://localhost/** chứ
 * không phải `file://` — `fileURLToPath()` ném thẳng
 * `TypeError: The URL must be of scheme file`. Lỗi xuất hiện lúc NẠP module
 * nên cả file báo "0 test", không phải một assertion đỏ; dễ đọc nhầm thành
 * "chưa viết test".
 *
 * Thay vào đó đi ngược từ `process.cwd()` tìm gốc workspace: đúng dù chạy từ
 * `packages/ui` (`pnpm --filter`) hay từ gốc repo (`turbo run test`).
 */
function workspaceRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Không tìm thấy gốc workspace (pnpm-workspace.yaml) từ ' + process.cwd());
    dir = parent;
  }
}

const GLOBALS_CSS = resolvePath(workspaceRoot(), 'apps/web/src/app/globals.css');

const css = readFileSync(GLOBALS_CSS, 'utf8');

/** Tên biến trong bảng C1 — đổi/xoá một dòng ở đây là đổi hợp đồng. */
const C1_COLOR_TOKENS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--success',
  '--success-foreground',
  '--warning',
  '--warning-foreground',
  '--border',
  '--input',
  '--ring',

  // Độ khó + trạng thái học. Mỗi cặp `--x`/`--x-foreground` chịu HAI ngưỡng
  // khác nhau vì cùng một token vừa làm nền badge vừa làm viền/chấm — xem chú
  // thích ở `globals.css`.
  '--difficulty-basic',
  '--difficulty-basic-foreground',
  '--difficulty-intermediate',
  '--difficulty-intermediate-foreground',
  '--difficulty-advanced',
  '--difficulty-advanced-foreground',
  '--status-progress',
  '--status-progress-foreground',
  '--status-done',
  '--status-done-foreground',
  '--status-locked',
  '--status-locked-foreground',
] as const;

type ColorToken = (typeof C1_COLOR_TOKENS)[number];

/**
 * Bóng đổ. Phải có ở CẢ HAI theme và giá trị BẮT BUỘC khác nhau: nhánh sáng
 * dùng bóng mang sắc độ lạnh, nhánh tối dùng đen thuần alpha cao. Chép nguyên
 * bóng của nhánh sáng sang nhánh tối là hỏng câm — bóng chỉ hơi tối hơn một nền
 * vốn đã tối thì không nhìn thấy gì, mà CSS vẫn hợp lệ và test vẫn xanh nếu chỉ
 * kiểm "có mặt".
 */
const C1_ELEVATION_TOKENS = ['--elevation-1', '--elevation-2', '--elevation-3'] as const;

/**
 * Thời lượng + đường cong. CỐ Ý chỉ khai ở `:root`, KHÔNG lặp ở `.dark` — cùng
 * lập luận đã dùng cho `--radius`: đây là số đo thời gian, không phải màu, và
 * không đổi theo theme. Lặp lại chỉ tạo thêm một chỗ để quên đồng bộ.
 */
const C1_MOTION_TOKENS = ['--motion-fast', '--motion-base', '--motion-slow', '--ease-out'] as const;

/**
 * Cắt khối top-level theo độ sâu ngoặc thay vì regex `\{([\s\S]*?)\}` — khối
 * `@theme inline` chứa `calc(...)` và các khối lồng nhau, nên regex
 * non-greedy sẽ dừng ở dấu `}` đầu tiên và bỏ sót nửa sau bảng token
 * (một cách IM LẶNG: test vẫn chạy, chỉ là kiểm ít hơn nó tuyên bố).
 */
function blockBody(source: string, selector: string): string {
  const lines = source.split(/\r?\n/);
  let depth = 0;
  let current: string | null = null;
  const buffer: string[] = [];
  for (const line of lines) {
    if (current === null) {
      const match = /^([^{]*?)\s*\{\s*$/.exec(line);
      if (match !== null && match[1] !== undefined && match[1].trim() === selector) {
        current = selector;
        depth = 1;
      }
      continue;
    }
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (depth <= 0) break;
    buffer.push(line);
  }
  if (current === null) throw new Error(`Không tìm thấy khối \`${selector}\` trong globals.css`);
  return buffer.join('\n');
}

function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Khai báo có thể xuống dòng (`--font-sans:\n  var(...), ...;`) nên gộp
  // toàn khối rồi tách theo `;` thay vì đọc từng dòng.
  for (const chunk of body.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const match = /(--[a-z0-9-]+)\s*:\s*([\s\S]+)/i.exec(chunk);
    if (match?.[1] !== undefined && match[2] !== undefined) out[match[1]] = match[2].trim();
  }
  return out;
}

const root = declarations(blockBody(css, ':root'));
const dark = declarations(blockBody(css, '.dark'));
const themeInline = declarations(blockBody(css, '@theme inline'));

// ─── oklch → sRGB → độ chói tương đối (WCAG 2.1) ──────────────────────────────

interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha: number;
}

function parseOklch(value: string): Oklch {
  const match = /^oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*(?:\/\s*([0-9.]+)(%?)\s*)?\)$/.exec(value);
  if (match === null) throw new Error(`Không phải oklch(): ${value}`);
  const [, l, c, h, a, pct] = match;
  const alpha = a === undefined ? 1 : pct === '%' ? Number(a) / 100 : Number(a);
  return { l: Number(l), c: Number(c), h: Number(h), alpha };
}

type LinearRgb = readonly [number, number, number];

/**
 * sRGB **đã mã hoá gamma** (0..1 mỗi kênh). Hai không gian mang type RIÊNG cố ý:
 * trộn nhầm chúng chính là lỗi được sửa ngày 2026-09-06 (xem `composite`), và
 * TypeScript là thứ duy nhất bắt được lần sau — cả hai đều là bộ ba số.
 */
type Srgb = readonly [number, number, number];

/** Oklab → LMS³ → sRGB tuyến tính (ma trận chuẩn của Björn Ottosson). */
function toLinearRgb({ l: lightness, c: chroma, h: hue }: Oklch): LinearRgb {
  const rad = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(rad);
  const b = chroma * Math.sin(rad);
  const lCube = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCube = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCube = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube,
    -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube,
    -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube,
  ];
}

const clamp = (x: number): number => Math.min(1, Math.max(0, x));

/** sRGB tuyến tính → sRGB mã hoá gamma (IEC 61966-2-1). Nghịch đảo `decodeGamma`. */
function encodeGamma(channel: number): number {
  const x = clamp(channel);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
}

/** sRGB mã hoá gamma → tuyến tính. Đúng hàm WCAG 2.1 định nghĩa cho độ chói. */
function decodeGamma(channel: number): number {
  const x = clamp(channel);
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function toSrgb(color: Oklch): Srgb {
  const linear = toLinearRgb(color);
  return [encodeGamma(linear[0]), encodeGamma(linear[1]), encodeGamma(linear[2])];
}

/**
 * Màu có nằm trong gamut sRGB không — tức mọi kênh TUYẾN TÍNH đều thuộc [0,1]
 * trước khi bị `clamp`.
 *
 * Vì sao phải gác: `toSrgb()` clamp TỪNG KÊNH, còn trình duyệt gamut-map theo
 * CSS Color 4 §13 — giảm chroma, giữ nguyên L và H. Hai phép chiếu khác nhau ra
 * hai màu khác nhau, nên với một token ngoài gamut thì con số đo được ở đây
 * KHÔNG còn tả đúng thứ người dùng nhìn thấy.
 *
 * Đo ngày 2026-09-06 trên 7 token ngoài gamut đang có: gamut-map luôn cho tỉ lệ
 * BẰNG hoặc CAO HƠN clamp (lệch nhiều nhất +0.12 ở `--destructive` nhánh sáng).
 * Nghĩa là cổng hiện tại sai theo hướng AN TOÀN — nó báo thấp hơn thực tế, chứ
 * không chứng nhận nhầm cho màu không đạt. Đó là lý do 7 token đó được ghi nợ
 * thay vì phải sửa ngay; nó KHÔNG phải lý do để thêm token mới ngoài gamut, vì
 * biên +0.12 ấy là số đo của riêng 7 màu này, không phải một bảo đảm.
 */
function inSrgbGamut(value: string): boolean {
  const linear = toLinearRgb(parseOklch(value));
  return linear.every((channel) => channel >= -0.0005 && channel <= 1.0005);
}

function relativeLuminance(rgb: Srgb): number {
  return 0.2126 * decodeGamma(rgb[0]) + 0.7152 * decodeGamma(rgb[1]) + 0.0722 * decodeGamma(rgb[2]);
}

function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** `#rrggbb` 8-bit — để đối chứng đối chiếu được với số học làm tay. */
function toHex(rgb: Srgb): string {
  return `#${rgb.map((channel) => Math.round(clamp(channel) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Đè một màu (có thể trong suốt) lên nền.
 *
 * ⚠ TRỘN ALPHA PHẢI LÀM TRONG sRGB **ĐÃ MÃ HOÁ GAMMA**, không phải trong
 * linear-light. Bản trước của file này trộn trên giá trị TUYẾN TÍNH, trong khi
 * trình duyệt composite `background-color`/`border-color` trong không gian
 * hiển thị đã mã hoá gamma (CSS Color 4 §12 — simple alpha compositing chạy
 * SAU khi màu đã chuyển sang không gian đích).
 *
 * Sai lệch không nhỏ, và nó LẬT NGƯỢC kết luận. `oklch(1 0 0 / 16%)` (giá trị
 * `--input` cũ ở `.dark`) trên nền `oklch(0.145 0 0)`:
 *
 *   • đúng (gamma):  255×0.16 + 10×0.84 = 49.2  ⇒ #313131 ⇒ **1.53:1**  ✗ dưới 3
 *   • sai (linear):  1×0.16 + 0.00305×0.84 = 0.1626 ⇒ #707070 ⇒ **4.01:1** ✓ "đạt"
 *
 * Tức cổng này ĐÃ CHỨNG NHẬN cho đúng thứ nó sinh ra để chặn. Hai con số sai
 * 4.01 (trên `--background`) và 3.71 (trên `--card`) còn được chép sang chú
 * thích `apps/web/src/app/globals.css` và bảng `docs/design-system.md` §1a —
 * cả ba nơi sai cùng một kiểu, sửa cùng ngày 2026-09-06.
 *
 * Đối chứng dương ghim cả hai con số nằm ở cuối file, để lần sau ai đổi lại
 * sang linear-light thì test đỏ chứ không phải "đẹp lên".
 */
function composite(color: Oklch, backdrop: Srgb | undefined): Srgb {
  const rgb = toSrgb(color);
  if (color.alpha >= 1) return rgb;
  if (backdrop === undefined) throw new Error('Màu trong suốt — cần nền để đè lên');
  const a = color.alpha;
  return [
    rgb[0] * a + backdrop[0] * (1 - a),
    rgb[1] * a + backdrop[1] * (1 - a),
    rgb[2] * a + backdrop[2] * (1 - a),
  ];
}

/**
 * Token trong suốt (`oklch(1 0 0 / 12%)` — `--border`/`--input` ở `.dark`) phải
 * được ĐÈ LÊN nền trước khi đo. Đo màu trong suốt như thể nó đục sẽ cho một
 * con số đẹp hơn thực tế: `oklch(1 0 0)` trên nền đen ra 21:1 trong khi cái
 * người dùng thật sự nhìn thấy là 12% của nó. Thiếu nền thì NÉM LỖI, không im
 * lặng bỏ qua alpha.
 */
function resolve(theme: Record<string, string>, token: ColorToken, backdrop?: Srgb): Srgb {
  const raw = theme[token] ?? root[token];
  if (raw === undefined) throw new Error(`Token ${token} không có ở cả theme lẫn :root`);
  const parsed = parseOklch(raw);
  if (parsed.alpha < 1 && backdrop === undefined) throw new Error(`${token} trong suốt — cần nền để đè lên`);
  return composite(parsed, backdrop);
}

function measure(theme: Record<string, string>, foreground: ColorToken, background: ColorToken): number {
  const bg = resolve(theme, background);
  const fg = resolve(theme, foreground, bg);
  return contrastRatio(relativeLuminance(fg), relativeLuminance(bg));
}

/**
 * Đo `foreground` cạnh `middle`, khi CHÍNH `middle` là lớp trong suốt nằm trên
 * `base`. `measure()` không diễn đạt được ca này: nó gọi `resolve(background)`
 * không kèm nền, nên một `middle` trong suốt sẽ ném lỗi.
 *
 * Ca thật: Switch lúc TẮT ở chế độ tối — núm (`bg-background`, đục) nằm trên
 * rãnh (`bg-input`, trắng 16%…38%), mà rãnh lại đang phủ lên nền trang hoặc
 * nền card. Ba lớp, và cặp cần đo là núm↔rãnh chứ không phải núm↔nền.
 */
function measureLayered(
  theme: Record<string, string>,
  foreground: ColorToken,
  middle: ColorToken,
  base: ColorToken,
): number {
  const baseRgb = resolve(theme, base);
  const middleRgb = resolve(theme, middle, baseRgb);
  const foregroundRgb = resolve(theme, foreground, middleRgb);
  return contrastRatio(relativeLuminance(foregroundRgb), relativeLuminance(middleRgb));
}

// ─── Kiểm ────────────────────────────────────────────────────────────────────

describe('C1 — token có mặt ở CẢ HAI theme', () => {
  it.each(C1_COLOR_TOKENS)('%s khai ở :root', (token) => {
    expect(root[token], `${token} thiếu trong :root`).toBeDefined();
  });

  it.each(C1_COLOR_TOKENS)('%s khai ở .dark', (token) => {
    expect(dark[token], `${token} thiếu trong .dark — chế độ tối sẽ kế thừa màu sáng trong im lặng`).toBeDefined();
  });

  it.each(C1_ELEVATION_TOKENS)('%s khai ở CẢ HAI theme', (token) => {
    expect(root[token], `${token} thiếu trong :root`).toBeDefined();
    expect(dark[token], `${token} thiếu trong .dark — thẻ ở chế độ tối sẽ đeo bóng của nhánh sáng`).toBeDefined();
  });

  it('bóng của .dark KHÁC bóng của :root (chép nguyên sang là hỏng câm)', () => {
    for (const token of C1_ELEVATION_TOKENS) {
      expect(dark[token], `${token} ở .dark trùng y hệt :root — bóng lạnh nhạt vô hình trên nền tối`).not.toBe(
        root[token],
      );
    }
  });

  it.each([...C1_MOTION_TOKENS, '--radius'] as const)(
    '%s khai ở :root và CỐ Ý vắng ở .dark (số đo, không phải màu — không đổi theo theme)',
    (token) => {
      expect(root[token]).toBeDefined();
      expect(dark[token], `${token} bị lặp ở .dark — thêm một chỗ để quên đồng bộ, đổi lấy con số không`).toBeUndefined();
    },
  );

  it('không có token THỪA ngoài hợp đồng C1 (thêm token = phải sửa C1 + docs/design-system.md)', () => {
    const expected = [...C1_COLOR_TOKENS, ...C1_ELEVATION_TOKENS, ...C1_MOTION_TOKENS, '--radius'];
    expect(Object.keys(root).toSorted()).toEqual(expected.toSorted());
  });

  /**
   * Nửa còn lại của cùng một cổng. Chỉ kiểm `:root` là bỏ lọt token chỉ tồn tại
   * ở `.dark`: nó không kế thừa từ đâu cả, nên ở nhánh sáng mọi chỗ dùng nó rơi
   * về `unset` — im lặng y hệt ca ngược lại.
   */
  it('.dark không khai token nào NGOÀI hợp đồng, và không thiếu token nào của nó', () => {
    const expected = [...C1_COLOR_TOKENS, ...C1_ELEVATION_TOKENS];
    expect(Object.keys(dark).toSorted()).toEqual(expected.toSorted());
  });
});

describe('C1 — `@theme inline` sinh được class Tailwind cho mọi token', () => {
  it.each(C1_COLOR_TOKENS)('%s có `--color-*` trỏ đúng về nó', (token) => {
    const mapped = themeInline[`--color${token.slice(1)}`];
    expect(mapped, `thiếu --color${token.slice(1)} ⇒ class bg/text/border tương ứng KHÔNG được sinh ra`).toBe(
      `var(${token})`,
    );
  });

  it.each(C1_ELEVATION_TOKENS)('%s có `--shadow-*` trỏ đúng về nó', (token) => {
    const mapped = themeInline[`--shadow${token.slice(1)}`];
    expect(mapped, `thiếu --shadow${token.slice(1)} ⇒ class shadow-elevation-* KHÔNG được sinh ra`).toBe(
      `var(${token})`,
    );
  });

  it('thang bo góc suy ra từ `--radius`, không phải số cứng', () => {
    expect(themeInline['--radius-lg']).toBe('var(--radius)');
    for (const key of ['--radius-sm', '--radius-md', '--radius-xl']) {
      expect(themeInline[key]).toContain('calc(var(--radius)');
    }
  });

  it('`--font-sans` đặt Be Vietnam Pro trước, kèm fallback thật (D3)', () => {
    const sans = themeInline['--font-sans'];
    expect(sans).toContain('var(--font-be-vietnam-pro)');
    // Chỉ mỗi biến là không đủ: nếu `next/font` hỏng lúc build thì biến rỗng và
    // trình duyệt rơi về serif mặc định thay vì một sans đọc được.
    expect(sans).toContain('system-ui');
    expect(sans?.toLowerCase()).not.toContain('poppins');
  });
});

/**
 * WCAG 2.1 SC 1.4.3 (chữ thường ≥ 4.5:1) và SC 1.4.11 (thành phần giao diện /
 * đồ hoạ ≥ 3:1). Ngưỡng dưới đây là ngưỡng CHUẨN, không phải ngưỡng "vừa đủ để
 * xanh" — thấy một dòng đỏ thì sửa TOKEN, tuyệt đối không hạ số ở đây.
 */
const TEXT_PAIRS: ReadonlyArray<readonly [ColorToken, ColorToken]> = [
  ['--foreground', '--background'],
  ['--muted-foreground', '--background'],
  ['--muted-foreground', '--muted'],
  ['--muted-foreground', '--card'],
  ['--card-foreground', '--card'],
  ['--popover-foreground', '--popover'],
  ['--primary-foreground', '--primary'],
  ['--secondary-foreground', '--secondary'],
  ['--accent-foreground', '--accent'],
  ['--destructive-foreground', '--destructive'],
  /*
   * NHÃN của nút/badge `destructive` lúc NGHỈ. Sau 14.A biến thể đó bỏ nền đặc
   * và chuyển sang viền + `text-destructive` trên nền trang, nên `--destructive`
   * nay là MÀU CHỮ THẬT SỰ và phải chịu SC 1.4.3 ≥4.5 — không còn chỉ là màu
   * nền như trước.
   *
   * Cùng cặp `--destructive`↔`--background`/`--card` cũng nằm trong
   * `NON_TEXT_PAIRS` ở dưới, và đó KHÔNG phải thừa: ở đây nó bị đo với tư cách
   * CHỮ (4.5), dưới đó với tư cách VIỀN (3.0). Hai vai, hai ngưỡng — tách ra để
   * ai đổi nhãn về `text-foreground` sau này thì xoá đúng hai dòng này mà vẫn
   * giữ nghĩa vụ của viền.
   */
  ['--destructive', '--background'],
  ['--destructive', '--card'],
  ['--success-foreground', '--success'],
  ['--warning-foreground', '--warning'],
  // Chữ TRÊN chip độ khó / trạng thái.
  ['--difficulty-basic-foreground', '--difficulty-basic'],
  ['--difficulty-intermediate-foreground', '--difficulty-intermediate'],
  ['--difficulty-advanced-foreground', '--difficulty-advanced'],
  ['--status-progress-foreground', '--status-progress'],
  ['--status-done-foreground', '--status-done'],
  ['--status-locked-foreground', '--status-locked'],
];

/**
 * `--input` là ranh giới NHẬN DẠNG của control (viền Input/Textarea/Select/
 * Checkbox/RadioGroup/Button-outline, rãnh Switch lúc tắt) ⇒ SC 1.4.11 áp
 * dụng. `--border` KHÔNG có trong danh sách này: nó chỉ vẽ ranh giới trang
 * trí (viền card, kẻ dòng bảng, `Separator` mặc định `decorative`), thuộc
 * ngoại lệ "pure decoration" của SC 1.4.11 — số đo thật của nó và lý do
 * ghi ở `docs/design-system.md` §1a, để đây là một QUYẾT ĐỊNH có số, không
 * phải một chỗ bỏ sót.
 */
const NON_TEXT_PAIRS: ReadonlyArray<readonly [ColorToken, ColorToken]> = [
  ['--input', '--background'],
  ['--input', '--card'],
  // `--input` cũng là viền ô nhập nằm TRONG khối `bg-muted` (code block, hàng
  // bảng hover). Nền đó sáng/tối hơn `--background`, nên nó là một ràng buộc
  // RIÊNG chứ không suy ra được từ hai dòng trên.
  ['--input', '--muted'],
  ['--ring', '--background'],
  ['--ring', '--card'],
  // `--ring` cạnh `--primary`/`--destructive` KHÔNG có ở đây — miễn trừ có
  // chứng minh, xem khối "miễn trừ CÓ CHỨNG MINH" ở cuối file.
  ['--primary', '--background'],
  ['--destructive', '--background'],
  // Viền `border-destructive` của nút/badge destructive là ranh giới NHẬN DẠNG
  // (nó là thứ phân biệt nút nguy hiểm với nút primary sau khi thương hiệu
  // chuyển sang đỏ — quyết định #1 của 14.A), nên nó chịu SC 1.4.11 chứ không
  // phải ngoại lệ trang trí. `--background` đã có ở dòng trên; `--card` là ràng
  // buộc RIÊNG và là mặt thật sự hay gặp nhất — cả ba nơi gọi nút destructive
  // (confirm-dialog, publish-panel, active-sessions) đều nằm trên dialog/card.
  ['--destructive', '--card'],

  // Chip độ khó / trạng thái CÒN LÀ đồ hoạ: viền trái thẻ và chấm chỉ mục, nơi
  // không có chữ nào để dựa vào. Đo trên cả ba mặt vì cả ba đều xuất hiện thật
  // và KHÔNG suy ra được từ nhau — ở chế độ tối `--muted` (0.269) sáng hơn
  // `--card` (0.205), nên nó mới là ràng buộc chặt nhất, không phải `--background`.
  ['--difficulty-basic', '--background'],
  ['--difficulty-basic', '--card'],
  ['--difficulty-basic', '--muted'],
  ['--difficulty-intermediate', '--background'],
  ['--difficulty-intermediate', '--card'],
  ['--difficulty-intermediate', '--muted'],
  ['--difficulty-advanced', '--background'],
  ['--difficulty-advanced', '--card'],
  ['--difficulty-advanced', '--muted'],
  ['--status-progress', '--background'],
  ['--status-progress', '--card'],
  ['--status-progress', '--muted'],
  ['--status-done', '--background'],
  ['--status-done', '--card'],
  ['--status-done', '--muted'],
  ['--status-locked', '--background'],
  ['--status-locked', '--card'],
  ['--status-locked', '--muted'],
];

describe.each([
  ['sáng (:root)', root],
  ['tối (.dark)', dark],
])('WCAG contrast — theme %s', (_label, theme) => {
  it.each(TEXT_PAIRS)('%s trên %s ≥ 4.5:1 (SC 1.4.3, chữ thường)', (fg, bg) => {
    expect(measure(theme, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)('%s trên %s ≥ 3:1 (SC 1.4.11, ranh giới/đồ hoạ)', (fg, bg) => {
    expect(measure(theme, fg, bg)).toBeGreaterThanOrEqual(3);
  });
});

/**
 * Switch lúc TẮT là HAI thành phần đồ hoạ chồng lên nhau, và SC 1.4.11 áp cho
 * cả hai: rãnh (`bg-input`) phải phân biệt được với nền trang — cặp đó đã nằm
 * trong `NON_TEXT_PAIRS` — VÀ núm (`bg-background`) phải phân biệt được với
 * chính cái rãnh nó nằm trên.
 *
 * Cặp thứ hai không đo được bằng `measure()`: ở chế độ tối rãnh là lớp trắng
 * TRONG SUỐT, nên nó vừa đóng vai "nền" của núm vừa là "tiền cảnh" trên nền
 * trang. Ba lớp ⇒ `measureLayered()`.
 */
describe.each([
  ['sáng (:root)', root],
  ['tối (.dark)', dark],
])('Switch lúc TẮT — SC 1.4.11, theme %s', (_label, theme) => {
  it.each(['--background', '--card'] as const)(
    'núm (--background) trên rãnh (--input) đặt trên %s ≥ 3:1',
    (base) => {
      expect(measureLayered(theme, '--background', '--input', base)).toBeGreaterThanOrEqual(3);
    },
  );
});

/**
 * Đối chứng cho CHÍNH PHÉP ĐO — cả hai chiều.
 *
 * Chiều ÂM (phép đo biết kêu) một mình là không đủ: bản trước của khối này chỉ
 * khẳng định `4.01 < 9.48`, tức nó xác nhận một con số SAI nhỏ hơn một con số
 * khác, và đã đứng xanh suốt thời gian `measure()` trộn alpha nhầm không gian
 * màu (`rules/green-that-proves-nothing.md`).
 *
 * Nên ở đây có thêm chiều DƯƠNG: phép đo phải ra ĐÚNG những giá trị biết trước
 * độc lập, tính tay được, và KHÔNG phụ thuộc token hiện tại.
 */
describe('đối chứng — phép đo contrast ra đúng số đã biết, và biết kêu', () => {
  it('cùng một màu với chính nó = 1.00:1 (không phải một số lớn nào đó)', () => {
    expect(measure(root, '--background', '--background')).toBeCloseTo(1, 5);
  });

  it('trắng trên đen = 21.00:1 — trần lý thuyết WCAG, đi qua TRỌN đường oklch→sRGB→độ chói', () => {
    const white = toSrgb({ l: 1, c: 0, h: 0, alpha: 1 });
    const black = toSrgb({ l: 0, c: 0, h: 0, alpha: 1 });
    // Ghim luôn hai đầu thang ở dạng hex: nếu ma trận oklch→sRGB hay hàm gamma
    // lệch, tỉ lệ 21 vẫn có thể đúng do đối xứng, còn hex thì không.
    expect(toHex(white)).toBe('#ffffff');
    expect(toHex(black)).toBe('#000000');
    expect(contrastRatio(relativeLuminance(white), relativeLuminance(black))).toBeCloseTo(21, 2);
  });

  it('nền tối `oklch(0.145 0 0)` ra đúng #0a0a0a (mốc 8-bit để số học dưới đây kiểm được bằng tay)', () => {
    expect(toHex(toSrgb({ l: 0.145, c: 0, h: 0, alpha: 1 }))).toBe('#0a0a0a');
  });

  /**
   * ĐỐI CHỨNG DƯƠNG then chốt: nó ghim KHÔNG GIAN trộn alpha, thứ đã sai.
   *
   * Số học 8-bit làm tay: trắng 16% trên #0a0a0a ⇒ 255×0.16 + 10×0.84 = 49.2
   * ⇒ #313131 ⇒ 1.53:1. Công thức linear-light cũ cho #707070 ⇒ 4.01:1 — và
   * 4.01 chính là con số từng được chép vào globals.css + design-system.md.
   *
   * Hai vế được tính SONG SONG ở đây, nên đổi `composite()` về linear-light là
   * test đỏ ngay, không phải "đẹp lên rồi đi tiếp".
   */
  it('trộn alpha trong sRGB gamma: 16% trắng trên #0a0a0a ⇒ #313131 / 1.53:1 (KHÔNG phải #707070 / 4.01:1)', () => {
    const base = toSrgb({ l: 0.145, c: 0, h: 0, alpha: 1 });
    const actual = composite({ l: 1, c: 0, h: 0, alpha: 0.16 }, base);
    expect(toHex(actual)).toBe('#313131');
    expect(contrastRatio(relativeLuminance(actual), relativeLuminance(base))).toBeCloseTo(1.53, 2);

    // Cùng đầu vào, chạy qua ĐÚNG công thức sai cũ — để con số 4.01 có mặt
    // trong repo dưới dạng "đây là cái sai", không phải dưới dạng chỉ tiêu.
    const whiteLinear = toLinearRgb({ l: 1, c: 0, h: 0, alpha: 1 });
    const baseLinear = toLinearRgb({ l: 0.145, c: 0, h: 0, alpha: 1 });
    const wrong: Srgb = [
      encodeGamma(whiteLinear[0] * 0.16 + baseLinear[0] * 0.84),
      encodeGamma(whiteLinear[1] * 0.16 + baseLinear[1] * 0.84),
      encodeGamma(whiteLinear[2] * 0.16 + baseLinear[2] * 0.84),
    ];
    expect(toHex(wrong)).toBe('#707070');
    expect(contrastRatio(relativeLuminance(wrong), relativeLuminance(base))).toBeCloseTo(4.01, 2);
  });

  it('token trong suốt KHÔNG BAO GIỜ đo được như thể đục — thiếu nền là NÉM LỖI, không im lặng bỏ alpha', () => {
    expect(() => resolve(dark, '--border')).toThrow(/trong suốt/);
    expect(() => resolve(dark, '--input')).toThrow(/trong suốt/);
  });

  it('giá trị `--input` sáng ĐÃ TỪNG hỏng: 0.922 cho 1.26:1, dưới ngưỡng 3:1', () => {
    // Ghim lại con số của lỗi đã sửa. Nếu ai đó đưa `--input` về 0.922 thì
    // khối `NON_TEXT_PAIRS` ở trên đỏ; test này giải thích vì sao con số cũ
    // sai, để lần sau không có ai "khôi phục giá trị shadcn gốc" trong yên
    // lặng.
    const old = toSrgb({ l: 0.922, c: 0, h: 0, alpha: 1 });
    const white = toSrgb({ l: 1, c: 0, h: 0, alpha: 1 });
    expect(toHex(old)).toBe('#e5e5e5');
    expect(contrastRatio(relativeLuminance(old), relativeLuminance(white))).toBeCloseTo(1.26, 2);
  });
});

/**
 * `--ring` KHÔNG được đo cạnh `--primary`/`--destructive`. Đo thô thì hai cặp
 * đó bằng 1.00:1 và 1.01:1 (`--ring` = `--primary` theo đúng thiết kế C1 §2.2)
 * — vòng focus vô hình trên chính nút chính. Nhưng LÝ DO miễn trừ nay KHÁC
 * NHAU giữa hai màu, nên chúng được gác bằng hai thứ khác nhau.
 *
 * ── `--destructive`: BẤT KHẢ THI, và điều đó vẫn đo được ───────────────────
 * Không một màu nào sửa được cặp đó ở chế độ tối: nhét vừa HAI bậc 3:1 quanh
 * `--card` thì cần một khe rộng, và quét vét cạn thang độ chói cho ĐÚNG 0
 * nghiệm — hai đầu mút nói rõ vì sao: trắng tinh chỉ được 2.8922:1 với
 * `--destructive` tối, còn đen tuyền chỉ được 1.1722:1 với `--card`. Phép quét
 * dưới đây vẫn chạy, vẫn là một khẳng định có thể đỏ.
 *
 * ── `--primary`: nay là một LỰA CHỌN, KHÔNG phải bất khả thi ───────────────
 * ⚠ 2026-09-08 — khối này TỪNG khẳng định điều bất khả thi ấy cho CẢ HAI màu,
 * và với thương hiệu lam thì nó đúng (0 nghiệm, trắng 2.89:1 với `--primary`
 * tối). Thương hiệu đỏ làm nó SAI: đỏ có độ chói tương đối thấp hơn lam ở cùng
 * L, nên trắng nay được **4.2972:1** với `--primary` tối và phép quét cho
 * **317 nghiệm**. Một giá trị `--ring` riêng ĐANG CÓ SẴN.
 *
 * Ta không lấy nó. Lý do là phạm vi, không phải vật lý: `--ring` là vòng focus
 * của MỌI phần tử focus được, nên cho nó một hue riêng là thiết kế lại toàn bộ
 * hệ thống focus chứ không phải đổi màu thương hiệu — việc của một thay đổi
 * khác. Trong lúc đó `ring-offset-2` + `ring-offset-background` vốn đã khiến
 * vòng focus không bao giờ nằm sát mặt nút, nên khoảng trống này không gây hại
 * ngay.
 *
 * ⛔ Con số 6.20 (khe `--primary`↔`--card` tối thời lam) ĐÃ BỊ XOÁ khỏi đây,
 * KHÔNG phải cập nhật thành 4.17. Nó ghim một lập luận "khe <9 nên không nhét
 * vừa hai bậc 3:1" — lập luận đó chỉ xét ring nằm GIỮA card và primary, và
 * chính vì thế nó bỏ sót nhánh ring nằm NGOÀI khoảng đó, tức đúng nhánh mà 317
 * nghiệm mới rơi vào. Ghim lại 4.17 sẽ để một con số trông tươi mới đứng cạnh
 * một chứng minh đã sai (`rules/pinned-baseline-test-companion.md`).
 *
 * Thay vào đó, thứ được gác cho `--primary` là ĐIỀU KIỆN THẬT SỰ còn hiệu lực:
 * `--ring` === `--primary`. Ngày nào ai đó cho `--ring` giá trị riêng thì test
 * dưới đây ĐỎ, và khi ấy cặp `--ring`↔`--primary` phải quay lại
 * `NON_TEXT_PAIRS` — vì lúc đó nó đo được thật.
 *
 * Cách sửa đúng vẫn là TÁCH vòng focus khỏi mặt nút bằng `ring-offset-2` +
 * `ring-offset-background`: màu KỀ vòng focus khi đó là màu của khe, tức
 * `--background` — cặp đã nằm sẵn trong `NON_TEXT_PAIRS` ở trên (4.8178 sáng /
 * 4.6065 tối). Chỗ nào không dùng được offset (hàng bước trong `overflow-x-auto`
 * sẽ CẮT mất vòng; nút đóng nằm trên mặt toast tô đặc, nơi màu nền trang không
 * hề kề nó) thì chuyển sang `ring-current`, và bảo đảm khi ấy do `TEXT_PAIRS`
 * cấp.
 *
 * ⚠ Miễn trừ chỉ đứng vững chừng nào offset THẬT SỰ có mặt. Nó được gác bằng
 * class render ra DOM ở `button.test.tsx`, `switch.test.tsx`,
 * `checkbox.test.tsx`, `toast.test.tsx`, `lesson/step-nav.test.tsx` — nếu chỉ
 * có mỗi đoạn văn này thì đây là một miễn trừ không thể sai, tức không gác gì.
 */
describe('miễn trừ CÓ CHỨNG MINH — `--ring` cạnh mặt nút tô đặc', () => {
  /** Bước quét: 1001 điểm phủ trọn miền giá trị của độ chói tương đối. */
  const LUMINANCE_STEPS = 1000;

  it('chế độ tối: KHÔNG tồn tại độ chói nào đạt ≥3:1 với CẢ `--card` lẫn `--destructive`', () => {
    const fillLuminance = relativeLuminance(resolve(dark, '--destructive'));
    const cardLuminance = relativeLuminance(resolve(dark, '--card'));
    const solutions: number[] = [];
    for (let step = 0; step <= LUMINANCE_STEPS; step += 1) {
      const candidate = step / LUMINANCE_STEPS;
      if (contrastRatio(candidate, cardLuminance) >= 3 && contrastRatio(candidate, fillLuminance) >= 3) {
        solutions.push(candidate);
      }
    }
    expect(solutions).toEqual([]);
    // Hai đầu mút, ghim lại để lần đọc sau không phải tự chạy vòng lặp mới hiểu.
    expect(contrastRatio(1, fillLuminance)).toBeLessThan(3);
    expect(contrastRatio(0, cardLuminance)).toBeLessThan(3);
  });

  /**
   * ĐỐI CHỨNG của miễn trừ cho `--primary` — và nó gác đúng cái điều kiện còn
   * đứng vững, chứ không gác một con số.
   *
   * Đỏ ở đây nghĩa là `--ring` đã tách khỏi `--primary`. Đó là TIN MỪNG, và
   * việc phải làm KHÔNG phải sửa test này: hãy đưa cặp `--ring`↔`--primary`
   * trở lại `NON_TEXT_PAIRS` và xoá nửa `--primary` của miễn trừ.
   */
  it.each([
    ['sáng (:root)', root],
    ['tối (.dark)', dark],
  ])('%s: `--ring` === `--primary` — ĐÂY mới là lý do cặp đó không đo được', (_label, theme) => {
    expect(theme['--ring']).toBe(theme['--primary']);
  });

  /**
   * Ghim chiều NGƯỢC LẠI của phát hiện 2026-09-08, để không ai khôi phục lời
   * khẳng định "không màu nào sửa được" cho `--primary`. Nếu ngày nào đó
   * `--primary` tối đổi sang một màu mà trắng KHÔNG còn đạt 3:1 với nó, test
   * này đỏ — và khi ấy miễn trừ của `--primary` lại trở thành bất khả thi thật,
   * nên nó được gộp về chung phép quét với `--destructive` ở trên.
   */
  it('chế độ tối: trắng tinh ĐẠT ≥3:1 với `--primary` — nên miễn trừ của nó là lựa chọn, không phải bất khả thi', () => {
    expect(contrastRatio(1, relativeLuminance(resolve(dark, '--primary')))).toBeGreaterThanOrEqual(3);
  });
});

/**
 * Khoảng trống ĐÃ ĐO của biến thể `destructive` dạng viền (14.A quyết định #1).
 *
 * Nhãn nút/badge destructive lúc nghỉ là `text-destructive` trên nền trang.
 * `TEXT_PAIRS` đã gác nó ≥4.5 trên `--background` và `--card`. Trên `--muted`
 * nhánh SÁNG thì KHÔNG đạt — và con số đó được ghim ở đây thay vì giấu đi.
 *
 * Nguyên nhân là một cái TRẦN, không phải một chỗ chỉnh sai: `--destructive`
 * sáng chỉ đạt 4.7647:1 trên nền trắng tinh, nên bất kỳ mặt nào tối hơn trắng
 * đều ăn vào phần dư mỏng đó. Sửa được bằng một token đỏ đậm hơn cho chữ —
 * nhưng đó là thêm token vào C1, tức một thay đổi hợp đồng, không phải việc của
 * lane này.
 *
 * ⚠ Đây là một ABSENCE PIN theo `rules/pinned-baseline-test-companion.md`: nó
 * tự làm companion cho chính mình, vì chính lúc nó ĐỎ là lúc khoảng trống đã
 * đóng. Khi đó việc phải làm là XOÁ test này và thêm `['--destructive',
 * '--muted']` vào `TEXT_PAIRS` — tuyệt đối không nới con số ở đây.
 */
describe('khoảng trống đã đo — nhãn destructive trên `--muted`', () => {
  it('nhánh sáng CHƯA đạt 4.5:1 (đo 4.3686) ⇒ đừng đặt nút destructive trong khối `bg-muted`', () => {
    const measured = measure(root, '--destructive', '--muted');
    expect(measured).toBeCloseTo(4.3686, 3);
    expect(measured, 'nếu dòng này đỏ vì đã ĐẠT 4.5 thì xoá cả test, thêm cặp vào TEXT_PAIRS').toBeLessThan(4.5);
  });

  it('nhánh tối thì ĐẠT — khoảng trống chỉ có ở nhánh sáng, không phải cả hai', () => {
    expect(measure(dark, '--destructive', '--muted')).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * Gamut sRGB — nợ kỹ thuật CÓ TÊN, không phải một con số làm tròn.
 *
 * Danh sách dưới đây liệt kê ĐÍCH DANH từng token đang ngoài gamut. Một con số
 * đếm ("7 token ngoài gamut") sẽ vẫn xanh khi 7 màu này được sửa và 7 màu KHÁC
 * hỏng ra — đúng kiểu cổng tự chứng nhận cho chính thứ nó sinh ra để chặn
 * (`rules/pinned-baseline-test-companion.md`).
 *
 * Cổng chạy HAI CHIỀU, và cả hai đều cần thiết:
 *   • chiều lên  — token ngoài gamut mà KHÔNG có trong danh sách ⇒ đỏ. Đây là
 *     cái chặn token MỚI đi ra ngoài gamut, tức giữ cho mọi số đo mới là số
 *     thật.
 *   • chiều xuống — token trong danh sách mà nay ĐÃ vào gamut ⇒ cũng đỏ. Thiếu
 *     chiều này thì danh sách biến thành nghĩa địa không ai rà lại.
 *
 * ⚠ Khi chiều xuống đỏ, việc phải làm là XOÁ dòng đó khỏi danh sách — tuyệt đối
 * không sửa lại giá trị token cho "khớp danh sách". Đỏ ở chiều xuống là TIN
 * MỪNG: một màu vừa được sửa.
 */
const KNOWN_OUT_OF_GAMUT: Readonly<Record<string, string>> = {
  // Năm token này có TỪ TRƯỚC lane nền thị giác (13.x) và không thuộc phạm vi
  // sửa của nó. Ghi nợ tại đây, sửa ở một thay đổi riêng.
  //
  // ✅ 2026-09-08 — HAI dòng đã được XOÁ khỏi danh sách này, và đó là tin mừng
  // đúng như chiều-xuống của cổng dưới đây dặn: `.dark --primary` và
  // `.dark --ring` (cũ: `oklch(0.685 0.169 262.881)`, chroma 0.169 vượt gamut ở
  // L=0.685). Thương hiệu đỏ 14.A đặt chúng thành `oklch(0.609 0.242 25)`, và
  // giá trị đó nằm TRONG gamut với dư 0.00534 chroma — chừa biên có chủ ý, xem
  // phép quét L ghi ở `globals.css`. Không dòng nào bị chỉnh cho "khớp danh
  // sách"; danh sách co lại vì màu thật sự đã vào gamut.
  ':root --destructive': 'oklch(0.577 0.245 27.325) — chroma 0.245 vượt gamut ở L=0.577',
  ':root --success': 'oklch(0.518 0.146 150.741) — chroma 0.146 vượt gamut ở L=0.518',
  ':root --warning': 'oklch(0.541 0.15 55.98) — chroma 0.15 vượt gamut ở L=0.541',
  '.dark --destructive': 'oklch(0.704 0.191 22.216) — chroma 0.191 vượt gamut ở L=0.704',
  '.dark --warning': 'oklch(0.769 0.188 70.08) — chroma 0.188 vượt gamut ở L=0.769',
};

describe('gamut sRGB — số đo chỉ đúng khi màu nằm trong gamut', () => {
  /** Đối chứng: nếu `inSrgbGamut` luôn trả `true` thì cả khối dưới vô nghĩa. */
  it('phép kiểm gamut PHÂN BIỆT được hai phía (nếu không, mọi dòng dưới đây là trang trí)', () => {
    expect(inSrgbGamut('oklch(0.546 0.215 262.881)')).toBe(true);
    expect(inSrgbGamut('oklch(0.7 0.4 262.881)')).toBe(false);
  });

  const entries = ([
    [':root', root],
    ['.dark', dark],
  ] as const).flatMap(([label, theme]) =>
    Object.entries(theme)
      .filter(([, value]) => value.startsWith('oklch('))
      .map(([token, value]) => ({ key: `${label} ${token}`, value })),
  );

  it('CHIỀU LÊN — không token nào ngoài gamut mà chưa được ghi nợ', () => {
    const undeclared = entries.filter((e) => !inSrgbGamut(e.value) && KNOWN_OUT_OF_GAMUT[e.key] === undefined);
    expect(
      undeclared.map((e) => `${e.key} = ${e.value}`),
      'token ngoài gamut MỚI: trình duyệt sẽ gamut-map nó khác với clamp của phép đo, nên tỉ lệ đo được ' +
        'không còn tả đúng màu hiển thị. Hạ chroma cho vào gamut — KHÔNG ghi thêm vào KNOWN_OUT_OF_GAMUT ' +
        'trừ khi có lý do bằng văn bản như bảy dòng đang có.',
    ).toEqual([]);
  });

  it('CHIỀU XUỐNG — không dòng ghi nợ nào đã hết hạn', () => {
    const known = new Set(entries.filter((e) => !inSrgbGamut(e.value)).map((e) => e.key));
    const stale = Object.keys(KNOWN_OUT_OF_GAMUT).filter((key) => !known.has(key));
    expect(
      stale,
      'dòng ghi nợ này đã VÀO gamut (hoặc token đã bị xoá/đổi tên). Đó là tin mừng: XOÁ dòng đó khỏi ' +
        'KNOWN_OUT_OF_GAMUT. Tuyệt đối không chỉnh token ngược lại cho khớp danh sách.',
    ).toEqual([]);
  });

  it('token độ khó / trạng thái đều TRONG gamut (số đo của chúng là số thật)', () => {
    const semantic = entries.filter((e) => /--(difficulty|status)-/.test(e.key));
    // Nếu bộ lọc hụt, khối này xanh vì rỗng — ghim số lượng để không xanh khống.
    expect(semantic).toHaveLength(24);
    expect(semantic.filter((e) => !inSrgbGamut(e.value)).map((e) => e.key)).toEqual([]);
  });
});

/**
 * `prefers-reduced-motion` được khai MỘT LẦN ở `globals.css` để cả năm lane
 * thừa hưởng. Gác ở đây vì đây là thứ không lane nào tự kiểm được, và khi thiếu
 * thì nó hỏng IM LẶNG: trang vẫn chạy, chỉ là người bật cờ giảm chuyển động
 * không được tôn trọng — không lỗi build, không lỗi runtime.
 */
describe('D4 — prefers-reduced-motion khai một lần, dùng chung', () => {
  const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1];

  it('có khối @media (prefers-reduced-motion: reduce)', () => {
    expect(block, 'thiếu khối reduced-motion ⇒ mọi lane phải tự nhớ, tức sẽ có lane quên').toBeDefined();
  });

  it('phủ bằng bộ chọn phổ quát — tiện ích Tailwind KHÔNG đọc --motion-*', () => {
    // `transition-colors` & co. sinh ra `transition-duration` riêng; hạ
    // `--motion-*` về 0 sẽ bỏ sót đúng những chỗ đó.
    expect(block).toMatch(/\*::before/);
    expect(block).toMatch(/\*::after/);
  });

  it('tắt được CẢ transition lẫn animation, và bằng !important', () => {
    expect(block).toMatch(/transition-duration:[^;]*!important/);
    expect(block).toMatch(/animation-duration:[^;]*!important/);
  });

  /**
   * 0.01ms chứ không phải 0s: thời lượng 0 khiến `transitionend` KHÔNG BAO GIỜ
   * bắn, làm chết mọi logic chờ sự kiện đó (menu không đóng, dialog không dọn).
   * 0.01ms tức thì với mắt người mà sự kiện vẫn bắn.
   */
  it('dùng 0.01ms, KHÔNG dùng 0s (0s làm transitionend không bao giờ bắn)', () => {
    expect(block).toMatch(/0\.01ms/);
    expect(block).not.toMatch(/duration:\s*0s/);
  });
});
