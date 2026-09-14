import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCENT_STYLE, EDGE_STYLE, REF_STYLE, accentLabel, cssVar } from './git-palette.ts';

/**
 * Bảng màu game Git — ba kênh (17.C.4) và tương phản hai theme (17.C.5).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO Ô TƯƠNG PHẢN Ở ĐÂY KHÔNG TỰ TÍNH LẠI oklch → sRGB
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `packages/ui/src/theme/tokens.contract.test.ts` đã có phép đo đó, ĐANG CHẠY,
 * và đã có đối chứng dương ("bẻ gãy một token, cả pipeline phải ĐỎ"). Chép ~60
 * dòng số học màu sang đây sẽ dựng một bản cài đặt THỨ HAI của cùng một phép
 * đo, và hai bản sẽ lệch nhau — đúng hình dạng hỏng mà `docs/code-conventions.md`
 * § No Duplicated Logic nói tới, và repo này đã trả giá vài lần.
 *
 * Cách gác ở đây mạnh hơn và rẻ hơn: **ĐỌC danh sách cặp mà cổng kia đang gác**
 * rồi khẳng định mọi cặp chữ/nền của bảng màu này nằm trong danh sách đó. Khi
 * đúng như vậy, câu "mọi cặp chữ/nền đạt ≥ 4.5:1 ở cả hai theme" không còn là
 * một lời khai trong chú thích — nó là hệ quả của một cổng đang chạy.
 *
 * Phép đọc dùng chính hình dạng literal `['--x', '--y'],` của file đó. Nếu file
 * bị đổi tên hay đổi hình dạng, ô "tập đầu vào không rỗng" ở dưới ĐỎ — và đó là
 * hành vi đúng: cổng đã dời chỗ thì phải có người biết.
 */

const UI_CONTRACT = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'ui',
  'src',
  'theme',
  'tokens.contract.test.ts',
);

const GLOBALS_CSS = path.resolve(import.meta.dirname, '..', '..', '..', 'app', 'globals.css');

function pairsIn(source: string, constName: string): ReadonlySet<string> {
  const start = source.indexOf(`const ${constName}`);
  if (start < 0) throw new Error(`Không tìm thấy ${constName} trong tokens.contract.test.ts`);
  const end = source.indexOf('\n];', start);
  const block = source.slice(start, end);
  const out = new Set<string>();
  for (const m of block.matchAll(/\['(--[a-z0-9-]+)',\s*'(--[a-z0-9-]+)'\]/g)) {
    out.add(`${m[1]} on ${m[2]}`);
  }
  return out;
}

const contractSource = readFileSync(UI_CONTRACT, 'utf8');
const TEXT_PAIRS = pairsIn(contractSource, 'TEXT_PAIRS');
const NON_TEXT_PAIRS = pairsIn(contractSource, 'NON_TEXT_PAIRS');
const cssSource = readFileSync(GLOBALS_CSS, 'utf8');

/**
 * Cặp nét-vẽ/nền mà cổng kia CHƯA gác, kèm số đo lấy từ lượt đo 2026-09-14
 * (cùng phép toán, chạy ngoài cây — xem đầu `git-palette.ts`).
 *
 * Đây là một sổ cái HAI CHIỀU, cùng khuôn `KNOWN_HARDCODED` của cổng màu: một
 * dòng ở đây mà cổng kia đã nhận gác ⇒ ô dưới ĐỎ và việc phải làm là XOÁ dòng,
 * không phải giữ lại "cho chắc". `rules/pinned-baseline-test-companion.md`.
 */
const MEASURED_ELSEWHERE: Readonly<Record<string, string>> = {
  '--success on --background': 'sáng 5.17 · tối 7.82 — viền ô commit vừa tạo',
  '--warning on --background': 'sáng 5.29 · tối 9.23 — nền nhãn tag trên nền cảnh',
};

describe('T0 · phép đọc nhìn thấy một tập THẬT', () => {
  it('đọc được cả hai danh sách cặp của tokens.contract.test.ts', () => {
    expect(TEXT_PAIRS.size).toBeGreaterThan(15);
    expect(NON_TEXT_PAIRS.size).toBeGreaterThan(10);
    // Mốc: ba cặp chắc chắn phải có. Một lượt đổi hình dạng literal làm ô này đỏ.
    expect(TEXT_PAIRS.has('--primary-foreground on --primary')).toBe(true);
    expect(TEXT_PAIRS.has('--muted-foreground on --background')).toBe(true);
    expect(NON_TEXT_PAIRS.has('--input on --background')).toBe(true);
  });

  it('đọc được globals.css', () => {
    expect(cssSource).toContain('--background:');
    expect(cssSource).toContain('.dark');
  });
});

describe('17.C.5 · mọi cặp chữ/nền đã được một cổng ĐANG CHẠY gác ≥ 4.5:1', () => {
  const textPairs = [
    ...Object.entries(ACCENT_STYLE).map(([name, s]) => [`accent ${name}`, s.text, s.fill] as const),
    ...Object.entries(REF_STYLE).map(([name, s]) => [`ref ${name}`, s.text, s.fill] as const),
  ];

  it.each(textPairs)('%s — %s trên %s nằm trong TEXT_PAIRS', (_what, fg, bg) => {
    const key = `${fg} on ${bg}`;
    /*
      Ngoại lệ DUY NHẤT: nhãn HEAD đảo màu (`--background` trên `--foreground`).
      Cổng kia gác chiều ngược lại (`--foreground` trên `--background`, dòng
      828), và tỉ lệ tương phản ĐỐI XỨNG theo định nghĩa WCAG — (L1+0.05)/(L2+0.05)
      không phụ thuộc bên nào là chữ. Nên nó đã được gác, chỉ là dưới tên chiều
      kia. Đo lại xác nhận: 10.81 / 18.15, đúng bằng chiều thuận.
    */
    const symmetric = `${bg} on ${fg}`;
    expect(
      TEXT_PAIRS.has(key) || TEXT_PAIRS.has(symmetric),
      `${key} chưa có cổng nào gác. Hoặc dùng cặp X / X-foreground, hoặc xin lead thêm cặp này vào TEXT_PAIRS.`,
    ).toBe(true);
  });

  it('mọi cặp accent theo đúng luật X / X-foreground', () => {
    for (const [name, style] of Object.entries(ACCENT_STYLE)) {
      expect(style.text, `accent ${name}`).toBe(`${style.fill}-foreground`);
    }
  });
});

describe('17.C.5 · nét vẽ mang nghĩa đạt ngưỡng SC 1.4.11', () => {
  /*
    Ba nhóm đồ hoạ MANG NGHĨA nằm trên nền cảnh: nét cạnh, viền ô commit, và
    NỀN nhãn ref (một badge tô đặc là một hình có ranh giới với nền — SC 1.4.11
    áp cho ranh giới đó).

    ⛔ NỀN ô commit CỐ Ý không có mặt ở đây. `--card` trên `--background` đo được
    **1.00** ở nhánh sáng (cả hai là `oklch(1 0 0)` — trắng trên trắng), nên đòi
    nó đạt 3:1 là đòi đổi token của cả hệ. Thứ vẽ ra ô là VIỀN, và viền thì có
    trong danh sách. Đây là một quyết định có số, không phải một chỗ bỏ sót.
  */
  const graphics = [
    ...Object.entries(EDGE_STYLE).map(([kind, s]) => [`edge ${kind}`, s.stroke] as const),
    ...Object.entries(ACCENT_STYLE).map(([name, s]) => [`viền accent ${name}`, s.stroke] as const),
    ...Object.entries(REF_STYLE).map(([name, s]) => [`nền nhãn ${name}`, s.fill] as const),
  ];

  it.each(graphics)('%s (%s) trên --background đã được gác hoặc đã đo', (_what, token) => {
    const key = `${token} on --background`;
    expect(
      TEXT_PAIRS.has(key) || NON_TEXT_PAIRS.has(key) || Object.hasOwn(MEASURED_ELSEWHERE, key),
      `${key} không có cổng nào gác và cũng không có số đo ghi lại.`,
    ).toBe(true);
  });

  it('chiều xuống của sổ cái — dòng đã được cổng kia nhận gác thì phải XOÁ', () => {
    const stale = Object.keys(MEASURED_ELSEWHERE).filter(
      (key) => TEXT_PAIRS.has(key) || NON_TEXT_PAIRS.has(key),
    );
    expect(
      stale,
      'Cổng của packages/ui nay đã gác các cặp này. Tin mừng: XOÁ chúng khỏi MEASURED_ELSEWHERE.',
    ).toEqual([]);
  });

  it('sổ cái không có DÒNG CHẾT — mỗi dòng phải đang gác một thứ có thật', () => {
    const used = new Set(graphics.map(([, token]) => `${token} on --background`));
    const dead = Object.keys(MEASURED_ELSEWHERE).filter((key) => !used.has(key));
    expect(
      dead,
      'Không đồ hoạ nào dùng token này nữa. Một dòng sổ cái không gác gì là trang trí — XOÁ.',
    ).toEqual([]);
  });

  it('nền ô commit gần như vô hình trên nền cảnh, nên VIỀN phải là token đã gác', () => {
    // Ghim đúng hai trạng thái mà nền của chúng đo được < 1.5:1 so với nền cảnh.
    for (const name of ['normal', 'orphaned'] as const) {
      const style = ACCENT_STYLE[name];
      const key = `${style.stroke} on --background`;
      expect(TEXT_PAIRS.has(key) || NON_TEXT_PAIRS.has(key), `${name}: ${key}`).toBe(true);
    }
  });

  it('⛔ KHÔNG dùng --border làm nét vẽ — đo được 1.30 (sáng) / 1.33 (tối), trượt 3:1', () => {
    const all = [
      ...Object.values(EDGE_STYLE).map((s) => s.stroke),
      ...Object.values(ACCENT_STYLE).map((s) => s.stroke),
      ...Object.values(ACCENT_STYLE).map((s) => s.fill),
    ];
    expect(all).not.toContain('--border');
  });
});

describe('17.C.4 · ba kênh cho mỗi trạng thái', () => {
  const accents = Object.entries(ACCENT_STYLE);

  it('sáu trạng thái, không thiếu cái nào', () => {
    expect(accents.map(([name]) => name).sort()).toEqual([
      'conflicted',
      'duplicate',
      'fresh',
      'head',
      'normal',
      'orphaned',
    ]);
  });

  it('không hai trạng thái nào trùng nhau ở KÊNH MÀU', () => {
    const fills = accents.map(([, s]) => s.fill);
    expect(new Set(fills).size).toBe(fills.length);
  });

  it('mỗi cặp trạng thái khác nhau ở ÍT NHẤT HAI kênh ngoài màu', () => {
    /*
      Đây là ô thật sự gác §17.C.4. Một bảng "ba kênh" mà hai trạng thái chỉ
      khác nhau ở màu cộng một kênh phụ vẫn không đọc được khi in đen trắng —
      và in đen trắng là một trong bốn lý do 2D tồn tại (design §2.3).

      Kênh ngoài màu: hình học · chuyển động · sigil. Đòi ≥ 2/3 khác nhau cho
      MỌI cặp, chứ không chỉ "mỗi trạng thái có đủ ba trường".
    */
    for (let i = 0; i < accents.length; i++) {
      for (let j = i + 1; j < accents.length; j++) {
        const a = accents[i]?.[1];
        const b = accents[j]?.[1];
        if (a === undefined || b === undefined) continue;
        const diff =
          (a.shape === b.shape ? 0 : 1) +
          (a.motion === b.motion ? 0 : 1) +
          (a.sigil === b.sigil ? 0 : 1);
        expect(
          diff,
          `${accents[i]?.[0]} và ${accents[j]?.[0]} chỉ khác nhau ở ${diff} kênh ngoài màu`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('chuyển động KHÔNG phải kênh duy nhất phân biệt — nó biến mất dưới reduced-motion', () => {
    for (let i = 0; i < accents.length; i++) {
      for (let j = i + 1; j < accents.length; j++) {
        const a = accents[i]?.[1];
        const b = accents[j]?.[1];
        if (a === undefined || b === undefined) continue;
        // Bỏ kênh chuyển động đi thì vẫn phải còn ít nhất một kênh tĩnh khác.
        const still = (a.shape === b.shape ? 0 : 1) + (a.sigil === b.sigil ? 0 : 1);
        expect(still, `${accents[i]?.[0]} vs ${accents[j]?.[0]}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('bốn loại cạnh phân biệt được mà không cần màu', () => {
    const shapes = Object.values(EDGE_STYLE).map((s) => `${s.width}|${s.dash ?? 'solid'}|${s.joint}`);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it('bốn loại nhãn ref có bốn hình dạng khác nhau', () => {
    const shapes = Object.values(REF_STYLE).map((s) => s.shape);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it('mỗi trạng thái có nhãn tiếng Việt riêng, không nhãn nào rỗng', () => {
    const labels = accents.map(([name]) => accentLabel(name as keyof typeof ACCENT_STYLE));
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label.trim().length).toBeGreaterThan(3);
  });
});

describe('mọi giá trị màu là TÊN TOKEN, và token đó có thật', () => {
  const tokens = [
    ...Object.values(ACCENT_STYLE).flatMap((s) => [s.fill, s.text, s.stroke]),
    ...Object.values(EDGE_STYLE).map((s) => s.stroke),
    ...Object.values(REF_STYLE).flatMap((s) => [s.fill, s.text]),
  ];

  it('không giá trị nào là hex hay thang màu Tailwind', () => {
    for (const token of tokens) {
      expect(token.startsWith('--'), token).toBe(true);
      expect(/#|rgb|oklch|\b(slate|gray|zinc|red|blue|green)-\d/.test(token), token).toBe(false);
    }
  });

  it('mọi token được khai trong globals.css', () => {
    for (const token of new Set(tokens)) {
      expect(cssSource.includes(`${token}:`), `${token} không có trong globals.css`).toBe(true);
    }
  });

  it('cssVar bọc đúng cú pháp var()', () => {
    expect(cssVar('--primary')).toBe('var(--primary)');
  });
});
