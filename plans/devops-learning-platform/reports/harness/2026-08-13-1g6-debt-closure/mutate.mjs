/**
 * Kiểm đột biến cho 1.G-6 R1 + R2.
 *
 * Chạy TỪ `packages/terminal`:  node ../../plans/.../mutate.mjs
 * (đường dẫn tương đối tới repo root được tự dò bằng `git rev-parse`.)
 *
 * ⛔ BÀI HỌC TỪ 1.G-5, ĐÃ MÃ HOÁ VÀO ĐÂY: bộ kiểm đột biến của chặng đó có lỗi
 * cùng họ với thứ nó đi tìm — một đột biến làm vitest chết TRƯỚC khi in báo cáo,
 * script đọc `failed = 0` rồi kết luận "đột biến không bị bắt". Tức nó không
 * phân biệt "đã chạy và qua" với "chưa chạy được".
 *
 * Nên ở đây một đột biến chỉ được tính là BỊ BẮT khi thoả CẢ HAI:
 *   (a) vitest thoát khác 0, VÀ
 *   (b) tên ca kỳ vọng XUẤT HIỆN trong danh sách ca đỏ.
 * Thoát khác 0 mà không thấy tên ca ⇒ báo "ĐỎ SAI LÝ DO" chứ không tính là bắt.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const CORE = path.join(repoRoot, 'packages/terminal/src/terminal-core.ts');
const pkgDir = path.join(repoRoot, 'packages/terminal');

/** @type {{id:string, why:string, project:string, expect:string, edits:[string,string][]}[]} */
const MUTATIONS = [
  {
    id: 'M1',
    why: 'đưa `new WebglAddon()` RA NGOÀI khối try — chính là trạng thái trước bản vá Q5 của 1.G-5',
    project: 'safari15',
    expect: 'KHÔNG ném',
    edits: [
      ['let webgl: WebglAddon | null = null;\n  try {', 'let webgl: WebglAddon | null = new WebglAddon();\n  try {'],
      ['webgl = new WebglAddon();\n    terminal.loadAddon(webgl);', 'terminal.loadAddon(webgl);'],
    ],
  },
  {
    id: 'M2',
    why: 'nuốt `console.warn` ở nhánh catch — fallback vẫn chạy nhưng im lặng',
    project: 'safari15',
    expect: 'có console.warn fallback',
    edits: [
      [
        "console.warn('[dlp-terminal] không khởi tạo được WebGL, dùng DOM renderer:', error);",
        'void error;',
      ],
    ],
  },
  {
    id: 'M3',
    why: 'đổi thông điệp fallback — test đọc theo tiền tố nên phải đỏ',
    project: 'safari15',
    expect: 'có console.warn fallback',
    edits: [
      ["'[dlp-terminal] không khởi tạo được WebGL, dùng DOM renderer:'", "'[dlp-terminal] webgl khong san sang:'"],
    ],
  },
  {
    id: 'M4',
    why: 'chuyển `terminal.open()` xuống SAU khối try ⇒ activate bị hoãn ra ngoài try (đúng lỗi R2 gác)',
    project: 'gpu-on',
    expect: 'activate() thấy `terminal.element` ĐÃ tồn tại',
    edits: [
      ['  terminal.open(options.container);\n\n  // F2 —', '  // F2 —'],
      [
        '  const searchAddon = new SearchAddon();',
        '  terminal.open(options.container);\n\n  const searchAddon = new SearchAddon();',
      ],
    ],
  },
  {
    id: 'M5',
    why: 'ĐỐI CHỨNG DƯƠNG — không đột biến gì; bộ này phải XANH, nếu không thì mọi kết luận trên đều vô nghĩa',
    project: 'safari15',
    expect: null,
    edits: [],
  },
];

/**
 * `original` giữ nguyên BYTE để phục hồi chính xác; `normalized` là bản đã quy
 * về `\n` để so khớp.
 *
 * ⛔ Không có bước quy chuẩn này thì mọi đột biến có anchor NHIỀU DÒNG đều trượt
 * trên Windows (file CRLF, anchor viết `\n`) — và bộ kiểm sẽ báo "không tìm thấy
 * đoạn cần đột biến" cho đúng những đột biến quan trọng nhất, trong khi các đột
 * biến một dòng vẫn chạy nên tổng thể trông như vẫn hoạt động. Đã dính đúng lỗi
 * này ở lượt chạy đầu 2026-08-13 (M1, M4 trượt; M2, M3 chạy).
 */
const original = readFileSync(CORE, 'utf8');
const normalized = original.replace(/\r\n/g, '\n');
const results = [];

for (const m of MUTATIONS) {
  let src = normalized;
  let applied = true;
  for (const [find, replace] of m.edits) {
    if (!src.includes(find)) {
      applied = false;
      break;
    }
    src = src.replace(find, replace);
  }

  if (!applied) {
    // ⛔ Một đột biến KHÔNG áp được là lỗi của bộ kiểm, không phải bằng chứng
    // về code. Bản 1.G-5 sẽ im lặng chạy tiếp và đếm nó là "bị bắt".
    results.push({ id: m.id, verdict: 'LỖI BỘ KIỂM', detail: 'không tìm thấy đoạn cần đột biến' });
    continue;
  }

  writeFileSync(CORE, src);
  const run = spawnSync('npx', ['vitest', 'run', '--project', m.project, '--reporter=verbose'], {
    cwd: pkgDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  writeFileSync(CORE, original);

  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const ranAtAll = /Test Files\s+\d+|Tests\s+\d+/.test(out);
  const exitNonZero = run.status !== 0;
  const namedFailure = m.expect === null ? false : out.includes(m.expect);

  let verdict;
  let detail;
  if (m.expect === null) {
    verdict = !exitNonZero && ranAtAll ? 'ĐỐI CHỨNG XANH' : 'ĐỐI CHỨNG HỎNG';
    detail = `exit=${run.status}, có báo cáo=${ranAtAll}`;
  } else if (!ranAtAll) {
    verdict = 'ĐỎ SAI LÝ DO';
    detail = 'vitest không in được báo cáo — chết trước khi chạy ca nào';
  } else if (exitNonZero && namedFailure) {
    verdict = 'BỊ BẮT';
    detail = `ca đỏ đúng như kỳ vọng: "${m.expect}"`;
  } else if (exitNonZero) {
    verdict = 'ĐỎ SAI LÝ DO';
    detail = `đỏ nhưng KHÔNG thấy ca "${m.expect}" trong output`;
  } else {
    verdict = 'THOÁT LƯỚI';
    detail = 'suite vẫn xanh dù code đã bị đột biến';
  }

  results.push({ id: m.id, verdict, detail, why: m.why, project: m.project });
}

const width = 14;
console.log('\n=== KIỂM ĐỘT BIẾN 1.G-6 (R1 + R2) ===\n');
for (const r of results) {
  console.log(`${r.id}  ${String(r.verdict).padEnd(width)} [${r.project ?? '-'}]  ${r.why ?? ''}`);
  console.log(`    ${r.detail}`);
}
const caught = results.filter((r) => r.verdict === 'BỊ BẮT').length;
const control = results.filter((r) => r.verdict === 'ĐỐI CHỨNG XANH').length;
const bad = results.filter((r) => !['BỊ BẮT', 'ĐỐI CHỨNG XANH'].includes(r.verdict));
console.log(`\nBị bắt: ${caught}/${results.length - 1} · đối chứng dương: ${control}/1`);
if (bad.length > 0) {
  console.log(`⛔ CÓ VẤN ĐỀ: ${bad.map((b) => `${b.id}=${b.verdict}`).join(', ')}`);
  process.exit(1);
}
console.log('Tất cả đột biến bị bắt, và bộ kiểm tự chứng minh nó chạy được.');
