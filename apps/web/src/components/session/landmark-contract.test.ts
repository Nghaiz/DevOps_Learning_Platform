import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * C6bis — vỏ ứng dụng dựng ĐÚNG MỘT `<main>`, không trang nào dựng cái thứ hai.
 *
 * Mức test: STATIC — quét mã nguồn, cùng cách `security/rule-08-no-token-in-url.test.ts`
 * làm.
 *
 * ⚠ Lý do đã ĐỔI, kết luận thì không. Trước 2026-09-08 lý do là "`apps/web`
 * không có jsdom/RTL nên không render nổi cây component"; nay jsdom + RTL đã có
 * và bật được per-file bằng docblock `@vitest-environment` (xem
 * `vitest.config.ts`). Nhưng phép kiểm này VẪN phải static, vì mệnh đề nó gác
 * là "KHÔNG route nào trong repo dựng cái `<main>` thứ hai" — một mệnh đề về
 * TOÀN BỘ cây mã, không phải về một component. Render từng route để đếm thì
 * phải dựng được mọi provider, mọi query, mọi lớp server của từng trang; và một
 * route mới quên thêm vào danh sách render sẽ lọt qua trong im lặng — đúng lỗ
 * hổng mà bản static không có.
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

  /**
   * Đọc MỘT lượt cho cả ba phép kiểm, ở thân `describe` (pha thu thập) chứ không
   * trong thân `it`.
   *
   * Không phải tối ưu: quét 89 file `.tsx` bằng `readFileSync` mất 5136ms khi
   * turbo chạy năm gói song song trên Windows, vượt `testTimeout` mặc định
   * 5000ms ⇒ đỏ vì tranh I/O, không phải vì hợp đồng bị vi phạm. Nâng timeout
   * chỉ giấu triệu chứng và làm mất luôn khả năng bắt một test treo thật.
   * Chuyển sang pha thu thập thì cả ba `it` chỉ còn khẳng định trên dữ liệu đã
   * có trong bộ nhớ. Xem [[turbo-parallel-load-times-out-io-tests]].
   */
  const sources = collectSourceFiles(srcRoot).map((file) => ({
    relative: path.relative(srcRoot, file),
    isShell: file.endsWith(SHELL_OWNER),
    mainOpenTags: countMainOpenTags(readFileSync(file, 'utf8')),
  }));

  it('quét được một số lượng file .tsx đáng kể (đối chứng: grep không chạy trên tập rỗng)', () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it('vỏ ứng dụng VẪN dựng <main> (đối chứng dương — nếu mất, cả trang không còn landmark nào)', () => {
    const shell = sources.find((source) => source.isShell);
    expect(shell, `không tìm thấy ${SHELL_OWNER}`).toBeDefined();
    expect(shell?.mainOpenTags).toBe(1);
  });

  it('không file nào NGOÀI vỏ dựng <main> của riêng nó', () => {
    const offenders = sources
      .filter((source) => !source.isShell && source.mainOpenTags > 0)
      .map((source) => source.relative);
    expect(offenders).toEqual([]);
  });
});
