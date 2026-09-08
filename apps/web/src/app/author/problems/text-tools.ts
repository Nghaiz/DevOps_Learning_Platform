/**
 * Ba phép biến đổi chuỗi mà trình soạn bài dùng ở nhiều chỗ: sinh slug, chuẩn
 * hoá tag, đếm từ đề bài.
 */

/**
 * Trần cứng của `Problem.statement` — 150 từ, ghi trong hợp đồng
 * (`k8s/problem.ts`) và gác lại lần nữa ở `problems.publish`.
 *
 * Con số không phải để làm khó: bản `Level` cũ để trôi tới trung bình 189 từ
 * brief cộng 193 từ primer, và chủ dự án chê thẳng là quá dài. Một bài OJ không
 * dạy nên nó chỉ cần nói ĐỀ.
 */
export const STATEMENT_WORD_LIMIT = 150;

/**
 * Đếm từ theo ĐÚNG công thức mà cổng gác dùng — cắt theo khoảng trắng, bỏ phần
 * rỗng (`levels.test.ts:78`).
 *
 * ⚠ Công thức đó sống trong một FILE TEST của package khác, nên không import
 * được. Chép lại là chuyện bắt buộc, nhưng nó có tải: nếu cổng đổi cách đếm (bỏ
 * khối code khỏi phép đếm chẳng hạn) mà đây không đổi, bộ đếm sẽ nói "142 từ" ở
 * trang soạn rồi `publish` trả về "vượt 150 từ" — người soạn không có cách nào
 * hiểu vì sao. Đã báo lead xin xuất một hàm đếm dùng chung.
 */
export function countWords(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 0;
  }
  return trimmed.split(/\s+/u).filter(Boolean).length;
}

/**
 * Bỏ dấu tiếng Việt rồi rút về `a-z0-9-`.
 *
 * Hai chi tiết dễ làm sai:
 *
 * - `\p{M}` (mọi dấu phụ) chứ không phải một dải ký tự viết thẳng vào mã. Dải
 *   viết thẳng đọc ra một ô vuông trong hầu hết trình soạn thảo, và bất kỳ công
 *   cụ nào chuẩn hoá file cũng có thể nuốt nó mà không ai thấy.
 * - `đ`/`Đ` phải xử lý RIÊNG: nó không phải `d` cộng dấu phụ, nên `NFD` không
 *   tách được gì và lớp lọc phía sau sẽ ăn mất ký tự — `đội` ra `oi` thay vì
 *   `doi`. Đây là bẫy kinh điển của mọi hàm slug tiếng Việt viết vội.
 */
export function toSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

/** Slug hợp lệ theo đúng biểu thức mà `problems.publish` gác ở máy chủ. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** Một tag đã chuẩn hoá: thường, không dấu, gạch nối. Cùng phép biến đổi với slug. */
export function normalizeTag(value: string): string {
  return toSlug(value);
}

/**
 * Ô tag là một dòng tự do ngăn bằng dấu phẩy. Trả về danh sách đã chuẩn hoá, bỏ
 * rỗng và bỏ trùng — giữ thứ tự người soạn gõ, vì thứ tự đó là chủ ý của họ và
 * sắp lại chỉ làm ô nhảy lung tung dưới tay.
 */
export function parseTags(value: string): readonly string[] {
  const out: string[] = [];
  for (const raw of value.split(',')) {
    const tag = normalizeTag(raw);
    if (tag !== '' && !out.includes(tag)) {
      out.push(tag);
    }
  }
  return out;
}

/**
 * `k=v` mỗi dòng → map. Dòng không có `=` bị bỏ qua thay vì báo lỗi: ô này là
 * chỗ người ta dán vào, và một dòng trống hay một dòng ghi chú không đáng chặn
 * cả lượt lưu.
 */
export function parseKeyValueLines(value: string): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const line of value.split('\n')) {
    const index = line.indexOf('=');
    if (index > 0) {
      const key = line.slice(0, index).trim();
      if (key !== '') {
        out[key] = line.slice(index + 1).trim();
      }
    }
  }
  return out;
}

export function formatKeyValueLines(map: Readonly<Record<string, string>> | undefined): string {
  if (map === undefined) {
    return '';
  }
  return Object.entries(map)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

/** Danh sách ngăn bằng dòng hoặc dấu phẩy → mảng đã bỏ rỗng, bỏ trùng, giữ nguyên chữ. */
export function parseList(value: string): readonly string[] {
  const out: string[] = [];
  for (const raw of value.split(/[\n,]/u)) {
    const item = raw.trim();
    if (item !== '' && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}
