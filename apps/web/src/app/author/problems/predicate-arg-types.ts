import type { StaticTextKey } from '@devops-platform/copy';
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
  /** KHOÁ của nhãn, không phải nhãn đã dựng. Xem khối ngay dưới. */
  readonly label: StaticTextKey;
  readonly type: PredicateArgType;
  readonly required: boolean;
}

/**
 * ## Vì sao hai trường `label` mang KIỂU KHOÁ chứ không phải `string`
 *
 * `string` không buộc được ai đi qua `t()`. Người thêm vị từ thứ 33 với
 * `label: 'Pod đang treo'` viết thẳng sẽ KHÔNG làm `tsc` đỏ, và chuỗi đó chỉ bị
 * bắt nếu bộ dò T4 tình cờ quét đúng thư mục này. `StaticTextKey` là một union
 * các khoá có thật trong bản đồ, nên một câu tiếng Việt viết thẳng là lỗi biên
 * dịch ngay tại dòng gõ ra nó.
 *
 * Dùng `StaticTextKey` chứ không `TextKey`: `TextKey` gồm cả mục ĐỘNG, mà
 * `t(key)` trên một mục động thiếu tham số vẫn biên dịch được (tuple tham số
 * suy ra rỗng khi `K` là cả union) rồi nội suy ra `undefined` lúc chạy. Hẹp
 * hơn một bậc thì mục động bị từ chối tại chỗ khai, không phải trên màn hình.
 *
 * Hệ quả: giá trị ở đây là khoá, nên MỌI nơi đọc hai trường này phải gọi
 * `t(spec.label)`. Không nơi nào được in thẳng.
 */
export interface PredicateSpec {
  /** KHOÁ của một câu tiếng Việt nói vị từ kiểm ĐIỀU GÌ, hiện cạnh ô chọn. */
  readonly label: StaticTextKey;
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
  label: 'problem.predicate-arg-types-loai-tai-nguyen',
  type: 'resource-kind',
  required,
});
export const name = (required = true): PredicateArgSpec => ({
  key: 'name',
  label: 'problem.predicate-arg-types-ten',
  type: 'text',
  required,
});
export const ns = (required = true): PredicateArgSpec => ({
  key: 'namespace',
  label: 'problem.cluster-fields-namespace',
  type: 'namespace',
  required,
});
export const node = (): PredicateArgSpec => ({
  key: 'nodeName',
  label: 'problem.node-fields-ten-node',
  type: 'node',
  required: true,
});
export const sel = (
  key = 'labelSelector',
  label: StaticTextKey = 'problem.predicate-arg-types-bo-chon-nhan',
  required = true,
): PredicateArgSpec => ({
  key,
  label,
  type: 'selector',
  required,
});
export const text = (key: string, label: StaticTextKey, required = true): PredicateArgSpec => ({
  key,
  label,
  type: 'text',
  required,
});
export const num = (key: string, label: StaticTextKey, required = true): PredicateArgSpec => ({
  key,
  label,
  type: 'number',
  required,
});
