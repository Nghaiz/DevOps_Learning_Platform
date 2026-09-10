import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AC-6 của `plans/devops-learning-platform/contracts/p16-tokens.md` §10 — thang
 * chữ, giãn dòng, và stack font.
 *
 * ## Vì sao đây là một file riêng chứ không thêm vào `tokens.contract.test.ts`
 *
 * File kia đo MÀU: nó dựng cả một chuỗi oklch → sRGB → độ chói và mọi khẳng
 * định của nó là một tỉ lệ tương phản. File này đo CHỮ: nó cần một bộ tính
 * `clamp()` và một đơn vị viewport, không dùng lại một dòng nào của chuỗi kia.
 * Gộp vào sẽ cho một file 1200 dòng mà hai nửa không chia sẻ gì ngoài hàm đọc
 * file.
 *
 * ## Ba thứ được gác, và cả ba hỏng IM LẶNG
 *
 * 1. **Cỡ chữ trôi khỏi mốc đã chốt.** `clamp()` luôn render ra một con số hợp
 *    lệ, nên đổi hệ số `vw` không gây lỗi gì — chỉ là chữ ở 360px nhỏ hơn ý
 *    định vài pixel. Không ai phát hiện bằng mắt; phải TÍNH.
 * 2. **Biểu thức thuần `vw`.** `font-size: 4vw` bỏ qua HOÀN TOÀN cài đặt cỡ chữ
 *    của người dùng — trượt SC 1.4.4 Resize Text. Trang vẫn đẹp trên máy người
 *    viết code, và không cổng nào khác trong repo đo điều này: axe-core không
 *    có rule cho nó.
 * 3. **`--font-mono` kéo thêm một font tải về.** Code inline (`kubectl get
 *    pods`) phải dùng stack HỆ. Một `url()` lọt vào đây là thêm một request
 *    chặn render trên mọi trang có code — và nó trông y hệt một dòng token
 *    bình thường.
 */

/**
 * ⚠ KHÔNG dùng `import.meta.url`: vitest cấp cho module một URL scheme
 * `http://localhost/` trong môi trường jsdom, nên `fileURLToPath()` ném
 * `TypeError` NGAY LÚC NẠP — cả file báo "0 test" thay vì một assertion đỏ.
 * Cùng lập luận (và cùng tám dòng) đã ghi ở `tokens.contract.test.ts` và
 * `design-system.contract.test.tsx`.
 */
function workspaceRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Không tìm thấy gốc workspace từ ' + process.cwd());
    dir = parent;
  }
}

const ROOT = workspaceRoot();
const css = readFileSync(resolvePath(ROOT, 'apps/web/src/app/globals.css'), 'utf8');
const layout = readFileSync(resolvePath(ROOT, 'apps/web/src/app/layout.tsx'), 'utf8');

/** Cắt khối top-level theo độ sâu ngoặc — `@theme` chứa `clamp(...)` lồng nhau. */
function blockBody(source: string, selector: string): string {
  const lines = source.split(/\r?\n/);
  let depth = 0;
  let found = false;
  const buffer: string[] = [];
  for (const line of lines) {
    if (!found) {
      const match = /^([^{]*?)\s*\{\s*$/.exec(line);
      if (match !== null && match[1] !== undefined && match[1].trim() === selector) {
        found = true;
        depth = 1;
      }
      continue;
    }
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (depth <= 0) break;
    buffer.push(line);
  }
  if (!found) throw new Error(`Không tìm thấy khối \`${selector}\` trong globals.css`);
  return buffer.join('\n');
}

function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const chunk of body.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const match = /(--[a-z0-9-]+)\s*:\s*([\s\S]+)/i.exec(chunk);
    if (match?.[1] !== undefined && match[2] !== undefined) out[match[1]] = match[2].trim();
  }
  return out;
}

const theme = declarations(blockBody(css, '@theme'));
const root = declarations(blockBody(css, ':root'));

// ─── Bộ tính giá trị CSS chiều dài ───────────────────────────────────────────

/** `1rem` = 16px — cỡ gốc mặc định của trình duyệt, và là mốc mà bảng §3.2 dùng. */
const REM_PX = 16;

/**
 * Tính một biểu thức chiều dài đơn giản ra px tại một bề rộng viewport.
 *
 * CỐ Ý chỉ nhận `rem`, `px`, `vw` nối bằng `+`/`-` — không dựng một bộ phân
 * tích CSS đầy đủ. Hai lý do: mọi giá trị trong §3.2/§4 đều nằm trong tập đó,
 * và một bộ phân tích rộng hơn sẽ ÂM THẦM nuốt một biểu thức nó không hiểu rồi
 * trả về một con số nào đó. Ở đây gặp token lạ là NÉM, nên một cú pháp mới bắt
 * buộc phải đi qua người sửa file này.
 */
function lengthPx(expression: string, viewportPx: number): number {
  const terms = expression
    .trim()
    .replace(/\s*([+-])\s*/g, ' $1 ')
    .split(/\s+/)
    .filter((t) => t !== '');

  let total = 0;
  let sign = 1;
  for (const term of terms) {
    if (term === '+') {
      sign = 1;
      continue;
    }
    if (term === '-') {
      sign = -1;
      continue;
    }
    const match = /^([0-9.]+)(rem|px|vw)$/.exec(term);
    if (match?.[1] === undefined || match[2] === undefined) {
      throw new Error(`Số hạng không hiểu được: "${term}" trong "${expression}"`);
    }
    const value = Number(match[1]);
    const unit = match[2];
    const px = unit === 'rem' ? value * REM_PX : unit === 'px' ? value : (value * viewportPx) / 100;
    total += sign * px;
    sign = 1;
  }
  return total;
}

/** Tách `clamp(a, b, c)` ở mức đỉnh; trả `null` nếu không phải `clamp()`. */
function splitClamp(value: string): readonly [string, string, string] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('clamp(') || !trimmed.endsWith(')')) return null;
  const inner = trimmed.slice('clamp('.length, -1);
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of inner) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  if (parts.length !== 3) throw new Error(`clamp() phải có đúng 3 số hạng: ${value}`);
  return [parts[0] as string, parts[1] as string, parts[2] as string];
}

/** Giá trị THẬT SỰ render ra tại một bề rộng viewport, đã áp min/max của clamp. */
function renderedPx(value: string, viewportPx: number): number {
  const clamp = splitClamp(value);
  if (clamp === null) return lengthPx(value, viewportPx);
  const [min, preferred, max] = clamp;
  return Math.min(Math.max(lengthPx(preferred, viewportPx), lengthPx(min, viewportPx)), lengthPx(max, viewportPx));
}

// ─── §3.2 — thang cỡ chữ ─────────────────────────────────────────────────────

/** Neo hai đầu của hợp đồng: dưới 360 giữ min, trên 1440 giữ max. */
const NARROW = 360;
const WIDE = 1440;

/** Bảng §3.2 nguyên văn: [token, px@360, px@1440]. */
const TYPE_SCALE = [
  ['--text-2xs', 11, 11],
  ['--text-xs', 12, 12],
  ['--text-sm', 14, 14],
  ['--text-base', 16, 16],
  ['--text-lg', 17, 19],
  ['--text-xl', 20, 24],
  ['--text-2xl', 24, 30],
  ['--text-3xl', 30, 40],
  ['--text-4xl', 36, 52],
  ['--text-5xl', 44, 72],
] as const;

describe('AC-6 §3.2 — thang cỡ chữ được TÍNH, không đọc bằng mắt', () => {
  it.each(TYPE_SCALE)('%s = %spx @360 và %spx @1440', (token, atNarrow, atWide) => {
    const value = theme[token];
    expect(value, `${token} vắng mặt trong khối @theme của globals.css`).toBeDefined();
    // Biên ±0.05px: hệ số `vw` của hợp đồng làm tròn tới hai chữ số nên số hạng
    // ưu tiên lệch tối đa vài phần trăm pixel so với mốc — nhỏ hơn một pixel
    // vật lý nhiều lần, mà vẫn chặt hơn mọi sai lệch có nghĩa.
    expect(renderedPx(value as string, NARROW)).toBeCloseTo(atNarrow, 1);
    expect(renderedPx(value as string, WIDE)).toBeCloseTo(atWide, 1);
  });

  /**
   * `--text-base` KHÔNG co giãn, và đó là quyết định chứ không phải sót
   * (§3.2). Một cỡ chữ thân bài trôi theo viewport làm độ dài dòng đo được
   * thành thứ không đoán trước được — lý do thường gặp nhất khiến "fluid type"
   * đọc ra sai. Gác riêng vì bảng trên (11px = 11px) không phân biệt được
   * "cố ý cố định" với "clamp có min = max".
   */
  it('`--text-base` là một giá trị rem CỐ ĐỊNH, không phải clamp()', () => {
    expect(splitClamp(theme['--text-base'] as string)).toBeNull();
    expect(theme['--text-base']).toBe('1rem');
  });

  it('bốn bậc nhỏ nhất cũng cố định — chỉ cỡ TRÌNH BÀY mới co giãn', () => {
    for (const token of ['--text-2xs', '--text-xs', '--text-sm', '--text-base'] as const) {
      expect(splitClamp(theme[token] as string), `${token} không được co giãn`).toBeNull();
    }
  });

  /**
   * ⛔ SC 1.4.4 Resize Text. Một giá trị mà MỌI số hạng đều là `vw` sẽ phớt lờ
   * hoàn toàn cỡ chữ người dùng đặt trong trình duyệt. Phép kiểm là "có ít nhất
   * một số hạng `rem`" ở CẢ ba vế của clamp — min và max cũng phải là `rem`,
   * nếu không thì hai đầu thang vẫn trôi theo viewport.
   */
  it.each(TYPE_SCALE)('%s có số hạng `rem` ở mọi vế — không vế nào thuần vw', (token) => {
    const value = theme[token] as string;
    const clamp = splitClamp(value);
    const parts = clamp === null ? [value] : [...clamp];
    for (const part of parts) {
      expect(part, `vế "${part.trim()}" của ${token} không có số hạng rem ⇒ trượt SC 1.4.4`).toMatch(
        /[0-9.]rem/,
      );
    }
    if (clamp !== null) {
      // min và max phải là rem THUẦN, không lẫn vw: một `max` mang vw thì đầu
      // trên của thang vẫn trôi, và bảng ở trên vẫn xanh vì nó chỉ đo tại 1440.
      expect(clamp[0]).not.toMatch(/vw/);
      expect(clamp[2]).not.toMatch(/vw/);
    }
  });
});

describe('AC-6 §3.3 — giãn dòng và độ dài dòng', () => {
  it.each([
    ['--leading-tight', '1.15'],
    ['--leading-snug', '1.35'],
    ['--leading-normal', '1.6'],
    ['--leading-loose', '1.75'],
  ])('%s = %s', (token, expected) => {
    expect(theme[token]).toBe(expected);
  });

  /**
   * 1.6 chứ không 1.5, và lý do là TIẾNG VIỆT: dấu xếp chồng cao (`ế`, `ộ`,
   * `ỹ`, `ằ`) nên ở 1.5 dấu của dòng dưới chạm bụng chữ dòng trên. Ghim con số
   * để một lần "chuẩn hoá về 1.5 cho giống shadcn" là đỏ.
   */
  it('`--leading-normal` KHÔNG phải 1.5 — 1.5 làm dấu tiếng Việt chạm dòng trên', () => {
    expect(theme['--leading-normal']).not.toBe('1.5');
    expect(Number(theme['--leading-normal'])).toBeGreaterThanOrEqual(1.6);
  });

  it('`--measure` = 68ch (không phải 65ch — Be Vietnam Pro có chữ hẹp hơn trung bình)', () => {
    expect(root['--measure']).toBe('68ch');
  });

  /**
   * Bảng theme mặc định của Tailwind v4 khai sẵn `--text-*--line-height` cho
   * MỌI cỡ, và ghi đè `--text-base` KHÔNG xoá cặp đó. Bỏ trống thì `text-base`
   * vẫn phát `line-height: 1.5` của Tailwind, âm thầm đè lên bảng ngay trên.
   */
  it.each(TYPE_SCALE)('%s có cặp `--*--line-height` trỏ về một token --leading-*', (token) => {
    const paired = theme[`${token}--line-height`];
    expect(
      paired,
      `thiếu ${token}--line-height ⇒ Tailwind giữ line-height mặc định của nó và đè bảng §3.3`,
    ).toBeDefined();
    expect(paired).toMatch(/^var\(--leading-(tight|snug|normal|loose)\)$/);
  });
});

describe('AC-6 §4 — nhịp dọc một chặng', () => {
  /**
   * ⚠ LỆCH ĐÃ ĐO so với bảng §4 của hợp đồng, ghim ở đây thay vì nới biên.
   *
   * Hợp đồng ghi "@1440px = 96px". Giá trị thật `clamp(3rem, 2rem + 4.44vw,
   * 6rem)` cho `32 + 63.936 = 95.936` tại 1440 — dưới `max` 6rem, nên clamp
   * KHÔNG kẹp và kết quả là 95.936, hụt **0.064px**. Hệ số đúng để chạm đúng
   * mốc là `4.4444vw`.
   *
   * Vì sao pin chứ không sửa: `globals.css` do lane token sở hữu và giá trị
   * 4.44 là con số hợp đồng viết ra; sửa nó ở đây là một lane đổi hợp đồng của
   * lane khác. Vì sao không nới `toBeCloseTo(96, 1)` thành `(96, 0)`: biên
   * ±0.5px sẽ nuốt luôn một lần đổi hệ số thật sự (4.44 → 4.4) — tức đổi một
   * phép đo lấy một sự im lặng.
   *
   * Cả mười dòng §3.2 đều lọt trong ±0.05px; chỉ dòng này không, nên nó là một
   * lệch riêng lẻ chứ không phải một sai số hệ thống của bộ tính.
   */
  it('`--section-y` = 48px @360; @1440 đo được 95.936px (hụt 0.064 so với mốc 96 của §4)', () => {
    const value = root['--section-y'] as string;
    expect(value).toBeDefined();
    expect(renderedPx(value, NARROW)).toBeCloseTo(48, 1);
    expect(renderedPx(value, WIDE)).toBeCloseTo(95.936, 2);
    // Companion: nếu ai đó sửa hệ số cho chạm đúng 96 thì dòng trên ĐỎ, và
    // việc phải làm là ghim 96 rồi xoá cả khối chú thích này — không phải nới
    // biên cho cả hai giá trị cùng lọt.
    expect(renderedPx(value, WIDE)).toBeLessThan(lengthPx('6rem', WIDE));
  });

  it('`--spacing` = 0.25rem — ghim biến gốc, KHÔNG dựng thang --space-1..24 song song', () => {
    expect(theme['--spacing']).toBe('0.25rem');
  });
});

// ─── §3.1 — font ─────────────────────────────────────────────────────────────

describe('AC-6 §3.1 — stack font', () => {
  const themeInline = declarations(blockBody(css, '@theme inline'));

  it('`--font-sans` mở đầu bằng `var(--font-be-vietnam-pro)`', () => {
    expect((themeInline['--font-sans'] as string).trim()).toMatch(/^var\(--font-be-vietnam-pro\)/);
  });

  it('`--font-sans` có fallback THẬT, không chỉ mỗi biến font', () => {
    // Nếu `next/font` hỏng lúc build thì biến rỗng; thiếu stack thật thì trình
    // duyệt rơi về serif mặc định thay vì một sans đọc được.
    const sans = themeInline['--font-sans'] as string;
    expect(sans).toContain('system-ui');
    expect(sans).toContain('sans-serif');
    expect(sans.toLowerCase()).not.toContain('poppins');
  });

  it('`--font-mono` mở đầu bằng `ui-monospace` — stack HỆ, không tải font nào', () => {
    expect((themeInline['--font-mono'] as string).trim()).toMatch(/^ui-monospace/);
  });

  /**
   * 0 lần `url(` và 0 lần `@font-face` — nhưng đo trên CHÍNH giá trị
   * `--font-mono`, không phải trên cả file: `globals.css` hoàn toàn có quyền
   * chứa `@font-face` cho thứ khác (terminal giữ `dlp-terminal-nf.woff2`, và
   * đó là ngoại lệ §3.1 nói rõ). Quét cả file sẽ bắt nhầm đúng ngoại lệ ấy.
   */
  it('`--font-mono` chứa 0 lần `url(` và 0 lần `@font-face`', () => {
    const mono = themeInline['--font-mono'] as string;
    expect(mono).not.toContain('url(');
    expect(mono).not.toContain('@font-face');
  });

  it('lời gọi `next/font/google` ở layout.tsx còn nguyên subset `vietnamese`', () => {
    expect(layout).toContain("from 'next/font/google'");
    expect(layout).toMatch(/Be_Vietnam_Pro\(/);
    expect(
      layout,
      'mất subset `vietnamese` ⇒ chữ có dấu rơi về font fallback, và dấu dựng bằng ' +
        'glyph ghép trông lệch hẳn so với phần còn lại của câu',
    ).toMatch(/subsets:\s*\[[^\]]*'vietnamese'/);
    expect(layout).toMatch(/variable:\s*'--font-be-vietnam-pro'/);
  });
});

/**
 * Đối chứng dương cho CHÍNH bộ tính ở trên. Không có khối này thì mọi khẳng
 * định phía trên chỉ chứng minh "bộ tính nhất quán với chính nó" — đúng lớp lỗi
 * `rules/green-that-proves-nothing.md` mô tả.
 */
describe('AC-6 đối chứng — bộ tính clamp biết kêu', () => {
  it('tính đúng một clamp làm tay: clamp(1rem, 0.5rem + 2vw, 3rem)', () => {
    // @360: 8 + 7.2 = 15.2 < min 16 ⇒ 16.   @1440: 8 + 28.8 = 36.8 < max 48 ⇒ 36.8.
    expect(renderedPx('clamp(1rem, 0.5rem + 2vw, 3rem)', 360)).toBeCloseTo(16, 5);
    expect(renderedPx('clamp(1rem, 0.5rem + 2vw, 3rem)', 1440)).toBeCloseTo(36.8, 5);
  });

  it('MIN và MAX thật sự được áp — không phải chỉ tính số hạng ưu tiên', () => {
    expect(renderedPx('clamp(2rem, 0rem + 1vw, 3rem)', 360)).toBeCloseTo(32, 5);
    expect(renderedPx('clamp(2rem, 0rem + 1vw, 3rem)', 100000)).toBeCloseTo(48, 5);
  });

  it('một giá trị thuần `vw` TRƯỢT phép kiểm số hạng rem (nếu không, luật SC 1.4.4 là trang trí)', () => {
    expect('4vw').not.toMatch(/[0-9.]rem/);
    expect('clamp(1rem, 4vw, 2rem)'.includes('rem')).toBe(true);
    // Vế giữa của clamp trên là `4vw` thuần — đúng hình dạng mà phép kiểm bắt.
    const parts = splitClamp('clamp(1rem, 4vw, 2rem)');
    expect(parts).not.toBeNull();
    expect((parts as readonly string[])[1]).not.toMatch(/[0-9.]rem/);
  });

  it('số hạng lạ thì NÉM, không im lặng trả về một con số nào đó', () => {
    expect(() => renderedPx('1rem + 3em', 360)).toThrow(/không hiểu được/);
    expect(() => renderedPx('calc(1rem * 2)', 360)).toThrow();
  });
});
