/**
 * Tô màu cho khối `kubectl describe` — TOÁN THUẦN, không React, không DOM.
 *
 * Cùng khuôn với `yaml-highlight.ts` và cùng một bất biến: nối các mẩu lại phải
 * ra ĐÚNG dòng ban đầu, từng ký tự. Ở đây bất biến đó còn quan trọng hơn, vì
 * `describe` là nội dung CĂN CỘT — lệch một ký tự là gãy cả cột.
 *
 * ⛔ Không phải bộ đọc. Nó không hiểu `describe` nói gì; nó chỉ nhận ra ba hình
 * dạng dòng mà `describe.ts` phát ra: `Nhãn:  giá trị`, tiêu đề khối (`Events:`
 * đứng một mình), và dòng sự kiện dưới `Events:`.
 */

export type DescribeTokenKind =
  | 'label'
  | 'value'
  /** Tiêu đề khối: một nhãn đứng một mình, không có giá trị. */
  | 'heading'
  /** Giá trị đáng chú ý: `<none>`, `0`, trạng thái lỗi. */
  | 'muted'
  | 'warning'
  | 'error'
  | 'punctuation'
  | 'plain';

export interface DescribeToken {
  readonly text: string;
  readonly kind: DescribeTokenKind;
}

/**
 * Giá trị đọc ra là HỎNG.
 *
 * Danh sách ĐÓNG và cố ý ngắn: mỗi chuỗi ở đây là một trạng thái mà người học
 * phải nhận ra ngay khi lướt qua khối describe. Thêm bừa vào đây sẽ làm cả khối
 * đỏ lòm và không còn gì nổi bật nữa.
 */
const ERROR_VALUES = [
  'CrashLoopBackOff',
  'ImagePullBackOff',
  'ErrImagePull',
  'ErrImageNeverPull',
  'CreateContainerConfigError',
  'OOMKilled',
  'Failed',
  'Unhealthy',
  'FailedScheduling',
  'FailedMount',
  'Evicted',
  'NotReady',
];

const WARNING_VALUES = [
  'Pending',
  'Waiting',
  'Terminating',
  'ContainerCreating',
  'Warning',
  'Unknown',
];

const MUTED_VALUES = ['<none>', 'null', '-'];

function valueKind(value: string): DescribeTokenKind {
  const trimmed = value.trim();
  if (trimmed === '') return 'plain';
  if (MUTED_VALUES.includes(trimmed)) return 'muted';
  // So theo TỪ, không theo `includes` trên cả chuỗi: `Reason: Failed` phải đỏ,
  // nhưng một câu tiếng Việt chứa chữ "Failed" ở giữa thì không nên đỏ cả dòng.
  const words = trimmed.split(/[\s,]+/);
  if (words.some((word) => ERROR_VALUES.includes(word))) return 'error';
  if (words.some((word) => WARNING_VALUES.includes(word))) return 'warning';
  return 'value';
}

/**
 * Vị trí dấu hai chấm NGĂN nhãn với giá trị. `-1` nếu dòng không có nhãn.
 *
 * ⚠ KHÔNG phải `indexOf(':')`. Dòng sự kiện của `describe` chứa cả tên image
 * trong câu thông báo — `Không kéo được image "ghcr.io/dlp/api:khong-ton-tai"` —
 * và cắt ở dấu hai chấm ĐẦU TIÊN sẽ tô nửa câu tiếng Việt thành một cái nhãn.
 * Đo trực tiếp ở level 09: cả hai dòng `Failed` trong bảng Events hiện ra xanh
 * như thể chúng là nhãn. Đây đúng là cái bẫy mà `yaml-highlight.ts` đã gác, chỉ
 * đổi chỗ.
 *
 * Luật: dấu hai chấm phải theo sau bởi khoảng trắng hoặc hết dòng, VÀ phần
 * trước nó không được chứa khoảng trắng ở giữa — một nhãn của `describe` luôn là
 * một từ (`Restart Count:` là ngoại lệ duy nhất, nên cho phép tối đa hai từ).
 */
function labelEnd(text: string): number {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== ':') {
      continue;
    }
    const next = text[i + 1];
    if (next !== undefined && next !== ' ' && next !== '\t') {
      continue;
    }
    const head = text.slice(0, i);
    if (head.includes('"') || head.split(/\s+/).length > 2) {
      // Quá dài để là một nhãn ⇒ đây là một câu, không phải một cặp nhãn/giá trị.
      return -1;
    }
    return i;
  }
  return -1;
}

function push(out: DescribeToken[], text: string, kind: DescribeTokenKind): void {
  if (text !== '') {
    out.push({ text, kind });
  }
}

/**
 * Một dòng → danh sách mẩu.
 *
 * BẤT BIẾN: `tokens.map(t => t.text).join('') === line`.
 */
export function tokenizeDescribeLine(line: string): readonly DescribeToken[] {
  const out: DescribeToken[] = [];
  if (line === '') {
    return out;
  }

  const indentLength = line.length - line.trimStart().length;
  const indent = line.slice(0, indentLength);
  const rest = line.slice(indentLength);

  const colon = labelEnd(rest);
  if (colon === -1) {
    // Không có dấu hai chấm: dòng sự kiện, hoặc phần đuôi của một giá trị nhiều
    // dòng. Vẫn soi từ khoá để một `Failed` trong bảng Events nổi lên.
    push(out, indent, 'punctuation');
    push(out, rest, valueKind(rest));
    return out;
  }

  const label = rest.slice(0, colon);
  const after = rest.slice(colon + 1);

  push(out, indent, 'punctuation');
  // Tiêu đề khối = nhãn đứng một mình. Đây là thứ chia khối describe thành các
  // phần đọc được, nên nó phải khác hẳn một nhãn thường.
  push(out, label, after.trim() === '' ? 'heading' : 'label');
  push(out, ':', 'punctuation');

  const gapLength = after.length - after.trimStart().length;
  push(out, after.slice(0, gapLength), 'punctuation');
  const value = after.slice(gapLength);
  push(out, value, valueKind(value));
  return out;
}

/** Cả khối, giữ nguyên số dòng. */
export function tokenizeDescribe(source: string): readonly (readonly DescribeToken[])[] {
  return source.split('\n').map(tokenizeDescribeLine);
}
