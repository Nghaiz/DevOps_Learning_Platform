/**
 * In mọi `annotations` từ các `results-*.json` mà `paced-run.sh` giữ lại.
 *
 * VÌ SAO CẦN: bốn luồng `@flow` tự ghi annotation `chua-do` khi dữ liệu trên cụm
 * không có điều kiện để chạy một nhánh — lab không bật leaderboard, lộ trình
 * không có phần nào còn khoá, quiz không có câu nào kèm giải thích, không phiên
 * nào đang sống lúc chạy. Test vẫn XANH, và đúng là nên xanh: nhánh đó không tồn
 * tại để mà hỏng. Nhưng một lượt "6/6 xanh" không phân biệt được với một lượt
 * "6/6 xanh, bốn nhánh chưa ai chạm tới" nếu không ai đọc annotation.
 *
 * Reporter `list` KHÔNG in annotation, và `results.json` bị ghi đè mỗi mẻ — nên
 * cả hai đường đọc mặc định đều làm mất chúng.
 *
 *   node apps/web/e2e/scripts/read-annotations.mjs [thư-mục]
 *
 * Mặc định đọc `apps/web/e2e/.artifacts/paced-batches`.
 * Mã thoát 0 luôn: đây là công cụ ĐỌC, không phải cổng.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2] ?? path.join(HERE, '..', '.artifacts', 'paced-batches');

if (!fs.existsSync(dir)) {
  console.error(`không có thư mục ${dir} — chạy paced-run.sh trước.`);
  process.exit(0);
}

function walk(suites, visit) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) visit(spec);
    walk(suite.suites, visit);
  }
}

const files = fs
  .readdirSync(dir)
  .filter((f) => /^results-\d+\.json$/.test(f))
  .sort((a, b) => Number(/\d+/.exec(a)?.[0] ?? 0) - Number(/\d+/.exec(b)?.[0] ?? 0));

if (files.length === 0) {
  console.error(`không có results-*.json trong ${dir}.`);
  process.exit(0);
}

let total = 0;
let annotated = 0;

for (const file of files) {
  const report = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  walk(report.suites, (spec) => {
    total += 1;
    for (const test of spec.tests ?? []) {
      for (const result of test.results ?? []) {
        for (const a of result.annotations ?? []) {
          annotated += 1;
          console.log(`\n[${a.type}] ${spec.title}`);
          console.log(`  ${a.description ?? ''}`);
        }
      }
    }
  });
}

console.log(
  `\n— ${String(annotated)} annotation trên ${String(total)} test (${String(files.length)} mẻ).`,
);
if (annotated === 0) {
  console.log('  Không nhánh nào tự khai "chưa đo" ở lượt này.');
}
