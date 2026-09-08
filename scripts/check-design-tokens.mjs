#!/usr/bin/env node
/**
 * Cổng gác MÀU CỨNG — `globals.css` là NGUỒN DUY NHẤT của màu.
 *
 * JSX và CSS chỉ được dùng class/biến NGỮ NGHĨA (`bg-background`,
 * `text-muted-foreground`, `border-destructive`, `var(--primary)`), không bao
 * giờ `#hex` trần, không bao giờ thang màu Tailwind (`slate-700`, `red-500`),
 * không bao giờ `0xRRGGBB`. Quy tắc §5.1 của `docs/design-system.md`.
 *
 * VÌ SAO LÀ MỘT SCRIPT, KHÔNG PHẢI MỘT DÒNG `grep` DÁN TRONG PLAN
 * ---------------------------------------------------------------
 * Bản cũ là một dòng nằm trong `plans/devops-learning-platform/phase-13-exec.md`
 * §5:
 *
 *   grep -rnE '#[0-9a-fA-F]{3,8}|\b(slate|gray|zinc|neutral)-[0-9]{2,3}' \
 *        apps/web/src packages/ui/src --include=*.tsx | grep -v node_modules
 *
 * Ba hệ quả đo được ngày 2026-09-08:
 *
 *   1. KHÔNG job CI nào chạy nó (grep toàn bộ `.github/workflows/`: 0 kết quả).
 *      Cổng chỉ chạy khi có người nhớ chạy — tức là không chạy.
 *   2. Nó KÊU OAN 5/5 lần. Cả năm kết quả nó trả về hôm nay đều là chữ `#fff`
 *      nằm trong CHÚ THÍCH hoặc trong thông điệp assertion giải thích một lỗi
 *      đã sửa (`button.tsx:43`, `button.test.tsx:219/228`, `checkbox.test.tsx:52`,
 *      `switch.test.tsx:51`). Một cổng mà 100% đầu ra là báo động giả thì bị
 *      tắt trong hai tuần.
 *   3. Vùng quét thủng. `--include=*.tsx` bỏ qua mọi file `.ts` và `.css` —
 *      trong khi `apps/web/src/components/games/scene-tokens.ts` (renderer 3D
 *      đọc token) và chính `globals.css` đều là `.ts`/`.css`.
 *
 * Bản này thêm: bỏ dòng chú thích, bỏ file test, mở rộng thang màu ra ĐỦ 22 tên
 * của Tailwind (bản cũ chỉ có 4 — `red-500` lọt), bắt thêm dạng `0xRRGGBB` mà
 * Three.js dùng (hợp đồng §4.5 của phase 14 cấm renderer hardcode màu), và một
 * SỔ CÁI HAI CHIỀU cho các file được miễn trừ.
 *
 * VÌ SAO NODE CHỨ KHÔNG PHẢI `.sh`
 * --------------------------------
 * Cùng lý do đã ghi ở `scripts/check-no-commerce.mjs`: repo có tiền sử script
 * `.sh` CRLF chết từng dòng, và `grep -E` của GNU khác BSD.
 *
 * ĐỐI CHỨNG DƯƠNG NẰM TRONG CHÍNH SCRIPT
 * --------------------------------------
 * Mỗi lần chạy, script tự kiểm nó BẮT được tập mẫu vi phạm đã biết và KHÔNG kêu
 * trên tập mẫu sạch đã biết — TRƯỚC khi quét cây. Tự kiểm hỏng thì thoát 2 và
 * không quét gì cả. Một cổng không tự chứng minh được là nó biết kêu thì chỉ là
 * trang trí (`rules/green-that-proves-nothing.md`).
 *
 * Dùng:
 *   node scripts/check-design-tokens.mjs              # tự kiểm rồi quét cây
 *   node scripts/check-design-tokens.mjs --self-test  # chỉ tự kiểm
 *
 * Mã thoát: 0 sạch · 1 có vi phạm · 2 tự kiểm hỏng / sai cấu hình.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(SELF, '..', '..');

// ─────────────────────────────────────────────────────────────── vùng quét
const ROOTS = ['apps/web/src', 'packages/ui/src', 'packages/terminal/src'];

// `packages/games/src` chỉ tồn tại từ phase 14 — quét nếu có, không bắt buộc,
// để script này chạy được cả trên nhánh chưa có package đó.
const OPTIONAL_ROOTS = ['packages/games/src'];

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  '.artifacts',
  'dist',
  'build',
  'coverage',
  'gen',
  'test-results',
  'playwright-report',
  '__snapshots__',
]);

const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);

/**
 * File test BỊ BỎ QUA, cùng lý do đã ghi ở `check-no-commerce.mjs`: chúng PHẢI
 * chứa thứ bị cấm để gác được nó. `tokens.contract.test.ts` khẳng định
 * `toHex(...) === '#313131'` — đó là PHÉP ĐO, và nếu cổng này cấm nó thì phép
 * đo contrast của cả hệ thống không viết được nữa.
 */
const IS_TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/i;

// ─────────────────────────────────────────────────────────────── luật
//
// Thang màu Tailwind ĐỦ 22 TÊN. Bản grep cũ chỉ có `slate|gray|zinc|neutral`,
// nên `bg-red-500` / `text-blue-600` — đúng thứ người ta hay gõ theo phản xạ
// khi vội — lọt qua hoàn toàn.
//
// Bậc: `50`, `100`…`900`, `950`. KHÔNG dùng `[0-9]{2,3}` như bản cũ: nó khớp cả
// `border-t-0`… không, nhưng nó khớp `gap-20`, `max-h-60`, `size-3.5`? Không —
// vì có tiền tố tên màu. Vấn đề thật của `{2,3}` là nó khớp những bậc KHÔNG tồn
// tại (`red-42`) và bỏ sót `950`. Liệt kê bậc thật thì mẫu vừa chặt vừa đủ.
const TAILWIND_PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|' +
  'cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

const RULES = [
  {
    id: 'thang-màu-tailwind',
    why: 'thang màu Tailwind trần — dùng class ngữ nghĩa (bg-background, text-muted-foreground, …)',
    // `\b` hai đầu: bắt được cả dạng có opacity (`bg-slate-700/50`) vì `\b` khớp
    // giữa `0` và `/`, và cả dạng có variant (`hover:`, `dark:`, `md:`).
    src: String.raw`\b(?:${TAILWIND_PALETTE})-(?:50|[1-9]00|950)\b`,
  },
  {
    id: 'hex-trần',
    why: 'màu hex cứng — màu phải đến từ token trong globals.css',
    // ĐÚNG 3/4/6/8 chữ số hex, dài trước ngắn sau. `[0-9a-fA-F]{3,8}` của bản cũ
    // khớp cả `#12345` (5 chữ số — không phải màu hợp lệ) và, tệ hơn, khớp
    // 3 ký tự đầu của một mảnh URL như `#abcdef-section`.
    //
    // `(?![0-9a-fA-F])` chốt đuôi để `#abc` KHÔNG khớp bên trong `#abcd1234`
    // rồi báo sai cột.
    src: String.raw`#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])`,
  },
  {
    id: 'hex-0x',
    why: 'màu dạng 0xRRGGBB (Three.js) — hợp đồng §4.5: renderer đọc token qua getComputedStyle',
    // Hiện đếm được 0 lần trong cây. Đây là luật ĐI TRƯỚC: trụ cột Games dùng
    // `three`, và `new THREE.Color(0xff0000)` là hình dạng hardcode màu tự
    // nhiên nhất ở đó. Đối chứng dương dưới đây chứng minh nó bắt được, nên
    // luật này không phải một dòng trang trí chờ ngày có việc.
    src: String.raw`0x[0-9a-fA-F]{6}\b`,
  },
];

const COMPILED = RULES.map((r) => ({ ...r, re: new RegExp(r.src, 'gu') }));

// ────────────────────────────────────────────── sổ cái miễn trừ (HAI CHIỀU)
//
// Cùng khuôn `KNOWN_OUT_OF_GAMUT` ở `packages/ui/src/theme/tokens.contract.test.ts`:
// liệt kê ĐÍCH DANH, kèm lý do, và rà cả hai chiều. Một con số đếm
// ("2 file được miễn") sẽ vẫn xanh khi hai file này được sửa và hai file KHÁC
// hỏng ra (`rules/pinned-baseline-test-companion.md`).
//
//   • chiều lên  — file có màu cứng mà KHÔNG có trong sổ ⇒ đỏ.
//   • chiều xuống — file trong sổ mà nay đã SẠCH (hoặc đã bị xoá) ⇒ cũng đỏ,
//     và việc phải làm là XOÁ dòng đó khỏi sổ, không phải thêm màu lại.
// Hai DẠNG miễn trừ, và sự khác nhau giữa chúng là có chủ ý:
//
//   { file: '…', reason: '…' }              — miễn CẢ FILE.
//   { file: '…', allow: [{ match, context, reason }] } — miễn ĐÚNG MỘT giá trị,
//                                              và chỉ trên dòng khớp `context`.
//
// Dạng thứ hai tồn tại vì miễn cả file là quá rộng ở đúng chỗ nguy hiểm nhất.
// `k8s-scene-lazy.tsx` là ví dụ sống: `0xffffff` cho `DirectionalLight` là
// "không tô màu gì cả" (ánh sáng trắng), nhưng `0x000000` cho `THREE.Fog` là
// một MÀU CẢNH phải đổi theo theme — ở nhánh sáng nền trang là `oklch(1 0 0)`
// nên hình ở xa sẽ mờ dần về ĐEN trên nền TRẮNG. Miễn cả file sẽ nuốt luôn con
// sương mù đó.
const KNOWN_HARDCODED = [
  {
    file: 'packages/terminal/src/themes.ts',
    reason:
      'xterm.js nhận màu qua API JS (ITheme), không qua CSS — nó KHÔNG đọc được ' +
      'var(--token). Đây là ranh giới thư viện ngoài, không phải một chỗ lười.',
  },
  // ✅ 2026-09-08 — `apps/web/src/components/games/scene-tokens.ts` ĐÃ ĐƯỢC XOÁ
  // khỏi sổ này, và đó chính là chiều-xuống hoạt động. Nó từng được miễn vì một
  // mốc sentinel `'#000000'` dùng để phát hiện gán `fillStyle` trượt; lane E sau
  // đó viết lại chỗ đó không cần hằng hex nữa, cổng báo dòng miễn trừ HẾT HẠN,
  // nên dòng bị xoá. KHÔNG thêm màu cứng lại cho "khớp sổ cái".
  // ✅ 2026-09-09 — `apps/web/src/components/games/k8s-scene-lazy.tsx` ĐÃ ĐƯỢC
  // XOÁ khỏi sổ này: cả thư mục `components/games/` không còn tồn tại (arena
  // dựng lại ở `components/k8s-arena/`), nên dòng miễn trừ cho `0xffffff` của
  // `DirectionalLight` không còn gác gì cả. Cổng tự báo dòng đã hết hạn và đây
  // là chiều-xuống của sổ cái hoạt động đúng lần thứ hai. Ánh sáng ở bản mới
  // đọc màu từ token qua `use-arena-colors.ts`, nên không cần miễn trừ nào.
];

// ─────────────────────────────────────────────────────── bỏ dòng chú thích
//
// Đây là thứ sửa 5/5 báo động giả của bản grep cũ: `#fff` trong chú thích giải
// thích mặc định của Tailwind, và trong thông điệp assertion mô tả một lỗi đã
// sửa. Cả hai đều PHẢI được viết ra để tài liệu hoá; không cái nào là màu đang
// chạy.
function isCommentLine(trimmed, ext) {
  if (trimmed.startsWith('<!--')) return true;
  if (ext === '.md' || ext === '.mdx') return false;
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
  if (trimmed.startsWith('#') && ext !== '.css') return true;
  return false;
}

// ─────────────────────────────────────────────────────────────── quét
function scanText(text, { ext }) {
  const hits = [];
  const lines = text.normalize('NFC').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (isCommentLine(trimmed, ext)) continue;

    for (const rule of COMPILED) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(raw)) !== null) {
        hits.push({
          line: i + 1,
          col: m.index + 1,
          rule: rule.id,
          why: rule.why,
          match: m[0],
          text: trimmed,
        });
        if (m.index === rule.re.lastIndex) rule.re.lastIndex++;
      }
    }
  }
  return hits;
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      yield* walk(join(dir, e.name));
    } else if (e.isFile()) {
      yield join(dir, e.name);
    }
  }
}

function scanTree() {
  const hits = [];
  const seenExempt = new Set();
  let files = 0;

  // Một root biến mất (đổi tên thư mục) làm vùng quét co lại TRONG IM LẶNG —
  // cổng vẫn xanh vì không còn gì để quét. Thiếu root BẮT BUỘC là hỏng cấu hình.
  const missing = ROOTS.filter((r) => !existsSync(join(REPO, r)));
  if (missing.length) {
    console.error(`LỖI CẤU HÌNH: vùng quét không tồn tại: ${missing.join(', ')}`);
    console.error(
      'Thư mục bị đổi tên/di chuyển ⇒ sửa ROOTS trong scripts/check-design-tokens.mjs.',
    );
    process.exit(2);
  }

  const roots = [...ROOTS, ...OPTIONAL_ROOTS.filter((r) => existsSync(join(REPO, r)))];

  for (const root of roots) {
    for (const abs of walk(join(REPO, root))) {
      if (abs === SELF) continue;
      const rel = relative(REPO, abs).split('\\').join('/');
      const ext = extname(abs).toLowerCase();
      if (!SCAN_EXT.has(ext)) continue;
      if (IS_TEST_FILE.test(abs)) continue;
      if (statSync(abs).size > 2 * 1024 * 1024) continue;

      files++;
      const fileHits = scanText(readFileSync(abs, 'utf8'), { ext });
      if (fileHits.length === 0) continue;

      const entry = KNOWN_HARDCODED.find((e) => e.file === rel);
      if (entry?.allow === undefined && entry !== undefined) {
        seenExempt.add(rel); // miễn CẢ FILE
        continue;
      }
      for (const h of fileHits) {
        const rule = entry?.allow?.find((a) => a.match === h.match && a.context.test(h.text));
        if (rule !== undefined) {
          seenExempt.add(`${rel} :: ${rule.match}`);
          continue;
        }
        hits.push({ ...h, file: rel });
      }
    }
  }
  return { hits, files, seenExempt, roots };
}

// ─────────────────────────────────────────────────────────── đối chứng
//
// BẨN: phải bị bắt. Bốn dòng đầu là hình dạng THẬT đã hỏng trên main — sự cố
// `@source` đo ngày 2026-08-13, khi `ring-slate-400`/`bg-slate-700`/
// `bg-slate-200` trong `packages/ui` không bao giờ được biên dịch (xem đầu
// `globals.css`). Bốn dòng sau là những gì bản grep cũ BỎ LỌT.
const DIRTY = [
  ['sự-cố-2026-08-13-ring', '<span className="ring-slate-400" />', '.tsx'],
  ['sự-cố-2026-08-13-bg', '<div className="bg-slate-700 text-slate-200">Nội dung</div>', '.tsx'],
  ['lọt-cũ-đỏ', '<Button className="bg-red-500 hover:bg-red-600">Xoá</Button>', '.tsx'],
  ['lọt-cũ-lam', '<p className="text-blue-600 dark:text-blue-400">Ghi chú</p>', '.tsx'],
  ['lọt-cũ-bậc-950', '<div className="bg-neutral-950">nền</div>', '.tsx'],
  ['hex-6', "const BRAND = '#e31029';", '.ts'],
  ['hex-3', "el.style.color = '#f08';", '.ts'],
  ['hex-8-alpha', "const OVERLAY = '#00000080';", '.ts'],
  ['hex-trong-style', "<div style={{ backgroundColor: '#3b82f6' }} />", '.tsx'],
  ['hex-trong-css', '  border-color: #e5e5e5;', '.css'],
  ['three-0x', 'const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });', '.ts'],
  ['opacity-modifier', '<div className="bg-slate-700/50" />', '.tsx'],
  ['variant-tiền-tố', '<div className="md:hover:bg-zinc-800" />', '.tsx'],
];

// SẠCH: KHÔNG được kêu. Năm dòng đầu là năm báo động giả THẬT của bản grep cũ,
// lấy nguyên văn từ cây — ghim ở đây để chúng không bao giờ tái phát.
const CLEAN = [
  [' * `--tw-ring-offset-color: #fff` (đo trong tailwindcss/dist/lib.js): khe', '.tsx'],
  [' * mặc định của nó, `--tw-ring-offset-color: #fff` — khe TRẮNG trên nền tối.', '.tsx'],
  ['// một token hỏng sẽ trả về màu #000000 của token TRƯỚC ĐÓ', '.ts'],
  ['/* bóng đen tuyệt đối #000 trên nền trắng ngả xám bẩn */', '.css'],
  // Class ngữ nghĩa — đúng thứ cổng này BẢO VỆ, nên chúng phải im lặng đi qua.
  ["        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',", '.tsx'],
  ["        destructive: 'border-destructive bg-transparent text-destructive',", '.tsx'],
  [
    "  'difficulty-basic': 'border-transparent bg-difficulty-basic text-difficulty-basic-foreground',",
    '.tsx',
  ],
  ['<div className="bg-muted text-muted-foreground border-input" />', '.tsx'],
  ['<span className="bg-status-progress text-status-done-foreground" />', '.tsx'],
  // Tiện ích KHÔNG phải màu, nhưng có chữ số — đúng chỗ một mẫu ẩu sẽ kêu oan.
  ['<div className="grid grid-cols-[auto_1fr] gap-x-3 p-4 text-sm" />', '.tsx'],
  ['<pre className="max-h-60 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs" />', '.tsx'],
  ['<div className="inline-flex h-10 size-3.5 shrink-0 items-center gap-2 px-4" />', '.tsx'],
  ['<Alert className="rounded-none border-x-0 border-t-0" />', '.tsx'],
  // Token oklch trong CSS — nguồn màu HỢP LỆ duy nhất.
  ['  --primary: oklch(0.58 0.23 25);', '.css'],
  ['  --elevation-1: 0 1px 2px -1px oklch(0.145 0.012 262.881 / 0.1);', '.css'],
  ['  --color-difficulty-basic: var(--difficulty-basic);', '.css'],
  // Mảnh URL và định danh — KHÔNG phải màu. `#section` / `#top` không phải hex;
  // `#abcdef` thì LÀ hex và cố ý vẫn bị bắt (không có cách phân biệt, và một
  // mảnh URL trông hệt màu là chuyện đủ hiếm để chấp nhận báo động).
  ['<a href="/docs/huong-dan#buoc-cai-dat">Cài đặt</a>', '.tsx'],
  ["const el = document.querySelector('#root');", '.ts'],
  // Số hex KHÔNG phải màu: 5 chữ số, và mã thoát/bitmask ngắn.
  ["const weird = '#12345';", '.ts'],
  ['const MASK = 0xff;', '.ts'],
];

/**
 * Ba trong năm báo động giả của bản grep cũ KHÔNG phải dòng chú thích — chúng
 * là THÔNG ĐIỆP ASSERTION nằm giữa mã chạy được:
 *
 *   expect(classes, 'thiếu ring-offset-background ⇒ khe offset màu #fff, …')
 *
 * Thứ miễn trừ chúng là bộ lọc FILE TEST, không phải bộ lọc chú thích. Nên
 * chúng được đối chứng ở đây, đúng cơ chế thật sự làm việc — và đối chứng chạy
 * HAI CHIỀU: đường dẫn phải được `IS_TEST_FILE` nhận ra, VÀ cùng dòng đó đặt
 * trong một file THƯỜNG thì phải bị bắt. Thiếu chiều thứ hai thì một mẫu
 * `hex-trần` hỏng hoàn toàn vẫn để khối này xanh.
 */
const CLEAN_ONLY_BECAUSE_TEST_FILE = [
  [
    'packages/ui/src/button.test.tsx',
    "      expect(classes, 'thiếu ring-offset-background ⇒ khe offset màu #fff, trắng trên nền tối').toContain(",
  ],
  [
    'packages/ui/src/switch.test.tsx',
    "    expect(classes, 'thiếu ring-offset-background ⇒ khe offset màu #fff, trắng trên nền tối').toContain(",
  ],
  [
    'packages/ui/src/theme/tokens.contract.test.ts',
    "    expect(toHex(toSrgb({ l: 0.145, c: 0, h: 0, alpha: 1 }))).toBe('#0a0a0a');",
  ],
];

function selfTest() {
  const fails = [];

  for (const [tag, line, ext] of DIRTY) {
    if (scanText(line, { ext }).length === 0) fails.push(`BẨN KHÔNG BỊ BẮT  [${tag}]  ${line}`);
  }

  for (const [path, line] of CLEAN_ONLY_BECAUSE_TEST_FILE) {
    if (!IS_TEST_FILE.test(path)) {
      fails.push(`FILE TEST KHÔNG ĐƯỢC NHẬN RA  [${path}] — dòng assertion trong nó sẽ bị kêu oan`);
    }
    // Chiều hai: cùng dòng đó ở file thường PHẢI bị bắt, nếu không thì việc nó
    // im lặng ở file test chẳng chứng minh được gì.
    if (scanText(line, { ext: extname(path) }).length === 0) {
      fails.push(`MẪU HỎNG  [${path}] — dòng này lẽ ra bị bắt ở file thường: ${line}`);
    }
  }
  for (const [line, ext] of CLEAN) {
    const hits = scanText(line, { ext });
    if (hits.length)
      fails.push(`SẠCH BỊ KÊU OAN  [${hits[0].rule} khớp "${hits[0].match}"]  ${line}`);
  }

  // Đối chứng cho CHÍNH bộ lọc chú thích: nếu `isCommentLine` luôn trả `true`
  // thì mọi dòng CLEAN ở trên đi qua và cả khối trên thành trang trí.
  if (isCommentLine('<div className="bg-slate-700" />', '.tsx')) {
    fails.push('BỘ LỌC CHÚ THÍCH nuốt cả dòng mã thường — mọi mẫu CLEAN ở trên trở nên vô nghĩa');
  }
  if (!isCommentLine('// #fff', '.tsx')) {
    fails.push('BỘ LỌC CHÚ THÍCH không nhận ra dòng `//` — 5 báo động giả cũ sẽ tái phát');
  }

  const total = DIRTY.length + CLEAN.length + CLEAN_ONLY_BECAUSE_TEST_FILE.length * 2 + 2;
  if (fails.length) {
    console.error('✗ ĐỐI CHỨNG HỎNG — cổng không chứng minh được là nó biết kêu:\n');
    for (const f of fails) console.error(`   ${f}`);
    console.error(`\n${fails.length}/${total} mẫu sai. Sửa RULES trong ${relative(REPO, SELF)}.`);
    console.error('KHÔNG nới mẫu để dập báo động — sửa cho đúng, rồi thêm dòng vào CLEAN.');
    return false;
  }
  console.log(
    `✓ đối chứng: bắt đủ ${DIRTY.length} mẫu màu cứng (gồm 3 hình dạng của sự cố @source 2026-08-13 ` +
      `và 3 dạng bản grep cũ bỏ lọt), không kêu trên ${CLEAN.length} mẫu sạch ` +
      `(gồm 2 báo động giả THẬT của bản grep cũ), và ${CLEAN_ONLY_BECAUSE_TEST_FILE.length} dòng ` +
      `assertion được miễn ĐÚNG bằng bộ lọc file test (đối chứng hai chiều).`,
  );
  return true;
}

// ─────────────────────────────────────────────────────────────── main
const onlySelfTest = process.argv.includes('--self-test');

if (!selfTest()) process.exit(2);
if (onlySelfTest) process.exit(0);

const { hits, files, seenExempt, roots } = scanTree();

// CHIỀU XUỐNG của sổ cái — dòng miễn trừ đã hết hạn. Rà TỪNG dòng, kể cả từng
// mục `allow` con: một mục `allow` không bao giờ khớp cũng là một dòng chết.
const stale = KNOWN_HARDCODED.flatMap((e) =>
  e.allow === undefined
    ? seenExempt.has(e.file)
      ? []
      : [e.file]
    : e.allow
        .filter((a) => !seenExempt.has(`${e.file} :: ${a.match}`))
        .map((a) => `${e.file} :: ${a.match}`),
);

if (hits.length === 0 && stale.length === 0) {
  console.log(
    `✓ không có màu cứng (#hex / thang màu Tailwind / 0xRRGGBB) — ` +
      `đã quét ${files} file trong ${roots.length} vùng, ` +
      `${seenExempt.size} file được miễn trừ có ghi lý do.`,
  );
  process.exit(0);
}

if (hits.length > 0) {
  console.error(`\n✗ ${hits.length} chỗ dùng màu cứng (§5.1 docs/design-system.md):\n`);
  for (const h of hits) {
    console.error(`   ${h.file}:${h.line}:${h.col}  [${h.rule}] khớp "${h.match}"`);
    console.error(`      ${h.text.slice(0, 140)}`);
  }
  console.error('\nMàu phải đến từ token trong apps/web/src/app/globals.css và được dùng qua');
  console.error('class ngữ nghĩa (bg-primary, text-muted-foreground, border-destructive, …).');
  console.error('Nếu đây là ranh giới thư viện ngoài thật sự (như xterm.js), thêm file vào');
  console.error('KNOWN_HARDCODED trong scripts/check-design-tokens.mjs KÈM LÝ DO.');
}

if (stale.length > 0) {
  console.error(`\n✗ ${stale.length} dòng miễn trừ đã HẾT HẠN trong KNOWN_HARDCODED:\n`);
  for (const f of stale) console.error(`   ${f}`);
  console.error('\nFile này nay đã sạch màu cứng (hoặc đã bị xoá/đổi tên). Đó là TIN MỪNG:');
  console.error('XOÁ dòng đó khỏi KNOWN_HARDCODED. Tuyệt đối không thêm màu cứng lại cho');
  console.error('"khớp sổ cái" — sổ cái không có chiều xuống thì nó là một nghĩa địa.');
}

process.exit(1);
