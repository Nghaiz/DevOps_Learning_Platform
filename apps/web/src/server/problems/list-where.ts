import {
  arrayContains,
  arrayOverlaps,
  gt,
  ilike,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { ProblemFilter, ProblemOrderKey } from '@devops-platform/games';
import { problems } from '../db/schema';
import type { ProblemCursor } from './cursor';

/**
 * Bộ lọc → các mệnh đề WHERE.
 *
 * ⚠ Chủ đề là HOẶC, tag là VÀ, và hợp đồng nói rõ đó là CỐ Ý khác nhau. Lý do
 * đứng vững khi đọc từ phía người dùng: chọn hai chủ đề nghĩa là "cho tôi xem cả
 * mạng lẫn lưu trữ" — thu hẹp thì vô dụng, rất ít bài dạy cả hai cùng lúc. Còn
 * chọn hai tag nghĩa là "bài vừa có `initcontainer` vừa có `readiness`" — nới
 * rộng thì tag mất hết tác dụng lọc.
 *
 * `&&` (overlap) và `@>` (contains) là hai toán tử mảng của Postgres, cả hai
 * dùng được chỉ mục GIN đã dựng trên hai cột — xem chú thích cột `topics` trong
 * `schema.ts` về việc vì sao chúng là `text[]` chứ không phải `jsonb`.
 */
export function filterWhere(filter: ProblemFilter | undefined): readonly SQL[] {
  if (filter === undefined) {
    return [];
  }
  const clauses: SQL[] = [];

  if (filter.difficulty !== undefined && filter.difficulty.length > 0) {
    clauses.push(inArray(problems.difficulty, [...filter.difficulty]));
  }
  if (filter.topics !== undefined && filter.topics.length > 0) {
    clauses.push(arrayOverlaps(problems.topics, [...filter.topics]));
  }
  if (filter.tags !== undefined && filter.tags.length > 0) {
    clauses.push(arrayContains(problems.tags, [...filter.tags]));
  }

  const query = filter.query?.trim();
  if (query !== undefined && query !== '') {
    // Hợp đồng: tìm trong `code` và `title`, KHÔNG tìm trong `statement`. Đề bài
    // là markdown dài; một `ILIKE '%…%'` trên nó vừa không dùng được chỉ mục nào
    // vừa trả về những kết quả không giải thích được cho người dùng.
    //
    // ⚠ Hạn chế phải biết: `ILIKE` gập hoa-thường bằng `lower()`, và phép gập đó
    // phụ thuộc collation của server. Image Postgres alpine của repo chạy musl
    // không có locale nên rơi về quy tắc C — chữ hoa CÓ DẤU tiếng Việt không
    // gập được về chữ thường. ASCII (`code`, phần lớn thuật ngữ hạ tầng) thì
    // đúng. Sửa cho tử tế cần `citext` hoặc một collation ICU — quyết định hạ
    // tầng, không phải một dòng ở đây.
    const pattern = `%${escapeLike(query)}%`;
    clauses.push(or(ilike(problems.code, pattern), ilike(problems.title, pattern)) as SQL);
  }

  return clauses;
}

/**
 * `%` và `_` là ký tự đại diện của `LIKE`; `\` là ký tự thoát mặc định.
 *
 * Không thoát thì một người gõ `100%` vào ô tìm kiếm nhận về MỌI bài — không
 * lỗi, không dấu hiệu, chỉ là một kết quả vô nghĩa. Đây KHÔNG phải chống SQL
 * injection (tham số đã bind); nó là chuyện đúng nghĩa của phép tìm.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Mệnh đề "đứng SAU con trỏ" theo cặp `(khoá, code)`.
 *
 * ⛔ Vế `code` KHÔNG bỏ được. `problem.ts` viết rõ: `code` là khoá duy nhất DUY
 * NHẤT theo từng dòng, nên với mọi khoá khác, hai bài trùng giá trị khoá sẽ làm
 * con trỏ nhảy cóc — trang sau bắt đầu sau TOÀN BỘ nhóm trùng thay vì sau đúng
 * dòng cuối đã trả. Không lỗi, không cảnh báo, chỉ là dữ liệu biến mất.
 *
 * Viết dạng tường minh `a > v OR (a = v AND code > c)` chứ không dùng cú pháp bộ
 * `(a, code) > (v, c)`: bộ so sánh của Postgres đúng, nhưng Drizzle chỉ dựng
 * được nó qua `sql` thô, và khi đó `sortExpr` mất kiểu — mà `sortExpr` chính là
 * chỗ dễ sai nhất vì nó có thể là một cột hoặc một biểu thức `coalesce` trên
 * truy vấn con.
 *
 * `sortExpr` PHẢI đã được bọc thành `SQL` bởi chỗ gọi (`sortExpression` trong
 * `list.ts`), để cả bốn khoá đi qua đúng một nhánh kiểu.
 */
export function afterCursorWhere(
  orderBy: ProblemOrderKey,
  direction: 'asc' | 'desc',
  sortExpr: SQL,
  cursor: ProblemCursor,
): SQL {
  const beyond = direction === 'asc' ? gt : lt;
  if (orderBy === 'code' || cursor.sortValue === null) {
    return beyond(problems.code, cursor.code);
  }
  // `createdAt` mã hoá epoch ms; cột là `timestamptz precision 3` nên `Date`
  // dựng lại từ ms khớp CHÍNH XÁC giá trị đã lưu — xem chú thích `precision: 3`
  // ở `schema.ts` về việc vì sao độ chính xác micro giây sẽ làm dòng bị LẶP.
  const value =
    orderBy === 'createdAt' && typeof cursor.sortValue === 'number'
      ? new Date(cursor.sortValue)
      : cursor.sortValue;
  return or(
    beyond(sortExpr, value),
    sql`(${sortExpr}) = ${value} and ${beyond(problems.code, cursor.code)}`,
  ) as SQL;
}
