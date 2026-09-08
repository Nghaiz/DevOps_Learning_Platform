/**
 * Kiểu và bộ dựng cho bảng tham số vị từ. Tách khỏi `predicate-spec.ts` để bảng
 * 32 dòng ở đó đọc được trong một màn hình — bảng mới là thứ người ta mở ra xem.
 */

export type PredicateArgType =
  | 'text'
  | 'namespace'
  | 'node'
  | 'resource-kind'
  | 'incident-kind'
  | 'selector'
  | 'probe'
  | 'number';

export interface PredicateArgSpec {
  readonly key: string;
  readonly label: string;
  readonly type: PredicateArgType;
  readonly required: boolean;
}

export interface PredicateSpec {
  /** Một câu tiếng Việt nói vị từ kiểm ĐIỀU GÌ — hiện cạnh ô chọn. */
  readonly label: string;
  readonly args: readonly PredicateArgSpec[];
  /**
   * Ít nhất một trong các khoá này phải được điền. Dùng cho ba vị từ nhận
   * "một trong hai cách chỉ pod" (`pod-running`, `secret-mounted`,
   * `volume-mounted`): thiếu cả hai thì hiện thực trả `false` chứ không ném, tức
   * mục tiêu chết lặng — đúng thứ phải bắt ở đây.
   */
  readonly requireOneOf?: readonly string[];
}

export const kind = (required = true): PredicateArgSpec => ({
  key: 'kind',
  label: 'Loại tài nguyên',
  type: 'resource-kind',
  required,
});
export const name = (required = true): PredicateArgSpec => ({ key: 'name', label: 'Tên', type: 'text', required });
export const ns = (required = true): PredicateArgSpec => ({
  key: 'namespace',
  label: 'Namespace',
  type: 'namespace',
  required,
});
export const node = (): PredicateArgSpec => ({ key: 'nodeName', label: 'Tên node', type: 'node', required: true });
export const sel = (key = 'labelSelector', label = 'Bộ chọn nhãn', required = true): PredicateArgSpec => ({
  key,
  label,
  type: 'selector',
  required,
});
export const text = (key: string, label: string, required = true): PredicateArgSpec => ({
  key,
  label,
  type: 'text',
  required,
});
export const num = (key: string, label: string, required = true): PredicateArgSpec => ({
  key,
  label,
  type: 'number',
  required,
});
