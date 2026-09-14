import type { AuthorField } from '@devops-platform/games';

/**
 * Trạng thái form của biểu mẫu dựng-từ-plugin, và phép đổi qua lại với một spec.
 *
 * ## Vì sao MỌI giá trị giữ dạng CHUỖI
 *
 * Không phải vì lười kiểu. Một ô nhập đang gõ dở luôn đi qua những trạng thái
 * không hợp lệ: `"12"` chưa gõ xong là `"1"`, một object JSON chưa đóng ngoặc,
 * một danh sách còn dòng trống ở cuối. Giữ giá trị đã phân tích trong state
 * nghĩa là phải quyết định làm gì với những trạng thái đó ngay lúc gõ, và câu
 * trả lời duy nhất không khó chịu là "giữ nguyên chuỗi rồi phân tích lúc gửi".
 *
 * Biểu mẫu K8s viết tay đã chọn đúng cách đó từ trước (`namespacesText`,
 * `penaltyPoints: string`, `args` là map chuỗi), nên đây là cùng một quy ước chứ
 * không phải một quy ước thứ hai.
 *
 * ## Khoá là `path` PHẲNG
 *
 * `AuthorField.path` của trường con trong `list` được nối bằng dấu chấm
 * (`resources.kind`), cùng phép nối mà `authorFieldPaths` dùng. Không lồng
 * `Record` theo tầng: một map phẳng thì `Object.keys` của nó so được thẳng với
 * tập path của plugin, và đó là thứ ô nghiệm thu cần đọc.
 */
export type SpecTextState = Readonly<Record<string, string>>;

/** `true` khi ô hiện một textarea JSON thô thay vì một widget riêng. */
export function isJsonShaped(field: AuthorField): boolean {
  return field.kind === 'json' || field.kind === 'list';
}

/**
 * Một giá trị bất kỳ trong spec thành chuỗi để hiện lên ô nhập.
 *
 * Object và mảng đi qua `JSON.stringify` có thụt lề: đó là dạng duy nhất người
 * soạn sửa lại được, và cũng là dạng `readSpecText` đọc ngược.
 *
 * `undefined` thành `''` chứ không thành `"undefined"`. Hai thứ đó khác nhau:
 * chuỗi rỗng là "chưa điền", còn chữ `undefined` nằm trong một ô nhập là một
 * giá trị người soạn sẽ phải tự xoá, và sẽ có người quên.
 */
function toText(value: unknown, jsonShaped: boolean): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (jsonShaped || typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * Spec dạng object thành map chuỗi theo mô tả form.
 *
 * Chỉ đọc các path TẦNG ĐẦU: trường con của `list` không có giá trị riêng ở
 * tầng này (cả danh sách nằm trong một ô JSON, xem `isJsonShaped`), nên đọc
 * chúng sẽ luôn ra `''` và làm map đầy khoá rỗng vô nghĩa.
 *
 * `string-list` nối bằng xuống dòng, một dòng một giá trị. Đúng quy ước mà ô
 * namespace của biểu mẫu K8s đã dùng, và là quy ước `readSpecText` đọc ngược.
 */
export function specToText(
  fields: readonly AuthorField[],
  spec: Readonly<Record<string, unknown>>,
): SpecTextState {
  const out: Record<string, string> = {};
  for (const field of fields) {
    const value = spec[field.path];
    if (field.kind === 'string-list') {
      out[field.path] = Array.isArray(value) ? value.map((item) => String(item)).join('\n') : '';
      continue;
    }
    if (field.kind === 'select' && field.multiple) {
      out[field.path] = Array.isArray(value) ? value.map((item) => String(item)).join(',') : '';
      continue;
    }
    if (field.kind === 'boolean') {
      out[field.path] = value === true ? 'true' : '';
      continue;
    }
    out[field.path] = toText(value, isJsonShaped(field));
  }
  return out;
}

/**
 * Một dòng của `string-list` thành giá trị.
 *
 * Bỏ dòng trống và khoảng trắng thừa: một textarea luôn kết thúc bằng một dòng
 * trống mà người gõ không thấy, và gửi nó lên thành một phần tử `''` là gửi một
 * namespace tên rỗng.
 */
export function parseLines(raw: string): readonly string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

export interface SpecTextIssue {
  readonly path: string;
  readonly label: string;
}

/**
 * Những ô JSON đang chứa chuỗi KHÔNG phân tích được.
 *
 * Trả danh sách chứ không ném, và không tự sửa: một JSON hỏng lúc đang gõ là
 * chuyện bình thường; thứ phải chặn là LƯU một JSON hỏng. Gọi hàm này ở chỗ
 * quyết định lưu, không phải ở mỗi lần gõ phím.
 */
export function invalidJsonFields(
  fields: readonly AuthorField[],
  text: SpecTextState,
): readonly SpecTextIssue[] {
  const issues: SpecTextIssue[] = [];
  for (const field of fields) {
    if (!isJsonShaped(field)) {
      continue;
    }
    const raw = (text[field.path] ?? '').trim();
    if (raw === '') {
      continue;
    }
    try {
      JSON.parse(raw);
    } catch {
      issues.push({ path: field.path, label: field.label });
    }
  }
  return issues;
}
