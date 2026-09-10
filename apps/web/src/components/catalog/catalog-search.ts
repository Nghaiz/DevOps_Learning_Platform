/**
 * Tìm kiếm trong trang danh mục (16.C) — **trong trang**, không phải toàn kho.
 *
 * ## Giới hạn này là CÓ THẬT, và nó quyết định toàn bộ câu chữ ở đây
 *
 * Không một procedure danh mục nào nhận tham số tìm kiếm. Đo lại trên chính mã
 * đang chạy, không đọc từ trí nhớ:
 *
 * - `lessons.list` / `labs.list` mở rộng `listInputSchema` bằng đúng bốn khoá
 *   `difficulty`, `tier`, `capability`, `orderBy` (`server/trpc/routers/*.ts`).
 * - `playgrounds.list` mở rộng bằng `tier` (và `difficulty` bị bỏ qua).
 * - `paths.list` và `quiz.list` nhận nguyên `listInputSchema`, tức chỉ `limit` +
 *   `cursor`.
 * - `listInputSchema` là `.strict()` (`server/trpc/init.ts:219`), nên gửi thêm
 *   một khoá `q` sẽ nhận `400 unrecognized_keys` chứ không phải một danh sách
 *   đã lọc.
 *
 * Nên ô tìm ở đây lọc trên **đúng những mục server đã trả về trang này**, y hệt
 * ràng buộc mà `catalog-sort.ts` đã sống chung từ 13.C. Hệ quả phải NÓI RA:
 * gõ một từ khoá rồi thấy "không có gì" KHÔNG có nghĩa là kho không có — nó có
 * thể nằm ở trang sau. `describeSearchScope` là câu đó, và
 * `describeCatalogEmpty` có một nhánh riêng cho ca này thay vì để người đọc rơi
 * vào nhánh "kho rỗng".
 *
 * ⛔ Đừng "sửa" bằng cách tải hết mọi trang rồi tìm ở client. Đó là bỏ phân
 * trang, và nó hỏng đúng lúc kho đủ lớn để việc tìm kiếm bắt đầu có nghĩa.
 * Đường đúng là một tham số tìm kiếm ở server, và nó nằm ngoài phạm vi P16
 * (đợt này chỉ frontend).
 */

/**
 * Dấu thanh và dấu mũ tiếng Việt sau khi tách bằng NFD.
 *
 * Khoảng U+0300..U+036F là khối "Combining Diacritical Marks", đủ cho toàn bộ
 * tiếng Việt: mỗi chữ có dấu của bảng chữ cái Việt đều tách được thành một chữ
 * cái Latin cộng một hoặc hai dấu trong khối này (`ế` = `e` + U+0302 + U+0301).
 *
 * ⚠ Viết bằng ESCAPE `\u0300-\u036f`, KHÔNG gõ thẳng hai ký tự dấu vào lớp ký
 * tự. Một dấu kết hợp gõ thẳng trong mã nguồn là một ký tự KHÔNG NHÌN THẤY
 * ĐƯỢC: nó bám vào ký tự trước nó (ở đây là `[`), nên editor hiện ra một cái
 * gì đó không phải thứ đang chạy, và một lượt chuẩn hoá dòng hay một lần chép
 * qua công cụ khác có thể nuốt nó mà không dòng nào đỏ.
 */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * `đ` KHÔNG tách được bằng NFD, và đây là chỗ mọi bản "bỏ dấu tiếng Việt" viết
 * vội sai.
 *
 * U+0111 (đ) và U+0110 (Đ) là ký tự Latin ĐỘC LẬP trong Unicode, không phải
 * `d` cộng một dấu gạch — chúng không có phân rã chính tắc, nên `normalize('NFD')`
 * trả lại chính chúng. Bỏ dòng này thì gõ "docker" không tìm ra "Đóng gói",
 * và tệ hơn: gõ "dong" không tìm ra "đóng" trong khi gõ "đong" thì ra — một ô
 * tìm chỉ hoạt động cho người đã gõ được dấu, tức đúng nhóm ít cần nó nhất.
 *
 * Đối chứng nằm ở `catalog-search.test.ts`: một ca khẳng định `'Đ'` và `'đ'`
 * cùng gập về `'d'`, và một ca khẳng định `normalize('NFD')` một mình KHÔNG làm
 * được việc đó.
 */
const D_STROKE = /[đĐ]/g;

/**
 * Gập một chuỗi về dạng so khớp: thường hoá, bỏ dấu, `đ` thành `d`.
 *
 * Thứ tự có ý nghĩa: `toLowerCase()` chạy TRƯỚC `NFD` để `Đ` thành `đ` rồi mới
 * thành `d` bằng đúng một luật, thay vì phải kể cả hai chữ hoa lẫn chữ thường ở
 * mỗi bước sau.
 */
export function foldSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(D_STROKE, 'd');
}

/**
 * Chuẩn hoá từ khoá người dùng gõ: cắt khoảng trắng hai đầu, gộp khoảng trắng
 * giữa các từ về một dấu cách, rồi gập.
 *
 * Gộp khoảng trắng là thứ phân biệt một ô tìm dùng được với một ô tìm bắt người
 * ta gõ chính xác: `"pod   treo"` và `"pod treo"` phải ra cùng kết quả, và người
 * dán một đoạn từ tài liệu khác thường mang theo khoảng trắng thừa.
 *
 * Trả về chuỗi RỖNG khi không có gì để tìm — nơi gọi kiểm `=== ''` chứ không
 * kiểm `.trim()` lần nữa.
 */
export function normalizeSearchQuery(raw: string): string {
  return foldSearchText(raw).replace(/\s+/g, ' ').trim();
}

/**
 * Một mục có khớp từ khoá không.
 *
 * `fields` là những chuỗi của mục mà ô tìm được phép soi. Nơi gọi quyết định
 * tập đó, và nó phải là những thứ NGƯỜI DÙNG NHÌN THẤY trên thẻ — tìm trúng một
 * trường không hiện ra đâu cả thì kết quả trả về đọc như một lỗi.
 *
 * `null`/`undefined` bị bỏ qua chứ không bị nối thành chuỗi `"null"`: mô tả của
 * một mục có thể vắng (`description: string | null` ở cả năm procedure), và
 * `${null}` trong template literal cho ra bốn chữ cái mà người dùng gõ được.
 *
 * Từ khoá nhiều từ khớp theo kiểu VÀ: `"pod treo"` đòi mục chứa cả `pod` lẫn
 * `treo`, ở bất kỳ trường nào trong `fields`, không nhất thiết cạnh nhau. Đó là
 * cách một ô tìm thu hẹp dần khi gõ thêm — luật HOẶC sẽ MỞ RỘNG kết quả mỗi lần
 * gõ thêm một từ, thứ ngược hẳn với thứ người ta chờ đợi.
 */
export function matchesSearchQuery(
  fields: readonly (string | null | undefined)[],
  normalizedQuery: string,
): boolean {
  if (normalizedQuery === '') {
    return true;
  }

  const haystack = fields
    .filter((field): field is string => typeof field === 'string')
    .map(foldSearchText)
    .join(' ');

  return normalizedQuery.split(' ').every((word) => haystack.includes(word));
}

/**
 * Lọc một trang theo từ khoá. KHÔNG sửa mảng gốc.
 *
 * Cùng lý do như `sortPage`: mảng gốc là `query.data.items` do TanStack Query
 * giữ trong cache, dùng chung với mọi component khác đọc cùng key.
 *
 * Từ khoá rỗng trả về **chính mảng đầu vào** (không phải một bản sao): đó là
 * đường đi thường gặp nhất, và một mảng mới mỗi lượt render sẽ phá `useMemo` ở
 * mọi chỗ gọi phía dưới.
 */
export function searchPage<T>(
  items: readonly T[],
  normalizedQuery: string,
  fieldsOf: (item: T) => readonly (string | null | undefined)[],
): readonly T[] {
  if (normalizedQuery === '') {
    return items;
  }
  return items.filter((item) => matchesSearchQuery(fieldsOf(item), normalizedQuery));
}
