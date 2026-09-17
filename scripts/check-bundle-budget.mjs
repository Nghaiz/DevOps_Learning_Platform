#!/usr/bin/env node
/**
 * Cổng gác NGÂN SÁCH BUNDLE — biến ô AC "không kéo xterm.js vào trang không có
 * terminal" (`phase-14-exec.md:21`) từ một lời hứa thành một PHÉP ĐO BYTE.
 *
 * VÌ SAO Ô AC NÀY TREO LÂU THẾ
 * ----------------------------
 * `phase-14-exec.md:21` ghi thẳng ra: *"Cổng hiệu năng duy nhất là LCP ở
 * `apps/web/e2e/perf.spec.ts`. AC 'không kéo xterm.js vào trang không có
 * terminal' của phase gốc hiện CHƯA CÓ PHÉP ĐO."* Đo lại ngày 2026-09-11:
 * `@next/bundle-analyzer` và `size-limit` vẫn 0 hit trên mọi `package.json`
 * của workspace. Thứ duy nhất đang gác gần đó là
 * `apps/web/src/components/session/terminal-theme.test.ts` — một test TĨNH đọc
 * mã nguồn bằng `toContain('from "@devops-platform/terminal/themes"')`. Nó gác
 * KỶ LUẬT IMPORT, không gác BYTE: viết đúng subpath rồi vẫn có thể kéo xterm
 * vào một route khác qua một đường thứ ba, và test đó vẫn xanh.
 *
 * VÌ SAO ĐỌC OUTPUT `next build` CHỨ KHÔNG PHẢI `size-limit`
 * ---------------------------------------------------------
 * Câu hỏi thật không phải "bundle có to không" mà là "chunk của route X có với
 * tới xterm không". `size-limit` đo TỔNG byte của một entry point và không
 * phân biệt được theo route — nó không trả lời được câu đó, nên nó không gác
 * được ô AC này. Output của `next build` thì trả lời chính xác.
 *
 * ⚠ NGUỒN DỮ LIỆU KHÔNG PHẢI `app-build-manifest.json`
 * ----------------------------------------------------
 * Kế hoạch ban đầu của lane này là đọc `.next/app-build-manifest.json`. FILE ĐÓ
 * KHÔNG TỒN TẠI ở repo này — đo 2026-09-11, `ls apps/web/.next/*.json` sau một
 * lượt build sạch:
 *
 *   app-path-routes-manifest.json  build-manifest.json  export-marker.json
 *   fallback-build-manifest.json   images-manifest.json prerender-manifest.json
 *   required-server-files.json     routes-manifest.json
 *
 * Không có `app-build-manifest.json`, và `.next/turbopack` (file mốc) có mặt:
 * Next 16.3 build bằng **Turbopack**, và Turbopack không sinh manifest đó.
 * `build-manifest.json` thì chỉ 645 byte và `pages` của nó là `{"/_app": []}` —
 * nó nói về router `pages/`, không nói gì về `app/`.
 *
 * Nguồn ĐÚNG là per-route: `.next/server/app/**\/page_client-reference-manifest.js`.
 * Mỗi file gán `globalThis.__RSC_MANIFEST["<route>"] = { …, entryJSFiles }`,
 * trong đó `entryJSFiles` map từng entry (layout gốc, layout con, page) sang
 * danh sách `static/chunks/*.js`. Hợp nhất chúng lại là được tập chunk của
 * route.
 *
 * ⚠ `entryJSFiles` LÀ TẬP "VỚI TỚI ĐƯỢC", KHÔNG PHẢI "TẢI NGAY"
 * ------------------------------------------------------------
 * Chunk xterm đến với bốn route qua `next/dynamic({ ssr: false })`
 * (`terminal-pane.tsx:59` → `terminal-surface-lazy.tsx`), tức là nạp SAU khi
 * hydrate chứ không nằm trong lượt tải đầu. Turbopack vẫn liệt nó trong
 * `entryJSFiles` của route. Nên con số ở đây đọc là **"route này với tới được
 * bao nhiêu byte JS"**, không phải "trình duyệt tải ngay bấy nhiêu".
 *
 * Đó vẫn đúng là thứ ô AC hỏi. AC nói "không KÉO xterm vào trang không có
 * terminal" — một route không có chunk đó trong tập của mình thì CHỨNG MINH ĐƯỢC
 * là không bao giờ tải nó, bằng đường nào cũng vậy. Đừng đọc bảng byte dưới đây
 * thành "trang nặng ngần này lúc mở".
 *
 * NHẬN DIỆN CHUNK XTERM BẰNG DẤU VÂN TAY, KHÔNG BẰNG TÊN
 * -----------------------------------------------------
 * Tên chunk là hash và đổi mỗi lần build (`3f5lopg26bcre.js` hôm nay, khác
 * ngày mai). Ghim tên là ghim một thứ hết hạn sau commit kế tiếp. Nên script
 * quét NỘI DUNG `.next/static/chunks/*.js` tìm chuỗi runtime của xterm.js.
 *
 * Và đây là chỗ dễ có "cái xanh không chứng minh gì" nhất: nếu xterm nâng
 * version và đổi hết chuỗi, mẫu không khớp nữa ⇒ 0 chunk được nhận là xterm ⇒
 * chiều CẤM tự nhiên xanh trên MỌI route. Nên "0 chunk khớp" bị coi là **hỏng
 * cấu hình (thoát 2)**, không phải "sạch". `unknown` phải khác `good`
 * (`rules/green-that-proves-nothing.md`).
 *
 * HAI CHIỀU, KHÔNG PHẢI MỘT
 * -------------------------
 * Chỉ có chiều CẤM thì cổng vẫn xanh khi ai đó xoá sạch terminal khỏi cả bốn
 * route — lúc đó nó không còn gác gì và không ai biết. Nên có luôn chiều ĐỐI
 * CHỨNG DƯƠNG: bốn route CÓ terminal thì PHẢI với tới chunk xterm. Và chiều thứ
 * ba của sổ cái: một route khai trong `TERMINAL_ROUTES` mà build không có ⇒ đỏ,
 * vì danh sách khai tay đã lệch khỏi cây thư mục.
 *
 * VÌ SAO NODE CHỨ KHÔNG PHẢI `.sh`
 * --------------------------------
 * Cùng lý do đã ghi ở `scripts/check-design-tokens.mjs`: repo có tiền sử script
 * `.sh` CRLF chết từng dòng.
 *
 * Dùng:
 *   pnpm --filter @devops-platform/web build     # PHẢI chạy trước
 *   node scripts/check-bundle-budget.mjs         # tự kiểm rồi đo cây build
 *   node scripts/check-bundle-budget.mjs --self-test   # chỉ tự kiểm
 *
 * Mã thoát: 0 sạch · 1 có vi phạm · 2 tự kiểm hỏng / chưa build / sai cấu hình.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(SELF, '..', '..');
const NEXT_DIR = join(REPO, 'apps', 'web', '.next');

// ──────────────────────────────────────────── route CÓ terminal (khai tay)
//
// Khai TƯỜNG MINH, đúng khuôn `SCREENS` của e2e, KHÔNG tự dò rồi tự thích nghi.
// Một cổng tự dò danh sách của chính nó từ cây nguồn thì khi cây nguồn hỏng, nó
// hỏng theo và vẫn xanh — nó chỉ khẳng định "cây khớp với chính cây".
//
// Khoá là khoá của `__RSC_MANIFEST`, tức đường dẫn route + `/page` (route group
// như `(session)` NẰM TRONG khoá). Đo 2026-09-11, đúng bốn route này nạp xterm
// và cả bốn đều có terminal thật:
//
//   /labs/[id]              lab-client.tsx:37,293
//   /lessons/[id]           lesson-client.tsx:13,309
//   /playgrounds/[id]       playground-client.tsx:9,143
//   /session/[id]/terminal  terminal-window-client.tsx:44
const TERMINAL_ROUTES = new Set([
  '/labs/[id]/page',
  '/lessons/[id]/page',
  '/playgrounds/[id]/page',
  '/session/[id]/terminal/page',
]);

// ──────────────────────────────────────────────────── dấu vân tay xterm.js
//
// Chuỗi runtime của `@xterm/xterm` 6.0.0 (ghim CHÍNH XÁC ở
// `packages/terminal/package.json`), tồn tại được qua minify vì chúng là tên
// class CSS và thông điệp lỗi — không phải tên biến.
//
// CỐ Ý KHÔNG dùng mẫu trần `/xterm/i`: `packages/terminal/src/themes.ts` (subpath
// AN TOÀN CHO SERVER, được `me.ts`, `preferences-form.tsx`, … import ở route
// KHÔNG có terminal) có chữ "xterm" ở dòng 1 (`import type { ITheme } from
// '@xterm/xterm'` — bị xoá lúc biên dịch) và dòng 7 (chú thích — bị minify xoá).
// Hôm nay cả hai đều không sống sót vào chunk, nhưng một mẫu phụ thuộc vào việc
// minifier xoá chú thích là một mẫu chờ ngày kêu oan. Bốn chuỗi dưới đây không
// có đường nào lọt vào mã ứng dụng.
const XTERM_FINGERPRINTS = [
  'xterm-scrollable-element',
  'xterm-decoration-container',
  'is not supported in xterm.js',
  'xterm-cursor-block',
];

// ──────────────────────────────────────────────────────────── trần byte
//
// SỐ ĐO THẬT ngày 2026-09-11, build sạch trên Windows (`NEXT_OUTPUT` không đặt),
// 62 file `.next/static/chunks/*.js`, 37 route có chunk:
//
//   nền chung (7 chunk, ≥90% route)   998_512 B   975 KB
//   chunk xterm (1 chunk, 4 route)    535_793 B   523 KB
//   route nặng nhất  /labs/[id]     1_654_621 B  1616 KB   (có terminal)
//   route nặng nhì   /games/k8s     1_433_087 B  1399 KB   (three.js, KHÔNG terminal)
//   route nhẹ nhất   /dashboard       998_512 B   975 KB   (đúng bằng nền chung)
//
// Trần đặt cao hơn số đo hôm nay ~10–15%: đủ để một PR thường không đỏ oan, đủ
// chặt để một thư viện mới cỡ xterm (523 KB) hay three.js (324 KB) lọt vào là
// vượt ngay. KHÔNG nới trần để dập báo động — nới trần là ghi nhận một khoản nợ,
// nên phải sửa số Ở ĐÂY kèm ngày và lý do, không sửa lặng lẽ.
const BUDGETS = {
  // Nền chung tải trên MỌI route, nên mỗi byte thêm ở đây nhân cho 37 trang.
  //
  // ▶ HẠ TRẦN 2026-09-18: 1_150_000 → 900_000. Trần cũ dư 32% mâu thuẫn với
  // chính chú thích "~10–15%" ngay trên đây, và một cổng dư 32% KHÔNG bắt nổi
  // cú bump cỡ 91 KB (đúng cỡ Zod từng cộng). Số đo THẬT của `main` lúc hạ trần
  // là 815_524 B (build 2026-09-18, sau khi #148 gộp sáu bump + #146/#147 cộng
  // ~29 KB so với mốc 786 785 của CI 2026-09-14). 900_000 cho ~10,4% headroom
  // trên số đo thật VÀ vẫn đỏ khi cú bump 91 KB kế tiếp đẩy nền lên ~906 KB.
  // Khôi phục ý định đã ghi; đổi được nếu chủ dự án muốn khác — sửa số Ở ĐÂY
  // kèm ngày + lý do, đừng lặng lẽ.
  sharedBaselineBytes: 900_000,
  // Trần thô "không route nào nổ". Route nặng nhất hôm nay dùng 89% trần này.
  routeBytes: 1_850_000,
  // Chunk xterm béo lên cũng là hồi quy thật, kể cả khi nó vẫn ở đúng 4 route.
  xtermChunkBytes: 620_000,
};

// Chunk có mặt ở ≥ tỉ lệ này của các route (có chunk) được coi là "nền chung".
// Đo 2026-09-11 cho thấy khe rất rộng nên ngưỡng không nhạy: 7 chunk nền ở
// 97.3–100%, chunk kế tiếp (`3iof2fgb-r9bn.js`, layout của khu học) ở 67.6%.
const SHARED_MIN_RATIO = 0.9;

// ═══════════════════════════════════════════════════════ LÕI THUẦN (đo được)
//
// Tách hẳn khỏi I/O để tự kiểm chạy được trên dữ liệu bịa. Mọi luật sống ở đây;
// phần đọc đĩa bên dưới chỉ dựng đầu vào.

/**
 * @param {{
 *   routes: Record<string, string[]>,   // route → danh sách chunk
 *   chunkBytes: Record<string, number>, // chunk → byte (-1 nếu thiếu file)
 *   xtermChunks: Set<string>,           // chunk được nhận là xterm
 *   terminalRoutes: Set<string>,
 *   budgets: typeof BUDGETS,
 * }} input
 */
function analyze({ routes, chunkBytes, xtermChunks, terminalRoutes, budgets }) {
  const problems = [];
  const bytesOf = (c) => chunkBytes[c] ?? -1;
  const totalOf = (list) => list.reduce((a, c) => a + Math.max(0, bytesOf(c)), 0);

  const withChunks = Object.entries(routes).filter(([, v]) => v.length > 0);

  // ── chiều CẤM: route KHÔNG có terminal mà với tới chunk xterm
  for (const [route, chunks] of Object.entries(routes)) {
    if (terminalRoutes.has(route)) continue;
    const leaked = chunks.filter((c) => xtermChunks.has(c));
    if (leaked.length > 0) {
      problems.push({
        kind: 'xterm-lọt',
        route,
        detail:
          `kéo ${leaked.length} chunk xterm (${leaked.map((c) => `${c} ${bytesOf(c)}B`).join(', ')})` +
          ' — route này không có terminal',
      });
    }
  }

  // ── chiều ĐỐI CHỨNG DƯƠNG: route CÓ terminal thì PHẢI với tới chunk xterm.
  //
  // ⛔ ĐỪNG XOÁ VẾ NÀY. Không có nó, cổng vẫn xanh khi xterm biến mất khỏi cả
  // bốn route — tức khi nó hết gác gì thì nó cũng hết kêu, và không ai biết.
  // `check-design-tokens.mjs` gọi đúng thứ đó là "một cổng không bao giờ đỏ
  // được thì chỉ là trang trí".
  for (const route of terminalRoutes) {
    if (!(route in routes)) {
      problems.push({
        kind: 'route-khai-đã-biến-mất',
        route,
        detail:
          'khai trong TERMINAL_ROUTES nhưng build không có route này — đổi tên/xoá route ' +
          'thì SỬA danh sách, đừng để nó trỏ vào hư không',
      });
      continue;
    }
    if (!routes[route].some((c) => xtermChunks.has(c))) {
      problems.push({
        kind: 'thiếu-đối-chứng-dương',
        route,
        detail:
          'khai là route CÓ terminal nhưng không với tới chunk xterm nào — hoặc terminal đã ' +
          'bị gỡ khỏi route (thì XOÁ khỏi TERMINAL_ROUTES), hoặc chuỗi nạp động đã đứt',
      });
    }
  }

  // ── nền chung
  const freq = {};
  for (const [, chunks] of withChunks)
    for (const c of new Set(chunks)) freq[c] = (freq[c] ?? 0) + 1;
  const shared =
    withChunks.length === 0
      ? []
      : Object.keys(freq)
          .filter((c) => freq[c] / withChunks.length >= SHARED_MIN_RATIO)
          .sort();
  const sharedBytes = totalOf(shared);
  if (sharedBytes > budgets.sharedBaselineBytes) {
    problems.push({
      kind: 'trần-nền-chung',
      route: '(nền chung)',
      detail:
        `${sharedBytes} B > trần ${budgets.sharedBaselineBytes} B — ` +
        `${shared.length} chunk tải trên mọi route`,
    });
  }

  // ── trần từng route
  for (const [route, chunks] of withChunks) {
    const t = totalOf(chunks);
    if (t > budgets.routeBytes) {
      problems.push({
        kind: 'trần-route',
        route,
        detail: `${t} B > trần ${budgets.routeBytes} B`,
      });
    }
  }

  // ── trần chunk xterm
  for (const c of xtermChunks) {
    const b = bytesOf(c);
    if (b > budgets.xtermChunkBytes) {
      problems.push({
        kind: 'trần-chunk-xterm',
        route: '(chunk xterm)',
        detail: `${c} ${b} B > trần ${budgets.xtermChunkBytes} B`,
      });
    }
  }

  // ── chunk manifest trỏ tới nhưng không có trên đĩa: build hỏng, không phải sạch
  const missing = new Set();
  for (const [, chunks] of withChunks) for (const c of chunks) if (bytesOf(c) < 0) missing.add(c);
  for (const c of missing) {
    problems.push({
      kind: 'chunk-thiếu-file',
      route: '(đĩa)',
      detail: `${c} có trong manifest nhưng không có file — output build không toàn vẹn`,
    });
  }

  const table = withChunks
    .map(([route, chunks]) => ({
      route,
      bytes: totalOf(chunks),
      chunks: chunks.length,
      xterm: chunks.some((c) => xtermChunks.has(c)),
    }))
    .sort((a, b) => b.bytes - a.bytes);

  return { problems, shared, sharedBytes, table };
}

// ═══════════════════════════════════════════════════════════════ ĐỌC ĐĨA

function* walkManifests(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walkManifests(p);
    else if (e.name.endsWith('_client-reference-manifest.js')) yield p;
  }
}

function readRoutes() {
  const appDir = join(NEXT_DIR, 'server', 'app');
  const routes = {};
  for (const file of walkManifests(appDir)) {
    globalThis.__RSC_MANIFEST = {};
    // Manifest là một file JS tự gán vào `globalThis.__RSC_MANIFEST`. Không có
    // dạng JSON nào của nó trên đĩa, nên chạy là cách đọc duy nhất. Nội dung do
    // chính lượt build của ta sinh ra, không phải đầu vào ngoài.
    new Function(readFileSync(file, 'utf8'))();
    for (const [route, manifest] of Object.entries(globalThis.__RSC_MANIFEST)) {
      const set = new Set();
      for (const list of Object.values(manifest.entryJSFiles ?? {}))
        for (const c of list) set.add(c);
      routes[route] = [...set];
    }
  }
  globalThis.__RSC_MANIFEST = undefined;
  return routes;
}

function readChunks() {
  const dir = join(NEXT_DIR, 'static', 'chunks');
  const chunkBytes = {};
  const xtermChunks = new Set();
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    for (const e of readdirSync(cur, { withFileTypes: true })) {
      const abs = join(cur, e.name);
      if (e.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (!e.name.endsWith('.js')) continue;
      const rel = relative(NEXT_DIR, abs).split('\\').join('/');
      chunkBytes[rel] = statSync(abs).size;
      const text = readFileSync(abs, 'utf8');
      if (XTERM_FINGERPRINTS.some((f) => text.includes(f))) xtermChunks.add(rel);
    }
  }
  return { chunkBytes, xtermChunks };
}

// ══════════════════════════════════════════════════════════════ ĐỐI CHỨNG
//
// Mọi ca chạy trên dữ liệu BỊA, không đụng đĩa — nên tự kiểm chạy được cả khi
// chưa build, và nó kiểm ĐÚNG các luật, không kiểm cây build hôm nay.

// BỐN route, không phải ba. Với ba route thì ca "xterm lọt" đẩy `xt.js` lên
// 3/3 = 100% ⇒ nó tự thành "nền chung" và kéo theo một vi phạm `trần-nền-chung`
// thứ hai, làm ca đó không còn cô lập được luật nó muốn đo. Route thứ tư giữ
// `xt.js` ở 3/4 = 75% < SHARED_MIN_RATIO.
const FP_ROUTES = {
  '/dashboard/page': ['static/chunks/base.js'],
  '/settings/page': ['static/chunks/base.js'],
  '/labs/[id]/page': ['static/chunks/base.js', 'static/chunks/xt.js'],
  '/lessons/[id]/page': ['static/chunks/base.js', 'static/chunks/xt.js'],
};
const FP_BYTES = { 'static/chunks/base.js': 1000, 'static/chunks/xt.js': 500_000 };
const FP_TERMINAL = new Set(['/labs/[id]/page', '/lessons/[id]/page']);
const FP_XTERM = new Set(['static/chunks/xt.js']);
const FP_BUDGETS = { sharedBaselineBytes: 10_000, routeBytes: 900_000, xtermChunkBytes: 600_000 };

const base = (over = {}) => ({
  routes: FP_ROUTES,
  chunkBytes: FP_BYTES,
  xtermChunks: FP_XTERM,
  terminalRoutes: FP_TERMINAL,
  budgets: FP_BUDGETS,
  ...over,
});

const CASES = [
  {
    tag: 'sạch',
    input: base(),
    expect: [],
  },
  {
    tag: 'xterm lọt vào route không có terminal',
    input: base({
      routes: { ...FP_ROUTES, '/dashboard/page': ['static/chunks/base.js', 'static/chunks/xt.js'] },
    }),
    expect: ['xterm-lọt'],
  },
  {
    // ⛔ Ca chứng minh vế ĐỐI CHỨNG DƯƠNG không phải trang trí: xoá vế đó khỏi
    // `analyze` thì ĐÚNG ca này chuyển sang xanh và tự kiểm đỏ.
    tag: 'route có terminal mất sạch xterm',
    input: base({ routes: { ...FP_ROUTES, '/labs/[id]/page': ['static/chunks/base.js'] } }),
    expect: ['thiếu-đối-chứng-dương'],
  },
  {
    tag: 'route khai trong TERMINAL_ROUTES nhưng build không có',
    input: base({ terminalRoutes: new Set([...FP_TERMINAL, '/khong-ton-tai/page']) }),
    expect: ['route-khai-đã-biến-mất'],
  },
  {
    tag: 'nền chung vượt trần',
    input: base({ chunkBytes: { ...FP_BYTES, 'static/chunks/base.js': 50_000 } }),
    // base.js có ở 3/3 route ⇒ là nền chung; 50_000 > 10_000.
    expect: ['trần-nền-chung'],
  },
  {
    tag: 'một route vượt trần',
    input: base({ chunkBytes: { ...FP_BYTES, 'static/chunks/xt.js': 899_500 } }),
    // 899_500 + 1_000 = 900_500 > 900_000 trên hai route có terminal;
    // 899_500 > 600_000 nên trần chunk xterm cũng phải kêu.
    expect: ['trần-route', 'trần-route', 'trần-chunk-xterm'],
  },
  {
    tag: 'manifest trỏ vào chunk không có trên đĩa',
    input: base({
      routes: { ...FP_ROUTES, '/dashboard/page': ['static/chunks/base.js', 'static/chunks/ma.js'] },
    }),
    expect: ['chunk-thiếu-file'],
  },
];

function selfTest() {
  const fails = [];
  for (const c of CASES) {
    const got = analyze(c.input)
      .problems.map((p) => p.kind)
      .sort();
    const want = [...c.expect].sort();
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      fails.push(`[${c.tag}] mong ${JSON.stringify(want)} — nhận ${JSON.stringify(got)}`);
    }
  }

  // Đối chứng cho chính BỘ NHẬN DIỆN: mẫu vân tay phải khớp chuỗi thật của
  // xterm và KHÔNG khớp một chunk ứng dụng chỉ vô tình có chữ "xterm" (đúng
  // hình dạng `themes.ts` — chú thích + `import type`, thứ có thể sống sót nếu
  // một ngày nào đó minifier giữ chú thích lại).
  const looksXterm = (s) => XTERM_FINGERPRINTS.some((f) => s.includes(f));
  if (!looksXterm('this._domNode.className="xterm-scrollable-element "+this._options.className')) {
    fails.push('VÂN TAY không khớp chuỗi runtime thật của xterm.js — chiều CẤM sẽ xanh khống');
  }
  if (!looksXterm('throw Error("horizontalHasArrows is not supported in xterm.js")')) {
    fails.push('VÂN TAY không khớp thông điệp lỗi của xterm.js');
  }
  if (looksXterm("import type { ITheme } from '@xterm/xterm';")) {
    fails.push('VÂN TAY khớp cả `import type` của themes.ts — sẽ kêu oan route không có terminal');
  }
  if (looksXterm(' * làm xterm dùng giá trị "hợp lý", nó dùng mặc định của xterm')) {
    fails.push('VÂN TAY khớp cả chú thích có chữ "xterm" — sẽ kêu oan');
  }

  if (fails.length > 0) {
    console.error('✗ ĐỐI CHỨNG HỎNG — cổng không chứng minh được là nó biết kêu:\n');
    for (const f of fails) console.error(`   ${f}`);
    console.error(`\n${fails.length} ca sai. Sửa luật trong ${relative(REPO, SELF)}.`);
    console.error('KHÔNG nới luật để dập báo động — sửa cho đúng, rồi thêm ca vào CASES.');
    return false;
  }
  console.log(
    `✓ đối chứng: ${CASES.length} ca luật đúng như mong đợi (gồm ca "route có terminal mất sạch ` +
      `xterm" — ca chứng minh vế đối chứng dương không phải trang trí), và 4 phép thử vân tay ` +
      `hai chiều (khớp chuỗi runtime xterm thật, KHÔNG khớp chú thích/import type của themes.ts).`,
  );
  return true;
}

// ══════════════════════════════════════════════════════════════════ main
const onlySelfTest = process.argv.includes('--self-test');

if (!selfTest()) process.exit(2);
if (onlySelfTest) process.exit(0);

// Chưa build ⇒ HỎNG CẤU HÌNH, không phải "sạch". Một cổng đo output build mà đọc
// thư mục rỗng rồi báo xanh là kiểu xanh vô nghĩa nguy hiểm nhất ở đây.
for (const need of [join(NEXT_DIR, 'server', 'app'), join(NEXT_DIR, 'static', 'chunks')]) {
  if (!existsSync(need)) {
    console.error(
      `LỖI: chưa có output build — thiếu ${relative(REPO, need).split('\\').join('/')}`,
    );
    console.error('Chạy trước:  pnpm --filter @devops-platform/web build');
    process.exit(2);
  }
}

const routes = readRoutes();
const { chunkBytes, xtermChunks } = readChunks();

if (Object.keys(routes).length === 0) {
  console.error('LỖI: không đọc được route nào từ .next/server/app/**.');
  console.error('Hình dạng output của Next đã đổi (hoặc build hỏng) ⇒ sửa readRoutes().');
  process.exit(2);
}

// "0 chunk khớp vân tay" KHÔNG phải tin mừng — nó làm chiều CẤM xanh trên mọi
// route mà chẳng đo gì. Hoặc xterm đã bị gỡ khỏi dự án (thì XOÁ cổng này và
// TERMINAL_ROUTES), hoặc xterm nâng version và đổi chuỗi (thì SỬA vân tay).
if (xtermChunks.size === 0) {
  console.error('LỖI: không chunk nào khớp dấu vân tay xterm.js.');
  console.error(`Đã quét ${Object.keys(chunkBytes).length} chunk trong .next/static/chunks/.`);
  console.error('Đây KHÔNG phải "sạch": chiều CẤM sẽ xanh trên mọi route mà không đo gì.');
  console.error('Kiểm `packages/terminal/package.json` (@xterm/xterm đang ghim 6.0.0) rồi cập');
  console.error('nhật XTERM_FINGERPRINTS trong scripts/check-bundle-budget.mjs.');
  process.exit(2);
}

const { problems, shared, sharedBytes, table } = analyze({
  routes,
  chunkBytes,
  xtermChunks,
  terminalRoutes: TERMINAL_ROUTES,
  budgets: BUDGETS,
});

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

console.log(
  `\nroute → byte JS với tới được (${table.length} route, ${Object.keys(chunkBytes).length} chunk):\n`,
);
console.log(`   ${'byte'.padStart(9)}  ${'KB'.padStart(6)}  xterm  chunk  route`);
for (const r of table) {
  console.log(
    `   ${String(r.bytes).padStart(9)}  ${kb(r.bytes).padStart(6)}  ` +
      `${(r.xterm ? 'XTERM' : '·').padEnd(5)}  ${String(r.chunks).padStart(5)}  ${r.route}`,
  );
}
console.log(
  `\n   nền chung: ${shared.length} chunk, ${sharedBytes} B (${kb(sharedBytes)}) / trần ${BUDGETS.sharedBaselineBytes} B`,
);
console.log(
  `   chunk xterm: ${[...xtermChunks].map((c) => `${c} ${chunkBytes[c]}B`).join(', ')} ` +
    `— ở ${table.filter((r) => r.xterm).length} route`,
);

if (problems.length === 0) {
  console.log(
    `\n✓ ngân sách bundle đạt: ${TERMINAL_ROUTES.size}/${TERMINAL_ROUTES.size} route có terminal ` +
      `với tới chunk xterm, ${table.length - TERMINAL_ROUTES.size} route còn lại KHÔNG — ` +
      `và không trần nào bị vượt.`,
  );
  process.exit(0);
}

console.error(`\n✗ ${problems.length} vi phạm ngân sách bundle:\n`);
for (const p of problems) {
  console.error(`   [${p.kind}]  ${p.route}`);
  console.error(`      ${p.detail}`);
}
console.error(
  '\nÔ AC gốc: "không kéo xterm.js vào trang không có terminal" (phase-14-exec.md:21).',
);
console.error('Chuỗi nạp ĐÚNG: trang → components/session/index.ts → terminal-pane.tsx');
console.error(
  '  (`dynamic()`, `ssr:false`) → terminal-surface-lazy.tsx → @devops-platform/terminal',
);
console.error('  → @xterm/*. Import subpath "." của gói terminal ở BẤT KỲ chỗ nào khác là kéo');
console.error('  xterm theo; dùng subpath "./themes" (server-an-toàn) cho type/hằng theme.');
console.error('Cách nới trần / miễn trừ: docs/bundle-budget.md.');
process.exit(1);
