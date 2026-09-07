/**
 * Ba phép biến đổi JSON cho `paced-run.sh`.
 *
 * VÌ SAO LÀ FILE RIÊNG chứ không phải `node -e '…'` nhúng trong bash: mã bên
 * trong `node -e` nằm trong một chuỗi bash, nên mọi backslash đi qua HAI lớp
 * escape (bash rồi JavaScript). Một regex như `/[.*+?^${}()|[\]\\]/g` viết đúng
 * ở file này trở thành thứ không đọc nổi khi nhúng, và sai một backslash thì nó
 * vẫn CHẠY — chỉ là escape sai, khớp sai, rồi mẻ chạy sai số test.
 *
 * Không phải giả thuyết: chính lượt tạo file này đã mất cặp `\\` khi đi qua một
 * heredoc, và eslint bắt được bằng `Unterminated regular expression literal` —
 * ở một chỗ mà con mắt đọc lướt thấy hoàn toàn bình thường.
 *
 * `readFileSync` + `JSON.parse` chứ không `require(file)`: `require` cache theo
 * đường dẫn, và `results.json` bị GHI ĐÈ sau mỗi mẻ. Trong tiến trình này thì
 * mỗi mẻ là một tiến trình node mới nên cache chưa cắn được — nhưng một hàm
 * đọc-lại-file mà im lặng trả bản cũ là thứ không nên để sẵn trong mã.
 */
import fs from 'node:fs';

/** Duyệt cây suite của reporter json; Playwright lồng suite nhiều tầng. */
function walkSpecs(suites, visit) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) visit(spec);
    walkSpecs(suite.suites, visit);
  }
}

function readReport(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const [, , mode, file] = process.argv;

if (mode === 'titles') {
  const titles = [];
  walkSpecs(readReport(file).suites, (spec) => titles.push(spec.title));

  if (titles.length === 0) {
    console.error('0 test — đường spec sai?');
    process.exit(3);
  }

  // Hai test cùng tiêu đề KHÔNG tách được bằng `--grep`: mẻ nào chứa một cái sẽ
  // kéo theo cái kia, và số đếm lệch ở một mẻ khác. Đỏ ngay ở đây, với tên cụ
  // thể, thay vì để cổng đếm bắn một thông báo chung chung ở cuối.
  const dup = [...new Set(titles.filter((t, i) => titles.indexOf(t) !== i))];
  if (dup.length > 0) {
    console.error(`tiêu đề trùng nhau, không chia mẻ được:\n  ${dup.join('\n  ')}`);
    process.exit(3);
  }

  process.stdout.write(`${titles.join('\n')}\n`);
} else if (mode === 'regex') {
  const titles = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Neo ĐUÔI (`$`), không neo đầu: `--grep` đối chiếu với tiêu đề ĐẦY ĐỦ (tên
  // file + describe + test), nên `^` sẽ không khớp gì cả.
  process.stdout.write(`(?:${titles.map(esc).join('|')})$`);
} else if (mode === 'count') {
  let n = 0;
  try {
    walkSpecs(readReport(file).suites, (spec) => {
      n += (spec.tests ?? []).length;
    });
  } catch {
    // Báo cáo thiếu/hỏng ⇒ 0, và cổng đếm ở bash sẽ đỏ. Nuốt lỗi ở đây là đúng:
    // "không đọc được báo cáo" và "chạy 0 test" dẫn tới cùng một kết luận — mẻ
    // này không chứng minh được gì.
    n = 0;
  }
  process.stdout.write(String(n));
} else {
  console.error(`mode lạ: ${mode} (titles | regex | count)`);
  process.exit(3);
}
