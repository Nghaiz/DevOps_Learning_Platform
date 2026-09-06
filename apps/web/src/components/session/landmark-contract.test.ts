import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * C6bis — vỏ ứng dụng dựng ĐÚNG MỘT `<main>`, không trang nào dựng cái thứ hai.
 *
 * Mức test: STATIC. `apps/web` chạy vitest ở `environment: 'node'` (không jsdom,
 * không RTL), nên không render nổi cây component để đếm landmark. Thay vào đó
 * quét mã nguồn — cùng cách `security/rule-08-no-token-in-url.test.ts` làm.
 *
 * Vì sao cần một phép kiểm chứ không chỉ một lệnh grep trong report: đây là một
 * va chạm ĐÃ xảy ra một lần (lane B và lane C đọc hiện trạng ở hai thời điểm
 * khác nhau rồi đi tới hai kết luận ngược nhau, xem chú thích đầu
 * `components/shell/app-shell.tsx`). Hai `<main>` lồng nhau vừa sai HTML vừa làm
 * axe của 13.H đỏ `landmark-unique` — tức một ô AC của 13.H đỏ vì việc của lane
 * khác. Một lane mới thêm route sẽ không đọc chú thích đó; nó sẽ chạy `pnpm test`.
 *
 * ⚠ Vị trí file: hợp đồng thuộc về `components/shell/`, nhưng lượt dọn nợ này
 * chỉ sở hữu `components/shell/capacity.ts`. Đặt tạm ở đây (khung phiên dùng
 * chung — nơi ba route có terminal cùng đi qua); lead có thể dời sang
 * `components/shell/` khi lane vỏ mở lại.
 */

/** Nơi DUY NHẤT được phép dựng `<main>`. Đường dẫn tương đối tới `apps/web/src`. */
const SHELL_OWNER = path.join('components', 'shell', 'app-shell.tsx');

const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo']);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
    } else if (entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Bỏ chú thích trước khi đếm.
 *
 * Bắt buộc, không phải làm đẹp: chính chú thích của hợp đồng (ở `app-shell.tsx`,
 * `catalog-page.tsx`, `app/page.tsx`, và file này) có chuỗi `<main>` trong prose.
 * Đếm thô sẽ báo vi phạm ở đúng những file viết ra luật — một phép kiểm luôn đỏ
 * là một phép kiểm sẽ bị tắt.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Số lần file thật sự MỞ một phần tử `<main>` (không tính `</main>`). */
function countMainOpenTags(source: string): number {
  return (stripComments(source).match(/<main[\s>]/g) ?? []).length;
}

describe('C6bis — đúng một landmark <main> trong toàn app', () => {
  const srcRoot = path.resolve(import.meta.dirname, '..', '..');
  const files = collectSourceFiles(srcRoot);

  it('quét được một số lượng file .tsx đáng kể (đối chứng: grep không chạy trên tập rỗng)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('vỏ ứng dụng VẪN dựng <main> (đối chứng dương — nếu mất, cả trang không còn landmark nào)', () => {
    const shell = files.find((file) => file.endsWith(SHELL_OWNER));
    expect(shell, `không tìm thấy ${SHELL_OWNER}`).toBeDefined();
    expect(countMainOpenTags(readFileSync(shell as string, 'utf8'))).toBe(1);
  });

  it('không file nào NGOÀI vỏ dựng <main> của riêng nó', () => {
    const offenders = files
      .filter((file) => !file.endsWith(SHELL_OWNER))
      .filter((file) => countMainOpenTags(readFileSync(file, 'utf8')) > 0)
      .map((file) => path.relative(srcRoot, file));
    expect(offenders).toEqual([]);
  });
});
