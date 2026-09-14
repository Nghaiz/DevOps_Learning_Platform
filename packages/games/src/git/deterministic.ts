/**
 * Phép lặp TẤT ĐỊNH trên bản ghi.
 *
 * ⛔ MỌI chỗ trong `git/` lặp trên một `Record` PHẢI đi qua đây. Không
 * `Object.keys(x)` trần, không `for...in`, không `Object.entries(x)` trần.
 *
 * VÌ SAO — và vì sao `Object.keys` "có vẻ" đã đủ
 * ---------------------------------------------
 * Người ta hay tin rằng `Object.keys` của JS đã tất định vì spec ghim thứ tự:
 * khoá dạng số nguyên tăng dần trước, rồi khoá chuỗi theo thứ tự CHÈN. Vế thứ
 * hai chính là cái bẫy. `{ 'src/b.ts': …, 'src/a.ts': … }` và
 * `{ 'src/a.ts': …, 'src/b.ts': … }` mang **cùng một nội dung** nhưng `Object.keys`
 * trả hai mảng khác nhau, nên chuỗi serialize khác nhau, nên **Oid khác nhau**.
 *
 * Và vế thứ nhất cũng cắn: đường dẫn file thường không phải số, nhưng Oid thì
 * là chuỗi hex — `'123'` và `'0abc'` xếp khác hẳn nhau tuỳ có lọt vào "dạng số
 * nguyên" hay không. Với `ObjectStore` khoá bằng Oid thì đó là một quả mìn.
 *
 * Đây là điều kiện §2.2 mục 3 của design doc: *"Mọi lần lặp trên tập hợp phải
 * qua khoá đã sắp xếp. Đây là lỗi bất định phổ biến nhất và thầm lặng nhất: nó
 * chỉ lộ khi thứ tự chèn đổi, tức là rất lâu sau khi ai đó thêm một tính năng
 * không liên quan."* Test §17.J.3 dựng cùng một repo bằng ≥ 5 thứ tự chèn khác
 * nhau và khẳng định hash trạng thái bằng nhau.
 */

/**
 * So sánh hai chuỗi theo **mã điểm Unicode**, không theo locale.
 *
 * ⛔ KHÔNG dùng `localeCompare`, và không dùng `[].sort()` trần cho dữ liệu có
 * thể chứa ký tự ngoài ASCII.
 *
 * `[].sort()` mặc định so theo mã UTF-16, `localeCompare` so theo locale của
 * máy. Hai cái cho kết quả KHÁC NHAU, và repo này đã trả giá đúng một lần cho
 * loại lỗi đó ở tầng khác: Postgres và JS không đồng ý về thứ tự tiếng Việt, và
 * hệ quả là keyset pagination nhảy dòng. Ở đây cái giá cao hơn: thứ tự khác
 * nghĩa là Oid khác, nghĩa là **verdict của client khác verdict của server** —
 * một người chơi trên máy đặt locale `vi-VN` bị chấm trượt một bài họ giải đúng.
 *
 * `<`/`>` trên chuỗi JS so theo đơn vị mã UTF-16, không phụ thuộc locale, và
 * chạy giống hệt nhau ở mọi trình duyệt và ở Node. Đó là thứ ta cần.
 */
export function compareKeys(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Khoá của một `Record`, đã sắp tăng dần theo mã điểm. */
export function sortedKeys<V>(record: Readonly<Record<string, V>>): readonly string[] {
  return Object.keys(record).sort(compareKeys);
}

/** Cặp khoá-giá trị, đã sắp theo khoá. Giá trị chắc chắn tồn tại. */
export function sortedEntries<V>(
  record: Readonly<Record<string, V>>,
): readonly (readonly [string, V])[] {
  const keys = sortedKeys(record);
  const out: (readonly [string, V])[] = [];
  for (const key of keys) {
    const value = record[key];
    // `noUncheckedIndexedAccess` bật, nên TS coi `record[key]` có thể `undefined`
    // dù khoá vừa lấy từ chính object đó. Guard này là thật, không phải chiều
    // trình biên dịch: một `Record` có `{ a: undefined }` tồn tại được, và bỏ nó
    // qua ở đây đúng hơn là serialize chữ `undefined` vào chuỗi băm.
    if (value === undefined) continue;
    out.push([key, value]);
  }
  return out;
}

/**
 * Bản sao có thêm/ghi đè một khoá. Không sửa bản gốc.
 *
 * Có mặt ở đây thay vì để mỗi chỗ tự `{ ...r, [k]: v }` vì cặp với `withoutKey`
 * dưới đây, và vì nó là chỗ duy nhất cần đọc khi ai đó hỏi "trạng thái có thật
 * sự bất biến không".
 */
export function withKey<V>(
  record: Readonly<Record<string, V>>,
  key: string,
  value: V,
): Readonly<Record<string, V>> {
  return { ...record, [key]: value };
}

/** Bản sao đã bỏ một khoá. Khoá không có sẵn thì trả về chính bản gốc. */
export function withoutKey<V>(
  record: Readonly<Record<string, V>>,
  key: string,
): Readonly<Record<string, V>> {
  if (!Object.hasOwn(record, key)) return record;
  const out: Record<string, V> = {};
  for (const [k, v] of sortedEntries(record)) {
    if (k === key) continue;
    out[k] = v;
  }
  return out;
}

/** Bản sao đã bỏ nhiều khoá cùng lúc. */
export function withoutKeys<V>(
  record: Readonly<Record<string, V>>,
  keys: readonly string[],
): Readonly<Record<string, V>> {
  const drop = new Set(keys);
  const out: Record<string, V> = {};
  for (const [k, v] of sortedEntries(record)) {
    if (drop.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Dựng lại một `Record` với khoá đã sắp.
 *
 * ⚠ Điều này KHÔNG cần cho tính đúng — mọi chỗ đọc đã đi qua `sortedEntries`.
 * Nó cần cho việc **đọc bằng mắt**: 17.Q xuất cây ra JSON để chia sẻ, và một
 * JSON có khoá sắp lộn xộn thì hai bản xuất của cùng một cây khác nhau theo
 * `diff`, dù chúng bằng nhau về ngữ nghĩa.
 */
export function normalized<V>(record: Readonly<Record<string, V>>): Readonly<Record<string, V>> {
  const out: Record<string, V> = {};
  for (const [k, v] of sortedEntries(record)) out[k] = v;
  return out;
}
