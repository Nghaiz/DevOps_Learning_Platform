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
] as const;

type ColorToken = (typeof C1_COLOR_TOKENS)[number];

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

// ─── oklch → sRGB tuyến tính → độ chói tương đối (WCAG 2.1) ──────────────────

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

function relativeLuminance(rgb: LinearRgb): number {
  return 0.2126 * clamp(rgb[0]) + 0.7152 * clamp(rgb[1]) + 0.0722 * clamp(rgb[2]);
}

function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Token trong suốt (`oklch(1 0 0 / 12%)` — `--border`/`--input` ở `.dark`) phải
 * được ĐÈ LÊN nền trước khi đo. Đo màu trong suốt như thể nó đục sẽ cho một
 * con số đẹp hơn thực tế: `oklch(1 0 0)` trên nền đen ra 21:1 trong khi cái
 * người dùng thật sự nhìn thấy là 12% của nó.
 */
function resolve(theme: Record<string, string>, token: ColorToken, backdrop?: LinearRgb): LinearRgb {
  const raw = theme[token] ?? root[token];
  if (raw === undefined) throw new Error(`Token ${token} không có ở cả theme lẫn :root`);
  const parsed = parseOklch(raw);
  const rgb = toLinearRgb(parsed);
  if (parsed.alpha >= 1) return rgb;
  if (backdrop === undefined) throw new Error(`${token} trong suốt — cần nền để đè lên`);
  return [
    clamp(rgb[0]) * parsed.alpha + clamp(backdrop[0]) * (1 - parsed.alpha),
    clamp(rgb[1]) * parsed.alpha + clamp(backdrop[1]) * (1 - parsed.alpha),
    clamp(rgb[2]) * parsed.alpha + clamp(backdrop[2]) * (1 - parsed.alpha),
  ];
}

function measure(theme: Record<string, string>, foreground: ColorToken, background: ColorToken): number {
  const bg = resolve(theme, background);
  const fg = resolve(theme, foreground, bg);
  return contrastRatio(relativeLuminance(fg), relativeLuminance(bg));
}

// ─── Kiểm ────────────────────────────────────────────────────────────────────

describe('C1 — token có mặt ở CẢ HAI theme', () => {
  it.each(C1_COLOR_TOKENS)('%s khai ở :root', (token) => {
    expect(root[token], `${token} thiếu trong :root`).toBeDefined();
  });

  it.each(C1_COLOR_TOKENS)('%s khai ở .dark', (token) => {
    expect(dark[token], `${token} thiếu trong .dark — chế độ tối sẽ kế thừa màu sáng trong im lặng`).toBeDefined();
  });

  it('`--radius` khai ở :root (CỐ Ý không lặp ở .dark — số đo hình học, không đổi theo theme)', () => {
    expect(root['--radius']).toBeDefined();
    expect(dark['--radius']).toBeUndefined();
  });

  it('không có token màu THỪA ngoài hợp đồng C1 (thêm token = phải sửa C1 + docs/design-system.md)', () => {
    const declared = Object.keys(root).filter((name) => name !== '--radius');
    expect(declared.toSorted()).toEqual([...C1_COLOR_TOKENS].toSorted());
  });
});

describe('C1 — `@theme inline` sinh được class Tailwind cho mọi token', () => {
  it.each(C1_COLOR_TOKENS)('%s có `--color-*` trỏ đúng về nó', (token) => {
    const mapped = themeInline[`--color${token.slice(1)}`];
    expect(mapped, `thiếu --color${token.slice(1)} ⇒ class bg/text/border tương ứng KHÔNG được sinh ra`).toBe(
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
  ['--success-foreground', '--success'],
  ['--warning-foreground', '--warning'],
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
  ['--ring', '--background'],
  ['--ring', '--card'],
  ['--primary', '--background'],
  ['--destructive', '--background'],
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
 * Đối chứng ÂM cho chính phép đo. Không có nó, cả khối trên có thể xanh vì
 * `measure()` hỏng theo hướng trả số lớn — một cổng không bao giờ đỏ được thì
 * không gác gì cả (`rules/green-that-proves-nothing.md`).
 */
describe('đối chứng — phép đo contrast biết kêu', () => {
  it('cùng một màu với chính nó = 1.00:1 (không phải một số lớn nào đó)', () => {
    expect(measure(root, '--background', '--background')).toBeCloseTo(1, 5);
  });

  it('đen trên trắng = 21:1, đúng trần lý thuyết của WCAG', () => {
    const white = toLinearRgb({ l: 1, c: 0, h: 0, alpha: 1 });
    const black = toLinearRgb({ l: 0, c: 0, h: 0, alpha: 1 });
    expect(contrastRatio(relativeLuminance(white), relativeLuminance(black))).toBeCloseTo(21, 2);
  });

  it('alpha ĐƯỢC đè lên nền, không bị bỏ qua — 12% trắng trên nền tối tối hơn hẳn 100% trắng', () => {
    const bg = resolve(dark, '--background');
    const opaqueWhite = contrastRatio(
      relativeLuminance(toLinearRgb({ l: 1, c: 0, h: 0, alpha: 1 })),
      relativeLuminance(bg),
    );
    const translucent = measure(dark, '--border', '--background');
    expect(translucent).toBeLessThan(opaqueWhite / 2);
  });

  it('giá trị `--input` sáng ĐÃ TỪNG hỏng: 0.922 cho 1.26:1, dưới ngưỡng 3:1', () => {
    // Ghim lại con số của lỗi đã sửa. Nếu ai đó đưa `--input` về 0.922 thì
    // khối `NON_TEXT_PAIRS` ở trên đỏ; test này giải thích vì sao con số cũ
    // sai, để lần sau không có ai "khôi phục giá trị shadcn gốc" trong yên
    // lặng.
    const old = toLinearRgb({ l: 0.922, c: 0, h: 0, alpha: 1 });
    const white = toLinearRgb({ l: 1, c: 0, h: 0, alpha: 1 });
    expect(contrastRatio(relativeLuminance(old), relativeLuminance(white))).toBeLessThan(3);
  });
});
