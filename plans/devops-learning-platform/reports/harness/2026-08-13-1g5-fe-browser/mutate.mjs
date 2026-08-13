// Kiểm đột biến cho 1.G-5: mỗi bản vá/nhánh phải có ÍT NHẤT một ca đỏ được.
// Một phép kiểm không thể đỏ thì không kiểm gì cả.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Đường dẫn suy ra từ VỊ TRÍ file này, không hardcode — artifact phải chạy được
// trên máy khác. Thư mục này nằm ở
// plans/devops-learning-platform/reports/harness/<chặng>/ ⇒ lùi 5 cấp tới repo root.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../../..', 'packages/terminal');
const CORE = `${ROOT}/src/terminal-core.ts`;
const SURFACE = `${ROOT}/src/terminal-surface.tsx`;
const CONFIG = `${ROOT}/vitest.config.ts`;

const MUTATIONS = [
  {
    id: 'M1',
    what: 'lastNotified seed lại bằng lastSize (bỏ bản vá lượt-đo-đầu-chỉ-ghi)',
    file: CORE,
    from: 'let lastNotified: TerminalDimensions | null = null;',
    to: 'let lastNotified: TerminalDimensions | null = lastSize;',
    expect: 'mount rồi KHÔNG đổi gì',
  },
  {
    id: 'M2',
    what: 'bỏ console.warn trong catch WebGL',
    file: CORE,
    from: "console.warn('[dlp-terminal] không khởi tạo được WebGL, dùng DOM renderer:', error);",
    to: 'void error;',
    expect: 'cảnh không-WebGL: có console.warn fallback',
  },
  {
    id: 'M3',
    what: 'catch WebGL ném lại thay vì fallback (bỏ hẳn nhánh dự phòng)',
    file: CORE,
    // File là CRLF — anchor hai dòng bằng chuỗi thường KHÔNG khớp. Dùng \r?\n.
    re: /console\.warn\('\[dlp-terminal\] không khởi tạo được WebGL[^\r\n]*\r?\n\s*webgl = null;/,
    to: 'throw error;',
    expect: 'createTerminalCore KHÔNG ném',
  },
  {
    id: 'M4',
    what: 'bỏ connection.close() trong cleanup của effect kết nối',
    file: SURFACE,
    from: '      connection.close();',
    to: '      void connection;',
    expect: 'mount/unmount 3 lần',
  },
  {
    id: 'M5',
    what: 'RESIZE_DEBOUNCE_MS 50 → 5 (debounce quá ngắn để gộp burst)',
    file: CORE,
    from: 'export const RESIZE_DEBOUNCE_MS = 50;',
    to: 'export const RESIZE_DEBOUNCE_MS = 5;',
    expect: 'onResize chạy ĐÚNG 1 lần',
  },
  {
    id: 'M6',
    what: "bỏ cờ --disable-3d-apis khỏi project gpu-off",
    file: CONFIG,
    from: "const NO_WEBGL_ARGS = ['--disable-3d-apis'];",
    to: 'const NO_WEBGL_ARGS: string[] = [];',
    expect: 'khớp với cờ launch đã cấu hình',
  },
];

function run() {
  try {
    const out = execSync('pnpm exec vitest run --project gpu-on --project gpu-off --reporter=json', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return out;
  } catch (e) {
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

function failedNames(raw) {
  const start = raw.indexOf('{');
  if (start < 0) return { parsed: false, names: [], total: 0, failed: 0 };
  try {
    const j = JSON.parse(raw.slice(start));
    const names = [];
    for (const suite of j.testResults ?? []) {
      for (const t of suite.assertionResults ?? []) {
        if (t.status === 'failed') names.push(t.fullName ?? t.title);
      }
    }
    return { parsed: true, names, total: j.numTotalTests, failed: j.numFailedTests };
  } catch {
    return { parsed: false, names: [], total: 0, failed: 0 };
  }
}

console.log('=== BASELINE ===');
const base = failedNames(run());
console.log(`total=${base.total} failed=${base.failed}`);
if (base.failed !== 0) {
  console.log('⛔ baseline KHÔNG sạch, dừng:', base.names);
  process.exit(1);
}

const rows = [];
for (const m of MUTATIONS) {
  const original = readFileSync(m.file, 'utf8');
  const found = m.re ? m.re.test(original) : original.includes(m.from);
  if (!found) {
    rows.push({ ...m, verdict: '⛔ KHÔNG TÌM THẤY chuỗi gốc', failed: 0, names: [] });
    continue;
  }
  writeFileSync(m.file, original.replace(m.re ?? m.from, m.to), 'utf8');
  const r = failedNames(run());
  writeFileSync(m.file, original, 'utf8');

  const hit = r.names.filter((n) => n.includes(m.expect));
  const verdict =
    !r.parsed || r.total !== base.total
      ? `⛔ KHÔNG ĐỌC ĐƯỢC KẾT QUẢ (parsed=${r.parsed} total=${r.total}, kỳ vọng ${base.total}) — nhiều khả năng đột biến gây lỗi cú pháp; KHÔNG được đọc là "xanh"`
      : r.failed === 0
      ? '⛔ XANH — đột biến KHÔNG bị bắt'
      : hit.length > 0
        ? `✅ ĐỎ đúng ca (${r.failed} ca đỏ, ${hit.length} khớp kỳ vọng)`
        : `⚠ ĐỎ nhưng KHÁC ca kỳ vọng (${r.failed} ca)`;
  rows.push({ ...m, verdict, failed: r.failed, names: r.names });
}

console.log('\n=== KẾT QUẢ ===');
for (const r of rows) {
  console.log(`\n${r.id} — ${r.what}`);
  console.log(`   ${r.verdict}`);
  for (const n of r.names.slice(0, 6)) console.log(`     · ${n}`);
}
