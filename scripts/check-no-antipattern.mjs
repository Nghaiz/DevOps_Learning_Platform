#!/usr/bin/env node
/**
 * Cổng gác lệnh cấm "chống gian lận kiểu dân gian".
 *
 * Chủ dự án yêu cầu "chặn F12". KHÔNG CHẶN ĐƯỢC — đây là sự thật kỹ thuật, không
 * phải một lựa chọn thiết kế (`plans/devops-learning-platform/phase-14-exec.md`
 * §8.1). DevTools là chức năng của trình duyệt và trang web không có API nào tắt
 * nó. Mọi thủ thuật thay thế đều bị vượt trong vài giây (tắt JavaScript, mở
 * devtools TRƯỚC khi tải trang, `view-source:`, sửa thẳng bộ nhớ) và chúng lọc
 * được đúng nhóm người vốn không định gian lận.
 *
 * Tệ hơn: chúng PHÁ CỔNG A11Y CỦA CHÍNH DỰ ÁN NÀY. Chặn `contextmenu` giết menu
 * ngữ cảnh của trình đọc màn hình; bắt phím tắt giết điều hướng bàn phím. Ta sẽ
 * tự làm đỏ ô nghiệm thu axe của mình để đổi lấy một rào không cản được ai.
 *
 * Nên năm kỹ thuật dưới đây bị CẤM trong mã nguồn chạy được, và cổng này gác:
 *
 *   1. dò devtools (đoán theo kích thước cửa sổ, thư viện `devtools-detect`, …)
 *   2. chặn `contextmenu`
 *   3. bắt phím tắt devtools (F12, Ctrl+Shift+I/J)
 *   4. câu lệnh / vòng lặp gỡ lỗi nhét vào mã sản phẩm
 *   5. làm rối mã nguồn (obfuscation)
 *
 * Thứ THAY THẾ chúng mạnh hơn hẳn: phát lại tất định
 * (`packages/games/src/core/verify.ts`). Điểm chỉ được công nhận khi chạy lại
 * nhật ký hành động cho ra đúng kết quả đã khai, nên sửa `localStorage` không
 * còn nghĩa lý gì. Xem `docs/games/anti-cheat.md`.
 *
 * VÌ SAO LÀ MỘT SCRIPT CÓ ĐỐI CHỨNG, KHÔNG PHẢI MỘT DÒNG `grep`
 * -------------------------------------------------------------
 * Cùng lý lẽ với `scripts/check-no-commerce.mjs`, và file này cố ý bắt chước cấu
 * trúc của nó:
 *   - `grep` trong plan thì không job CI nào chạy, tức là không chạy.
 *   - `grep -E` của GNU khác BSD; regex của JS thì giống nhau ở mọi nền.
 *   - Repo có tiền sử script `.sh` CRLF chết từng dòng. Node đọc CRLF không sao.
 *   - Đối chứng dương chạy TRONG BỘ NHỚ, không ghi file rác.
 *
 * ĐỐI CHỨNG DƯƠNG NẰM TRONG CHÍNH SCRIPT. Mỗi lần chạy, script tự chứng minh nó
 * BẮT được tập mẫu vi phạm đã biết và KHÔNG kêu trên tập mẫu sạch đã biết —
 * TRƯỚC khi quét cây. Tự kiểm hỏng thì thoát 2 và không quét gì. Một cổng chưa
 * ai từng thấy đỏ thì không phải một cổng (`green-that-proves-nothing`).
 *
 * VÙNG QUÉT LÀ MÃ CHẠY ĐƯỢC, KHÔNG PHẢI VĂN XUÔI
 * ----------------------------------------------
 * `docs/`, `plans/`, `content/` KHÔNG bị quét, cố ý: `docs/games/anti-cheat.md`
 * tồn tại để GIẢI THÍCH lệnh cấm nên nó buộc phải viết ra đúng những từ bị cấm.
 * Một bài học DevOps nói về trình gỡ lỗi cũng vậy. Lệnh cấm áp cho mã CHẠY, và
 * quét văn xuôi chỉ mua về báo động giả rồi khiến người ta tắt cổng.
 *
 * Dùng:
 *   node scripts/check-no-antipattern.mjs              # tự kiểm rồi quét cây
 *   node scripts/check-no-antipattern.mjs --self-test  # chỉ tự kiểm
 *
 * Mã thoát: 0 sạch · 1 có vi phạm · 2 tự kiểm hỏng / sai cấu hình.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(SELF, '..', '..');

// ─────────────────────────────────────────────────────────────── vùng quét
//
// Chỉ mã nguồn CHẠY ĐƯỢC. `scripts/` nằm ngoài vì nó chạy trong Node lúc build —
// không có trình duyệt nào ở đó để mà dò devtools — và vì file NÀY nằm trong đó.
const ROOTS = [
  'apps/web/src',
  'apps/web/e2e',
  'packages/games/src',
  'packages/ui/src',
  'packages/terminal/src',
  'packages/scenario/src',
  'packages/shared-types/src',
];

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

const BINARY_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.svg',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.wasm',
  '.zip',
  '.gz',
  '.tar',
  '.br',
  '.mp4',
  '.webm',
  '.mp3',
  '.zst',
]);

// File test bị bỏ qua, cùng lý do với cổng thương mại: một test có quyền dựng
// đúng hình dạng bị cấm để chứng minh nó bị bắt, và test không đi vào bundle
// người dùng chạy. Lệnh cấm nhắm mã SẢN PHẨM.
const IS_TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/i;

// ─────────────────────────────────────────────────────────────── luật
//
// Mỗi mẫu ở đây HẸP một cách có chủ ý. Một mẫu rộng ("mọi chữ devtools") sẽ bắt
// `ReactQueryDevtools` — một công cụ phát triển hoàn toàn hợp lệ — và một cổng
// kêu oan thì bị tắt trong hai tuần.
const RULES = [
  {
    id: 'do-devtools',
    why: 'dò devtools — bị vượt trong vài giây, và không có API nào làm việc này đàng hoàng',
    // `devtools` một mình KHÔNG bị cấm (`ReactQueryDevtools`, câu "mở devtools
    // xem network" đều hợp lệ). Chỉ cấm khi nó đi với ý ĐỊNH DÒ hoặc ĐỊNH TẮT.
    //
    // `outerWidth - innerWidth` là mẹo đoán devtools đang mở kinh điển. Đọc
    // riêng `innerWidth` để làm responsive thì hoàn toàn hợp lệ và KHÔNG khớp:
    // mẫu đòi đúng phép trừ giữa hai đại lượng.
    src:
      String.raw`devtools?[-_ ]?(detect|detector|opened|open|check|guard|block)` +
      String.raw`|(is|has)[-_ ]?dev[-_ ]?tools?` +
      String.raw`|disable[-_ ]?devtool` +
      String.raw`|ondevtool` +
      String.raw`|outerWidth\s*-\s*[\w.]*innerWidth` +
      String.raw`|outerHeight\s*-\s*[\w.]*innerHeight`,
  },
  {
    id: 'chan-contextmenu',
    why: 'chặn chuột phải — giết menu ngữ cảnh của trình đọc màn hình, cản đúng người không gian lận',
    // Bắt MỌI handler `contextmenu`, không chỉ handler có `preventDefault`: thân
    // hàm thường nằm ở dòng khác nên một mẫu "cùng dòng" sẽ tuột.
    //
    // Nếu sau này CẦN một menu ngữ cảnh thật (cây file, bảng dữ liệu) thì đó là
    // một quyết định phải qua lead, và dòng đó được khai chính xác bên dưới —
    // KHÔNG có lối thoát nội tuyến kiểu `// antipattern: allow`.
    src:
      String.raw`addEventListener\(\s*['"\x60]contextmenu` +
      String.raw`|on\s*contextmenu\s*[=:]` +
      String.raw`|['"\x60]contextmenu['"\x60]\s*,\s*[^\n]{0,40}(preventDefault|return\s+false)`,
  },
  {
    id: 'chan-phim-tat',
    why: 'bắt phím tắt devtools — giết điều hướng bàn phím, và mở devtools trước khi tải trang là vượt được',
    // `keyCode === 123` là F12. Đọc `keyCode` cho phím khác (Escape = 27, đang có
    // thật trong packages/terminal) KHÔNG khớp — mẫu đòi đúng giá trị 123.
    //
    // Tổ hợp Ctrl/Cmd + Shift + phím: CHỈ `I` và `J` (inspect / console).
    // ⛔ `C` CỐ Ý KHÔNG có trong lớp ký tự này. Ctrl+Shift+C là phím COPY chuẩn
    // của terminal, và repo có `packages/terminal`. Thêm `C` vào là mua một
    // dương tính giả trên một tính năng chắc chắn sẽ được viết. Đổi lại, một
    // người muốn chặn Ctrl+Shift+C sẽ lọt — chấp nhận: chặn nó cũng không cản
    // được ai, và F12 + Ctrl+Shift+I/J vẫn bị gác.
    src:
      String.raw`['"\x60]F12['"\x60]` +
      String.raw`|(keyCode|which)\s*===?\s*123\b` +
      String.raw`|(ctrlKey|metaKey)[^\n]{0,80}shiftKey[^\n]{0,80}['"\x60][IJij]['"\x60]` +
      String.raw`|shiftKey[^\n]{0,80}(ctrlKey|metaKey)[^\n]{0,80}['"\x60][IJij]['"\x60]`,
  },
  {
    id: 'vong-lap-go-loi',
    why: 'câu lệnh gỡ lỗi trong mã sản phẩm — vòng lặp thì là chống gian lận vô dụng, một câu lẻ thì là rác bị bỏ quên',
    // Ký tự đứng trước bắt buộc là `;`, `{`, `}` hoặc khoảng trắng, để `debugger`
    // trong một định danh dài (`debuggerPanel`) không bị bắt.
    src:
      String.raw`(^|[;{}\s])debugger\s*[;\n]` +
      String.raw`|(setInterval|setTimeout)\([^\n]{0,60}debugger` +
      String.raw`|Function\s*\(\s*['"\x60]debugger`,
  },
  {
    id: 'lam-roi-ma',
    why: 'làm rối mã — chỉ làm chậm người quyết tâm vài phút, đổi lại là stack trace vô dụng cho chính ta',
    // `_0x` + hex là hình dạng định danh mà javascript-obfuscator sinh ra.
    src:
      String.raw`javascript-obfuscator|jscrambler|obfuscat(e|ed|or|ion)` +
      String.raw`|_0x[0-9a-f]{4,}`,
  },
];

// K8s Arena has a real canvas action menu (node actions and scene actions),
// not an anti-cheat blocker. Approved 2026-09-13 during P16 closure. Keep the
// exception at the exact wiring statements, never at directory/file scope.
const APPROVED_CONTEXT_MENUS = [
  [
    'apps/web/src/components/k8s-arena/arena-contract.ts',
    'readonly onContextMenu: (uid: string, screen: ScreenPoint) => void;',
  ],
  ['apps/web/src/components/k8s-arena/arena-root.tsx', 'onContextMenu={openContextMenu}'],
  [
    'apps/web/src/components/k8s-arena/scene/pointer-picking.tsx',
    'const onContextMenu = (event: MouseEvent): void => {',
  ],
  [
    'apps/web/src/components/k8s-arena/scene/pointer-picking.tsx',
    "canvas.addEventListener('contextmenu', onContextMenu);",
  ],
];

function approvedContextMenu(hit, file) {
  return (
    hit.rule === 'chan-contextmenu' &&
    APPROVED_CONTEXT_MENUS.some(
      ([approvedFile, statement]) => file === approvedFile && hit.text === statement,
    )
  );
}

const COMPILED = RULES.map((r) => ({ ...r, re: new RegExp(r.src.normalize('NFC'), 'giu') }));

// ─────────────────────────────────────────────────────── bỏ dòng chú thích
//
// Chỗ ghi lại chính lệnh cấm (đầu `verify.ts`, `integrity.ts`) phải viết ra các
// từ bị cấm để làm tài liệu. Chú thích không chạy nên bỏ qua được.
function isCommentLine(trimmed, ext) {
  if (trimmed.startsWith('<!--')) return true;
  if (ext === '.md' || ext === '.mdx') return false;
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
  if (trimmed.startsWith('#')) return true;
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
          match: m[0].trim(),
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
  let files = 0;

  // Một root biến mất làm vùng quét co lại TRONG IM LẶNG — cổng vẫn xanh vì
  // không còn gì để quét. Thiếu root là hỏng cấu hình, không phải "sạch".
  const missing = ROOTS.filter((r) => !existsSync(join(REPO, r)));
  if (missing.length) {
    console.error(`LỖI CẤU HÌNH: vùng quét không tồn tại: ${missing.join(', ')}`);
    console.error(
      'Thư mục bị đổi tên/di chuyển ⇒ sửa ROOTS trong scripts/check-no-antipattern.mjs.',
    );
    process.exit(2);
  }

  for (const root of ROOTS) {
    for (const abs of walk(join(REPO, root))) {
      if (abs === SELF) continue;
      const rel = relative(REPO, abs).split('\\').join('/');
      const ext = extname(abs).toLowerCase();
      if (BINARY_EXT.has(ext)) continue;
      if (IS_TEST_FILE.test(abs)) continue;
      if (statSync(abs).size > 2 * 1024 * 1024) continue;

      const buf = readFileSync(abs);
      if (buf.subarray(0, 8192).includes(0)) continue;

      files++;
      for (const h of scanText(buf.toString('utf8'), { ext })) {
        if (!approvedContextMenu(h, rel)) hits.push({ ...h, file: rel });
      }
    }
  }
  return { hits, files };
}

// ─────────────────────────────────────────────────────────── đối chứng
//
// BẨN: phải bị bắt, VÀ phải bị bắt BỞI ĐÚNG LUẬT ghi ở cột giữa.
//
// ⚠ Cột giữa (rule id) không phải trang trí. Không có nó thì một mẫu bị luật
// KHÁC bắt hộ vẫn làm đối chứng xanh, và luật đáng lẽ gác nó có thể đã hỏng từ
// lâu mà không ai biết — cổng mất một lớp gác TRONG IM LẶNG. Đây đúng là hình
// dạng "green that proves nothing": phép kiểm vẫn chạy, chỉ là không còn kiểm
// cái nó tưởng đang kiểm.
//
// Đây là những hình dạng THẬT lấy từ các bài "chặn F12" phổ biến trên mạng —
// chính là thứ một người làm theo yêu cầu "chặn F12" sẽ dán vào.
const DIRTY = [
  [
    'kích-thước-cửa-sổ',
    'do-devtools',
    'if (window.outerWidth - window.innerWidth > 160) location.reload();',
  ],
  [
    'kích-thước-chiều-cao',
    'do-devtools',
    'const open = window.outerHeight - window.innerHeight > 200;',
  ],
  ['thư-viện-dò', 'do-devtools', "import devtoolsDetect from 'devtools-detect';"],
  [
    'thư-viện-tắt',
    'do-devtools',
    "disableDevtool({ ondevtoolopen: () => location.replace('/') });",
  ],
  ['hàm-dò', 'do-devtools', 'if (isDevToolsOpen()) { document.body.innerHTML = san; }'],
  ['cờ-dò', 'do-devtools', 'const devtoolsOpen = checkDevtoolsOpen();'],
  [
    'contextmenu-listener',
    'chan-contextmenu',
    "document.addEventListener('contextmenu', (e) => e.preventDefault());",
  ],
  ['contextmenu-thuộc-tính', 'chan-contextmenu', 'document.oncontextmenu = () => false;'],
  ['contextmenu-jsx', 'chan-contextmenu', '<div onContextMenu={(e) => e.preventDefault()}>'],
  ['phím-F12', 'chan-phim-tat', "if (e.key === 'F12') e.preventDefault();"],
  ['phím-keyCode-123', 'chan-phim-tat', 'if (event.keyCode === 123) return false;'],
  [
    'tổ-hợp-ctrl-shift-I',
    'chan-phim-tat',
    "if (e.ctrlKey && e.shiftKey && e.key === 'I') e.preventDefault();",
  ],
  [
    'tổ-hợp-cmd-shift-J',
    'chan-phim-tat',
    "if (e.metaKey && e.shiftKey && e.key === 'J') return false;",
  ],
  [
    'tổ-hợp-ngược-thứ-tự',
    'chan-phim-tat',
    "if (e.shiftKey && e.ctrlKey && e.key === 'i') block();",
  ],
  ['câu-lệnh-gỡ-lỗi', 'vong-lap-go-loi', 'debugger;'],
  ['vòng-lặp-gỡ-lỗi', 'vong-lap-go-loi', 'setInterval(() => { debugger; }, 50);'],
  ['gỡ-lỗi-qua-Function', 'vong-lap-go-loi', "new Function('debugger')();"],
  ['làm-rối-thư-viện', 'lam-roi-ma', "import JavaScriptObfuscator from 'javascript-obfuscator';"],
  ['làm-rối-định-danh', 'lam-roi-ma', "const _0x4f2ab1 = ['getElementById', 'querySelector'];"],
  ['làm-rối-động-từ', 'lam-roi-ma', 'export function obfuscateBundle(code) { return code; }'],
];

// Từ khoá mà một dòng SẠCH phải chạm tới thì mới có ý nghĩa gác.
//
// Một dòng sạch tồn tại vì nó TỪNG (hoặc suýt) bị kêu oan. Nếu nó không chứa
// nổi một từ nào mà luật quan tâm, thì không cách nào nó bị kêu — nó không gác
// gì cả, chỉ làm con số "18 mẫu sạch" trông to ra. Đó là bia mộ, không phải
// hàng rào: một danh sách miễn trừ không ai rà lại sẽ đầy dần những dòng như
// thế, và con số ở dòng tổng kết trở thành lời nói dối.
const CLEAN_ANCHORS = [
  'devtool',
  'width',
  'height',
  'keycode',
  'which',
  'key',
  'menu',
  'addeventlistener',
  'preventdefault',
  'debugger',
  'obfusc',
  'jscrambler',
  '0x',
];

// SẠCH: KHÔNG được kêu. Phần lớn là dòng thật (hoặc dòng sắp thật) trong repo.
// Mỗi dòng ở đây gác một dương tính giả cụ thể; thêm mẫu mới thì thêm luôn dòng
// sạch gần nhất với nó.
const CLEAN = [
  // `devtools` hợp lệ — công cụ phát triển, không phải cơ chế dò.
  "import { ReactQueryDevtools } from '@tanstack/react-query-devtools';",
  "const hint = 'Mở devtools rồi xem tab Network để biết request nào hỏng';",
  '<ReactQueryDevtools initialIsOpen={false} />',
  // Đọc kích thước cửa sổ để làm responsive — không phải phép trừ dò devtools.
  'if (window.innerWidth < 768) setNarrow(true);',
  'const w = window.outerWidth;',
  'const gutter = containerWidth - contentWidth;',
  // Phím hợp lệ. Dòng `keyCode: 27` là dòng THẬT trong packages/terminal.
  'keyCode: 27,',
  "if (event.key === 'Escape') closeOverlay();",
  "if (e.ctrlKey && e.key === 'k') openCommandPalette();",
  "if (e.ctrlKey && e.shiftKey && e.key === 'ArrowDown') selectLineDown();",
  // Ctrl+Shift+C là COPY của terminal — xem ghi chú ở luật `chan-phim-tat`.
  "if (e.ctrlKey && e.shiftKey && e.key === 'C') copySelection();",
  // `preventDefault` một mình hoàn toàn hợp lệ.
  'e.preventDefault();',
  "form.addEventListener('submit', (e) => e.preventDefault());",
  // Định danh chứa `debugger` như một từ, không phải câu lệnh.
  'const debuggerPanel = useDebuggerPanel();',
  "export const DEBUGGER_DOC_URL = '/docs/debugging';",
  // Menu KHÔNG phải context menu.
  '<DropdownMenu onOpenChange={setOpen}>',
  // Hex trong mã hợp lệ — không phải hình dạng định danh của trình làm rối.
  'const FNV_PRIME = 0x01000193;',
  'let hash = 0x811c9dc5;',
];

/**
 * Đối chứng HAI CHIỀU, và chiều thứ hai có hai nửa.
 *
 *   1. BẨN phải bị bắt — bởi ĐÚNG luật đã khai, không phải bởi luật nào cũng được.
 *   2. SẠCH không được kêu.
 *   3. Không luật nào được đứng đó mà KHÔNG có mẫu bẩn chứng minh nó biết kêu.
 *   4. Không dòng sạch nào được đứng đó mà KHÔNG gác gì (mục miễn trừ ôi).
 *
 * (3) và (4) là phần dễ bị bỏ qua nhất. Một luật không có mẫu bẩn có thể là một
 * regex gõ sai không bao giờ khớp — cổng vẫn xanh, vẫn báo "đã quét N file", và
 * lớp gác đó đã chết từ lâu. Một dòng sạch không gác gì thì thổi phồng con số
 * tổng kết mà không mua thêm được sự an toàn nào.
 */
function selfTest() {
  const fails = [];
  const exercised = new Set();

  for (const [file, statement] of APPROVED_CONTEXT_MENUS) {
    const [hit] = scanText(statement, { ext: '.tsx' });
    if (!hit || !approvedContextMenu(hit, file)) fails.push(`MENU HỢP LỆ BỊ KÊU OAN: ${file}`);
    if (hit && approvedContextMenu(hit, 'apps/web/src/other.tsx'))
      fails.push(`MIỄN TRỪ LAN SANG FILE KHÁC: ${file}`);
    for (const [, , dirty] of DIRTY) {
      if (
        scanText(dirty, { ext: '.tsx' }).some((candidate) => approvedContextMenu(candidate, file))
      ) {
        fails.push(`MIỄN TRỪ CHE MÃ CẤM TRONG CÙNG FILE: ${file}`);
      }
    }
    const source = readFileSync(join(REPO, file), 'utf8');
    if (!source.split(/\r?\n/).some((line) => line.trim() === statement)) {
      fails.push(`MIỄN TRỪ ĐÃ ÔI: ${file} / ${statement}`);
    }
  }

  for (const [tag, expectedRule, line] of DIRTY) {
    const hits = scanText(line, { ext: '.tsx' });
    if (hits.length === 0) {
      fails.push(`BẨN KHÔNG BỊ BẮT  [${tag}]  ${line}`);
      continue;
    }
    const byExpected = hits.filter((h) => h.rule === expectedRule);
    if (byExpected.length === 0) {
      fails.push(
        `BẨN BỊ BẮT NHẦM LUẬT  [${tag}] chờ "${expectedRule}" ` +
          `nhưng chỉ có "${[...new Set(hits.map((h) => h.rule))].join(', ')}" kêu  ${line}`,
      );
      continue;
    }
    exercised.add(expectedRule);
  }

  // (3) luật không có mẫu bẩn nào — không chứng minh được là nó biết kêu.
  for (const rule of COMPILED) {
    if (!exercised.has(rule.id)) {
      fails.push(
        `LUẬT KHÔNG CÓ ĐỐI CHỨNG  [${rule.id}] không mẫu bẩn nào chứng minh nó bắt được gì. ` +
          `Thêm một dòng vào DIRTY, hoặc bỏ luật.`,
      );
    }
  }

  // Mẫu bẩn khai một luật không tồn tại — thường là dấu vết của một lần đổi tên
  // luật mà quên đổi ở đây; nó làm (3) báo động ở chỗ khác nên phải nói riêng.
  const ruleIds = new Set(COMPILED.map((r) => r.id));
  for (const [tag, expectedRule] of DIRTY) {
    if (!ruleIds.has(expectedRule)) {
      fails.push(`MẪU BẨN KHAI LUẬT KHÔNG TỒN TẠI  [${tag}] -> "${expectedRule}"`);
    }
  }

  for (const line of CLEAN) {
    const hits = scanText(line, { ext: '.tsx' });
    if (hits.length) {
      fails.push(`SẠCH BỊ KÊU OAN  [${hits[0].rule} khớp "${hits[0].match}"]  ${line}`);
      continue;
    }
    // (4) mục miễn trừ ôi: không chạm từ khoá nào của bất kỳ luật nào.
    const lower = line.toLowerCase();
    if (!CLEAN_ANCHORS.some((anchor) => lower.includes(anchor))) {
      fails.push(
        `SẠCH ĐÃ ÔI  dòng này không chạm từ khoá nào của luật nào nên không cách gì bị kêu — ` +
          `nó không gác gì cả, bỏ đi hoặc thay bằng dòng thật sự suýt bị bắt:  ${line}`,
      );
    }
  }

  const total = DIRTY.length + CLEAN.length + COMPILED.length;
  if (fails.length) {
    console.error('✗ ĐỐI CHỨNG HỎNG — cổng không chứng minh được là nó biết kêu:\n');
    for (const f of fails) console.error(`   ${f}`);
    console.error(
      `\n${fails.length}/${total} phép đối chứng sai. Sửa RULES trong ${relative(REPO, SELF)}.`,
    );
    console.error('KHÔNG nới mẫu để dập báo động — nếu là dương tính giả thì thêm dòng vào CLEAN.');
    return false;
  }
  console.log(
    `✓ đối chứng: bắt đủ ${DIRTY.length} mẫu vi phạm ĐÚNG LUẬT, ` +
      `im lặng trên ${CLEAN.length} mẫu sạch, ` +
      `và cả ${COMPILED.length}/${COMPILED.length} luật đều có mẫu chứng minh biết kêu.`,
  );
  return true;
}

// ─────────────────────────────────────────────────────────────── main
const onlySelfTest = process.argv.includes('--self-test');

if (!selfTest()) process.exit(2);
if (onlySelfTest) process.exit(0);

const { hits, files } = scanTree();

if (hits.length === 0) {
  console.log(
    `✓ không có mã chống gian lận bị cấm — ` +
      `đã quét ${files} file trong ${ROOTS.length} vùng; ${APPROVED_CONTEXT_MENUS.length} dòng nối menu hành động Arena được duyệt riêng.`,
  );
  process.exit(0);
}

console.error(`\n✗ ${hits.length} vi phạm lệnh cấm chống-gian-lận-kiểu-dân-gian (§8.1):\n`);
for (const h of hits) {
  console.error(`   ${h.file}:${h.line}:${h.col}  [${h.rule}] khớp "${h.match}"`);
  console.error(`      ${h.text.slice(0, 140)}`);
  console.error(`      vì sao cấm: ${h.why}`);
}
console.error('\nKhông chặn được F12 — đó là sự thật kỹ thuật, không phải một lựa chọn.');
console.error('Cơ chế thay thế là phát lại tất định: packages/games/src/core/verify.ts.');
console.error('Đọc docs/games/anti-cheat.md trước khi thêm bất cứ thứ gì vào chỗ này.');
console.error('Nếu đây là báo động giả thì sửa MẪU trong scripts/check-no-antipattern.mjs');
console.error('và thêm dòng đó vào mảng CLEAN để lần sau không tái phát.');
process.exit(1);
