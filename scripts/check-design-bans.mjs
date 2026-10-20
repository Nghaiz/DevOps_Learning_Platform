#!/usr/bin/env node
/**
 * Cổng lệnh cấm thiết kế của bản dựng lại giao diện 2026-10.
 *
 * Chủ dự án cấm, nguyên văn: dùng lại giao diện của các bản cũ, các bộ icon đại trà, loader
 * dạng donut hay vòng tròn, viền trái làm dấu đang chọn. Bốn lệnh cấm đó có HÌNH DẠNG xác định
 * trong mã nguồn nên máy gác được. Những lệnh còn lại (không sidebar trái, không thẻ bo góc,
 * không hàng ô số liệu, không chủ đề tàu và nhà ga) là phán đoán về bố cục: chúng thuộc về
 * người rà ảnh chụp màn hình, không thuộc về một regex, và cổng này cố ý không giả vờ gác chúng.
 *
 * Giao diện cũ vẫn sống hợp lệ ở những vùng chủ dự án yêu cầu giữ nguyên: landing, canvas game
 * K8s, và màn chơi Git / CI/CD (bọc trong `LegacySkin`). `LEGACY_ZONES` liệt kê chúng; ngoài
 * đó, mọi kit, lớp và biến của bản cũ là vi phạm.
 *
 * Tên lớp và biến cũ KHÔNG chép tay: script đọc chúng từ chính legacy.css (`@utility`,
 * `--color-*`, `--shadow-*`, `--radius-*` trong `@theme inline`, và mọi biến khai trong khối có
 * phạm vi) rồi trừ đi những tên hệ `ds` cũng khai. Thêm token vào legacy.css là cổng tự biết.
 *
 * Dùng:  node scripts/check-design-bans.mjs [--self-test]
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(SELF, '..', '..');

const LEGACY_CSS = 'apps/web/src/app/legacy.css';
const DS_THEME_CSS = 'packages/ds/src/styles/theme.css';

// ─────────────────────────────────────────────────────────────── vùng quét
//
// `packages/ui/src` CỐ Ý đứng ngoài: đó chính là kit cũ, phục vụ các vùng giữ nguyên.
// `packages/copy` đứng ngoài vì cổng này gác HÌNH DẠNG giao diện, không gác chữ.
const ROOTS = ['apps/web/src', 'packages/ds/src'];

const SCANNED_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.css']);

const IGNORE_DIRS = new Set(['node_modules', '.next', '.turbo', 'dist', 'build', 'coverage', '__snapshots__']);

// File test được miễn: chúng đọc và khẳng định chính token cũ (git-palette.test.ts đọc
// legacy.css), và một fixture nói về `animate-spin` không vẽ ra spinner nào.
const IS_TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/i;

// ─────────────────────────────────────────────────────── vùng giữ nguyên
//
// Mỗi dòng phải CÒN chứa thứ của giao diện cũ. Một dòng không còn che vi phạm nào là một
// dòng CHẾT, và cổng đỏ để bắt xoá nó: không có chiều xuống này thì danh sách chỉ lớn dần,
// và mỗi dòng chết là một chỗ giao diện cũ quay lại được mà không ai thấy.
//
// Màn chơi Git và CI/CD liệt kê theo FILE, không theo thư mục: cùng thư mục có trang chọn màn
// (`git-campaign.tsx`, `cicd-campaign.tsx`) và Level Builder, mà hai thứ đó là giao diện MỚI.
const LEGACY_ZONES = [
  { path: LEGACY_CSS, why: 'chính bảng token của giao diện cũ' },
  { path: 'apps/web/src/components/landing/', why: 'landing, giữ nguyên theo yêu cầu' },
  { path: 'apps/web/src/components/k8s-arena/', why: 'canvas game K8s, giữ nguyên theo yêu cầu' },
  {
    path: 'apps/web/src/app/(session)/problems/[code]/problem-verdict.tsx',
    why: 'kết quả nộp bài vẽ BÊN TRONG canvas K8s (k8s-arena/hud/problem-submit-panel.tsx)',
  },
  { path: 'apps/web/src/app/practice.css', why: 'lớp CSS của canvas K8s (arena-entry.tsx, level-picker.tsx)' },
  {
    path: 'apps/web/src/components/games/legacy-skin.tsx',
    why: 'ranh giới mở phạm vi giao diện cũ; lớp phủ canvas K8s đọc `bg-background` cũ trên chính nó',
  },
  { path: 'apps/web/src/components/games/shared/', why: 'trình soạn YAML dùng trong màn chơi' },
  { path: 'apps/web/src/components/games/git/git-odyssey.css', why: 'bảng màu và bố cục của màn chơi Git' },
  { path: 'apps/web/src/components/games/git/scene3d/', why: 'cảnh 3D của màn chơi Git' },
  { path: 'apps/web/src/components/games/git/git-console.tsx', why: 'màn chơi Git' },
  { path: 'apps/web/src/components/games/git/git-level-screen.tsx', why: 'màn chơi Git' },
  { path: 'apps/web/src/components/games/git/git-map-stage.tsx', why: 'màn chơi Git' },
  { path: 'apps/web/src/components/games/git/git-sandbox.tsx', why: 'màn chơi Git (sandbox)' },
  { path: 'apps/web/src/components/games/git/git-status-screen.tsx', why: 'màn chơi Git' },
  { path: 'apps/web/src/components/games/git/git-svg-scene.tsx', why: 'cảnh 2D của màn chơi Git' },
  { path: 'apps/web/src/components/games/git/mode-toggle.tsx', why: 'màn chơi Git' },
  { path: 'apps/web/src/components/games/cicd/cicd-level-screen.tsx', why: 'màn chơi CI/CD' },
  { path: 'apps/web/src/components/games/cicd/cicd-result-panel.tsx', why: 'màn chơi CI/CD' },
  { path: 'apps/web/src/components/games/cicd/cicd-sandbox.tsx', why: 'màn chơi CI/CD (sandbox)' },
  { path: 'apps/web/src/components/games/cicd/cicd-snippet-bar.tsx', why: 'màn chơi CI/CD' },
  { path: 'apps/web/src/components/games/cicd/cicd-cd-panel.tsx', why: 'bảng CD trong màn chơi CI/CD' },
  { path: 'apps/web/src/components/games/cicd/cicd-cd-metrics.tsx', why: 'kết quả CD trong màn chơi CI/CD' },
  { path: 'apps/web/src/components/games/cicd/cicd-overrides-panel.tsx', why: 'bảng tham số trong màn chơi CI/CD' },
  { path: 'apps/web/src/components/games/cicd/cicd-cheatsheet.tsx', why: 'bảng tra cứu trong màn chơi CI/CD' },
  {
    path: 'apps/web/src/components/games/cicd/cicd-problem.tsx',
    why: 'màn làm bài OJ bên trong game CI/CD (`?problem=`), bọc `LegacySkin` ở cicd-game.tsx',
  },
  { path: 'apps/web/src/components/games/cicd/hud/', why: 'HUD của màn chơi CI/CD' },
  { path: 'apps/web/src/components/games/cicd/scene3d/', why: 'cảnh 3D của màn chơi CI/CD' },
];

// ─────────────────────────────────────────────────────────────── luật tĩnh
const IMPORT_FROM = String.raw`(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]`;

const STATIC_RULES = [
  {
    id: 'kit-cũ',
    why: 'kit component của giao diện cũ (`@devops-platform/ui`); dùng `@devops-platform/ds`',
    src: IMPORT_FROM + String.raw`@devops-platform\/ui(?:\/[^'"]*)?['"]`,
  },
  {
    id: 'icon-đại-trà',
    why: 'bộ icon đại trà; hệ `ds` có bộ glyph riêng (`<Icon name="…" />`)',
    src:
      IMPORT_FROM +
      String.raw`(?:lucide-react|lucide|react-icons(?:\/[^'"]*)?|@heroicons\/[^'"]+|@tabler\/icons[^'"]*|` +
      String.raw`@phosphor-icons\/[^'"]+|@radix-ui\/react-icons|@mui\/icons-material(?:\/[^'"]*)?|react-feather|` +
      String.raw`@fortawesome\/[^'"]+|iconoir-react|@iconify\/[^'"]+|@remixicon\/[^'"]+|react-bootstrap-icons)['"]`,
  },
  {
    id: 'loader-vòng',
    why: 'loader quay vòng (donut, spinner); hệ `ds` báo đang tải bằng vạch quét',
    src: String.raw`(?<![\w-])animate-spin(?![\w-])|@keyframes\s+spin\b|rotate\(\s*(?:360deg|1turn)\s*\)`,
  },
  {
    id: 'viền-trái',
    why: 'viền trái dày làm dấu đang chọn; đường kẻ 1px làm vạch chia thì hợp lệ',
    src:
      String.raw`(?<![\w-])border-[ls]-(?:[2-9]|\[\s*[2-9](?:\.\d+)?px\s*\])(?![\w-])` +
      String.raw`|border-(?:left|inline-start)(?:-width)?\s*:\s*[2-9](?:\.\d+)?px` +
      String.raw`|inset_[2-9]px_0(?![\d.])`,
  },
];

// ─────────────────────────────────────────── luật sinh từ legacy.css
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function themeKeys(css) {
  const keys = new Set();
  for (const block of stripComments(css).matchAll(/@theme(?:\s+inline)?\s*\{([\s\S]*?)\n\}/g)) {
    for (const d of block[1].matchAll(/(--[a-z0-9-]+)\s*:/g)) keys.add(d[1]);
  }
  return keys;
}

const utilityNames = (css) => new Set([...stripComments(css).matchAll(/@utility\s+([a-z0-9-]+)/g)].map((m) => m[1]));

const declaredVars = (css) => new Set([...stripComments(css).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

// Không gian tên của chính Tailwind: `var(--text-sm)`, `var(--spacing)` là hợp lệ ở mọi nơi
// vì Tailwind tự khai chúng. Legacy.css khai đè vài tên trong số này trong phạm vi của nó.
const TAILWIND_NAMESPACE =
  /^--(?:spacing|text-|leading-|radius|font-|tracking-|shadow-|inset-shadow-|drop-shadow-|ease-|animate-|blur-|breakpoint-|container-|color-|default-|perspective-|aspect-)/;

const COLOR_PREFIX = String.raw`(?:bg|text|border(?:-[xytrblse])?|outline|ring(?:-offset)?|inset-ring|shadow|inset-shadow|divide|fill|stroke|from|via|to|decoration|accent|caret|placeholder)`;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = (names) => names.map(escape).toSorted((a, b) => b.length - a.length).join('|');

function legacyRules(legacyCss, dsCss) {
  const dsKeys = themeKeys(dsCss);
  const colors = [];
  const shadows = [];
  const radii = [];
  for (const key of themeKeys(legacyCss)) {
    if (dsKeys.has(key)) continue;
    let m;
    if ((m = /^--color-(.+)$/.exec(key))) colors.push(m[1]);
    else if ((m = /^--shadow-(.+)$/.exec(key))) shadows.push(m[1]);
    else if ((m = /^--radius-(.+)$/.exec(key))) radii.push(m[1]);
  }
  const dsUtilities = utilityNames(dsCss);
  const utilities = [...utilityNames(legacyCss)].filter((u) => !dsUtilities.has(u));
  const dsVars = declaredVars(dsCss);
  const vars = [...declaredVars(legacyCss)]
    .filter((v) => !dsVars.has(v) && !TAILWIND_NAMESPACE.test(v))
    .map((v) => v.slice(2));

  const classParts = [];
  if (colors.length) classParts.push(String.raw`${COLOR_PREFIX}-(?:${alt(colors)})(?:\/[\w.%[\]-]+)?`);
  if (shadows.length) classParts.push(String.raw`shadow-(?:${alt(shadows)})`);
  if (radii.length) classParts.push(String.raw`rounded(?:-[trblse]{1,2})?-(?:${alt(radii)})`);
  // `(?!\s*:)`: vài tên tiện ích cũ là từ thường (`stagger`), và `{ stagger: 0.06 }` của GSAP là
  // khoá object, không phải lớp. Biến thể Tailwind luôn đứng TRƯỚC tên lớp, nên lớp thật không
  // bao giờ theo sau bởi dấu hai chấm.
  if (utilities.length) classParts.push(String.raw`(?:${alt(utilities)})(?!\s*:)`);

  const rules = [];
  if (classParts.length) {
    rules.push({
      id: 'lớp-cũ',
      why: 'lớp tiện ích của giao diện cũ; ngoài vùng giữ nguyên nó trỏ vào biến không tồn tại',
      src: String.raw`(?<![\w-])(?:[a-z0-9-]+:)*(?:${classParts.join('|')})(?![\w-])`,
    });
  }
  if (vars.length) {
    rules.push({
      id: 'biến-cũ',
      why: 'biến CSS của giao diện cũ; chỉ có giá trị bên trong `.legacy-skin` / `.arena-root`',
      src: String.raw`(?:var\(|\()\s*--(?:${alt(vars)})(?![\w-])`,
    });
  }
  return { rules, counts: { colors: colors.length, shadows: shadows.length, radii: radii.length, utilities: utilities.length, vars: vars.length } };
}

const compile = (rules) => rules.map((r) => ({ ...r, re: new RegExp(r.src, 'gu') }));

// ─────────────────────────────────── đảo ds: `.ds-island` phủ đủ tên bị đè
//
// `.legacy-skin` khai lại vài tên mà tiện ích Tailwind của ds đọc (`--font-sans`, `--text-sm`,
// `--radius-md`, `--ink`…). Khối giao diện mới nằm trong màn chơi cũ đặt `.ds-island`, và khối đó
// phải khai lại ĐỦ các tên ấy; thiếu một tên là một tiện ích lặng lẽ đọc giá trị cũ. Tập tên tính
// từ chính ba file CSS, không liệt kê tay.
//
// Chỉ xét khối trong cùng (thân không chứa `{`): khối có phạm vi của legacy.css, khối @palette và
// `.ds-island` của ds đều là khối phẳng chỉ có khai báo.
function innermostBlocks(css) {
  return [...stripComments(css).matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((m) => ({
    prelude: m[1].trim(),
    names: new Set([...m[2].matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((d) => d[1])),
  }));
}

function islandGaps(legacyCss, dsCss, twThemeCss) {
  const scoped = new Set();
  for (const block of innermostBlocks(legacyCss)) {
    if (block.prelude.startsWith('@')) continue;
    for (const name of block.names) scoped.add(name);
  }
  const reachable = new Set([...declaredVars(dsCss), ...declaredVars(twThemeCss)]);
  const covered = new Set();
  for (const block of innermostBlocks(dsCss)) {
    if (!block.prelude.split(',').some((sel) => sel.trim().split(/\s+/).at(-1) === '.ds-island')) continue;
    for (const name of block.names) covered.add(name);
  }
  const required = [...scoped].filter((name) => reachable.has(name));
  return { required: required.length, gaps: required.filter((name) => !covered.has(name)).toSorted() };
}

// ─────────────────────────────────────────────────────────────── quét
function isCommentLine(trimmed) {
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('{/*')
  );
}

function scanText(text, rules) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || isCommentLine(trimmed)) continue;
    for (const rule of rules) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(raw)) !== null) {
        hits.push({ line: i + 1, col: m.index + 1, rule: rule.id, why: rule.why, match: m[0], text: trimmed });
        if (m.index === rule.re.lastIndex) rule.re.lastIndex++;
      }
    }
  }
  return hits;
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
    } else if (SCANNED_EXT.has(extname(entry.name)) && !IS_TEST_FILE.test(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

const toPosix = (p) => p.split('\\').join('/');
const zoneOf = (file) => LEGACY_ZONES.find((z) => (z.path.endsWith('/') ? file.startsWith(z.path) : file === z.path)) ?? null;

function scanTree(rules) {
  const hits = [];
  const zoneHits = new Map(LEGACY_ZONES.map((z) => [z.path, 0]));
  let files = 0;
  for (const root of ROOTS) {
    const abs = join(REPO, root);
    if (!existsSync(abs)) throw new Error(`vùng quét ${root} không tồn tại — sửa ROOTS`);
    for (const path of walk(abs)) {
      files++;
      const file = toPosix(relative(REPO, path));
      const found = scanText(readFileSync(path, 'utf8'), rules);
      if (found.length === 0) continue;
      const zone = zoneOf(file);
      if (zone !== null) zoneHits.set(zone.path, zoneHits.get(zone.path) + found.length);
      else for (const hit of found) hits.push({ file, ...hit });
    }
  }
  return { hits, files, zoneHits };
}

// ─────────────────────────────────────────────────────────────── đối chứng
//
// BẨN: phải bị bắt. SẠCH: không được kêu. Phần lớn là dòng THẬT trong cây; mỗi dòng SẠCH ghim
// một báo động giả gần kề nhất của một luật (đường kẻ 1px, `stagger` của GSAP, `text-ink`).
const DIRTY = [
  ['kit-cũ', "import { Badge } from '@devops-platform/ui';"],
  ['kit-cũ-đường-con', "import { cn } from '@devops-platform/ui/cn';"],
  ['kit-cũ-động', "const Card = dynamic(() => import('@devops-platform/ui').then((m) => m.Card));"],
  ['icon-lucide', "import { CircleCheck } from 'lucide-react';"],
  ['icon-heroicons', "import { CheckIcon } from '@heroicons/react/24/solid';"],
  ['icon-react-icons', "import { FaGithub } from 'react-icons/fa';"],
  ['icon-radix', "import { Cross2Icon } from '@radix-ui/react-icons';"],
  ['spinner', '<span className="size-4 animate-spin rounded-full border-2 border-t-transparent" />'],
  ['spinner-responsive', "className={cn('motion-safe:animate-spin', busy && 'opacity-60')}"],
  ['spinner-css', '@keyframes spin { to { transform: rotate(360deg); } }'],
  ['viền-trái-tw', "'border-l-4 border-acc-solid pl-3'"],
  ['viền-trái-logic', "current && 'border-s-2 border-acc-solid'"],
  ['viền-trái-tuỳ-ý', 'className="border-l-[3px] border-tp-solid"'],
  ['viền-trái-css', '  border-left: 3px solid var(--acc-solid);'],
  ['viền-trái-bóng', "className=\"shadow-[inset_3px_0_0_var(--acc-solid)]\""],
  ['lớp-cũ-màu', '<p className="text-muted-foreground">Chưa có bài nào</p>'],
  ['lớp-cũ-độ-mờ', '<div className="bg-card/80 backdrop-blur">'],
  ['lớp-cũ-tiền-tố', "className=\"hover:bg-primary dark:text-primary-foreground\""],
  ['lớp-cũ-viền', '<div className="border border-border">'],
  ['lớp-cũ-bóng', '<section className="shadow-elevation-2">'],
  ['lớp-cũ-bo-góc', '<button className="rounded-control px-3">'],
  ['lớp-cũ-tiện-ích', '<h1 className="type-poster">Bảng tuyến</h1>'],
  ['lớp-cũ-tuyến', '<span className="bg-line-k8s text-line-k8s-foreground">K8s</span>'],
  ['biến-cũ', "style={{ color: 'var(--line-git-ink)' }}"],
  ['biến-cũ-tw4', '<div className="bg-(--card)">'],
];

const CLEAN = [
  "import { Button, Icon, Notice } from '@devops-platform/ds';",
  "import { t } from '@devops-platform/copy';",
  '<Icon name="success" size={16} className="shrink-0" />',
  '<div className="flex items-center gap-3 border-l border-rule pl-4">',
  "'border-b-2 border-acc-solid'",
  '<span className="text-ink font-display font-semibold tabular-nums">',
  '<p className="text-ink-2">Máy của bạn chưa chạy</p>',
  '<div className="bg-acc-wash text-acc-ink border-rule">',
  '<span data-topic="git" className="text-tp-ink">',
  "gsap.to(items, { y: 0, stagger: 0.06 });",
  "const spinning = useSpin();",
  '<div className="rounded-md bg-warn-wash px-4 py-3">',
  "style={{ '--i': index } as CSSProperties}",
  "style={{ width: 'var(--measure-inline)' }}",
  'transform: rotate(180deg);',
  "<p className=\"text-sm text-ok-ink\">{t('author.builder.issues.ready')}</p>",
];

function selfTest(rules) {
  const fails = [];
  for (const [tag, line] of DIRTY) {
    if (scanText(line, rules).length === 0) fails.push(`BẨN KHÔNG BỊ BẮT  [${tag}]  ${line}`);
  }
  for (const line of CLEAN) {
    const hits = scanText(line, rules);
    if (hits.length) fails.push(`SẠCH BỊ KÊU OAN  [${hits[0].rule} khớp "${hits[0].match}"]  ${line}`);
  }
  // Luật sinh từ legacy.css phải THẬT SỰ sinh ra thứ gì đó: một legacy.css đổi định dạng làm bộ
  // đọc trả rỗng là đúng kiểu hỏng im lặng — cổng vẫn xanh, chỉ là không gác lớp cũ nào.
  for (const id of ['lớp-cũ', 'biến-cũ']) {
    if (!rules.some((r) => r.id === id)) fails.push(`LUẬT SINH RỖNG  [${id}] — bộ đọc legacy.css không ra tên nào`);
  }
  const total = DIRTY.length + CLEAN.length;
  if (fails.length) {
    console.error('✗ ĐỐI CHỨNG HỎNG — cổng không chứng minh được là nó biết kêu:\n');
    for (const f of fails) console.error(`   ${f}`);
    console.error(`\n${fails.length}/${total} mẫu sai. Sửa luật trong ${relative(REPO, SELF)}, đừng nới vùng giữ nguyên.`);
    return false;
  }
  console.log(`✓ đối chứng: bắt đủ ${DIRTY.length} mẫu vi phạm, không kêu trên ${CLEAN.length} mẫu sạch.`);
  return true;
}

// ─────────────────────────────────────────────────────────────── main
const legacyCss = readFileSync(join(REPO, LEGACY_CSS), 'utf8');
const dsCss = readFileSync(join(REPO, DS_THEME_CSS), 'utf8');
const generated = legacyRules(legacyCss, dsCss);
const RULES = compile([...STATIC_RULES, ...generated.rules]);

if (!selfTest(RULES)) process.exit(2);

const twThemeCss = readFileSync(
  createRequire(join(REPO, 'apps/web/package.json')).resolve('tailwindcss/theme.css'),
  'utf8',
);

// Đối chứng cho phép đo `.ds-island`: bỏ một tên khỏi khối thì phép đo phải thấy nó thiếu.
function islandSelfTest() {
  const doctored = dsCss.replace(/\n\s*--text-sm: --theme\(--text-sm inline\);/, '');
  if (doctored === dsCss) return 'mẫu đối chứng không còn khớp theme.css (dòng `--text-sm` của `.ds-island`)';
  const { gaps } = islandGaps(legacyCss, doctored, twThemeCss);
  if (!gaps.includes('--text-sm')) return `bỏ \`--text-sm\` khỏi .ds-island mà phép đo không thấy (ra ${JSON.stringify(gaps)})`;
  return null;
}
const islandProblem = islandSelfTest();
if (islandProblem !== null) {
  console.error(`✗ ĐỐI CHỨNG .ds-island HỎNG — ${islandProblem}`);
  process.exit(2);
}
if (process.argv.includes('--self-test')) process.exit(0);

const island = islandGaps(legacyCss, dsCss, twThemeCss);
const gaps = island.gaps;
if (gaps.length > 0) {
  console.error(`\n✗ .ds-island (${DS_THEME_CSS}) thiếu ${gaps.length} tên mà legacy.css khai đè:\n`);
  for (const name of gaps) console.error(`   ${name}`);
  console.error('\nThêm `<tên>: --theme(<tên> inline);` vào khối `.ds-island`, hoặc đưa `.ds-island` vào bộ chọn');
  console.error('của khối khai tên đó. Thiếu một tên là tiện ích trong khối giao diện mới đọc lặng lẽ giá trị cũ.');
  process.exit(1);
}

const missingZones = LEGACY_ZONES.filter((z) => !existsSync(join(REPO, z.path)));
if (missingZones.length > 0) {
  console.error('\n✗ LEGACY_ZONES trỏ tới đường dẫn không còn tồn tại:\n');
  for (const z of missingZones) console.error(`   ${z.path}`);
  console.error('\nFile đã bị xoá hoặc đổi tên: xoá hoặc sửa dòng tương ứng.');
  process.exit(1);
}
for (const z of LEGACY_ZONES) {
  const isDir = statSync(join(REPO, z.path)).isDirectory();
  if (isDir !== z.path.endsWith('/')) {
    console.error(`✗ LEGACY_ZONES: ${z.path} — thư mục phải kết thúc bằng "/", file thì không.`);
    process.exit(1);
  }
}

const { hits, files, zoneHits } = scanTree(RULES);

const deadZones = LEGACY_ZONES.filter((z) => zoneHits.get(z.path) === 0);
if (deadZones.length > 0) {
  console.error(`\n✗ ${deadZones.length} dòng của LEGACY_ZONES không còn che vi phạm nào:\n`);
  for (const z of deadZones) console.error(`   ${z.path}  (${z.why})`);
  console.error('\nĐó là TIN MỪNG: vùng ấy đã sạch giao diện cũ. XOÁ dòng khỏi danh sách để nó được gác.');
  process.exit(1);
}

if (hits.length === 0) {
  const c = generated.counts;
  console.log(
    `✓ không có kit cũ, icon đại trà, loader vòng, viền trái hay lớp/biến cũ ngoài vùng giữ nguyên — ` +
      `đã quét ${files} file trong ${ROOTS.length} vùng; luật sinh từ legacy.css: ${c.colors} màu, ` +
      `${c.shadows} bóng, ${c.radii} bo góc, ${c.utilities} tiện ích, ${c.vars} biến; ` +
      `${LEGACY_ZONES.length} vùng giữ nguyên; .ds-island phủ đủ ${island.required} tên legacy.css khai đè.`,
  );
  process.exit(0);
}

console.error(`\n✗ ${hits.length} vi phạm lệnh cấm thiết kế ngoài vùng giữ nguyên:\n`);
for (const h of hits) {
  console.error(`   ${h.file}:${h.line}:${h.col}  [${h.rule}] khớp "${h.match}"`);
  console.error(`      ${h.text.slice(0, 140)}`);
}
console.error('\nGiao diện mới dùng `@devops-platform/ds`: Icon của ds, vạch quét thay spinner, nền tô hoặc');
console.error('chữ đậm thay viền trái. Nếu file thật sự thuộc một vùng giữ nguyên thì thêm nó vào');
console.error('LEGACY_ZONES kèm lý do. Nếu là báo động giả thì sửa luật và thêm dòng đó vào CLEAN.');
process.exit(1);
