import { t } from '@devops-platform/copy';

/**
 * Nhãn tiến độ lộ trình trên `/me` — HÀM THUẦN, tách khỏi JSX.
 *
 * ## Vì sao lại là một module riêng (13.E mục 19, nợ P2 §2)
 *
 * `apps/web/src/app/lessons/[id]/progress.ts` đã trả giá cho bài học này một
 * lần: nhãn cũ nói `"4/4 bước đã đạt"` sau ĐÚNG MỘT lượt chấm, vì nó suy một
 * TẬP bước từ một cờ `completed` mà hệ thống không lưu tập đó ở đâu cả. Con số
 * không sai với thứ nó đo; câu chữ mới là chỗ sai.
 *
 * Ở đây dữ liệu tốt hơn — `paths.mine` trả `passedCount`/`itemCount` do
 * `passedCountOf(items)` ĐẾM THẬT từ `items[]` mỗi lượt đọc (`path-progress.ts`
 * của `packages/scenario`), không cột nào lưu chúng. Nhưng ba chỗ vẫn dễ nói
 * quá tay, nên chúng nằm trong hàm này chứ không nằm trong một template string
 * giữa JSX:
 *
 * 1. `nextItemId === null` KHÔNG đồng nghĩa "đã xong lộ trình". `nextItemIdOf`
 *    trả `null` ở HAI ca: đã đạt hết, và mọi phần còn lại đều `locked`. Đọc ca
 *    thứ hai thành "xong rồi" là nói dối đúng với người đang bị chặn.
 * 2. `itemCount === 0` (lộ trình rỗng do tác giả vừa tạo) cho `0/0` — một phân
 *    số không nói gì.
 * 3. `nextItemId` là **id của phần**, không phải tiêu đề. Nhãn phải trình bày
 *    nó như một mã, không như một cái tên.
 *
 * ⚠ Trang này KHÔNG lưu lại bất kỳ con số nào ở đây vào state rồi khẳng định
 * từ bản sao đó (P8/P10 cấm derived field; 13.E mục 19 nhắc lại cho FE). Mọi
 * giá trị đi thẳng từ payload của lượt đọc hiện tại vào hàm này.
 */

export interface PathProgressInput {
  /** Số phần ĐÃ ĐẠT — `paths.mine` đếm lại ở mỗi lượt đọc. */
  readonly passedCount: number;
  /** Tổng số phần của lộ trình. */
  readonly itemCount: number;
  /** Phần `available` đầu tiên, hoặc `null` (đã đạt hết HOẶC phần còn lại đều khoá). */
  readonly nextItemId: string | null;
}

export interface PathProgressSummary {
  /** Cho `ProgressBar.value`. */
  readonly value: number;
  /** Cho `ProgressBar.max`. */
  readonly max: number;
  /** Câu chữ về số phần đã đạt. */
  readonly label: string;
  /** Câu chữ về việc nên làm gì tiếp, `null` khi không có gì để nói. */
  readonly nextLabel: string | null;
  /** `true` khi `nextLabel` nói về một mã phần (UI hiện bằng font mono). */
  readonly nextIsItemId: boolean;
}

export function summarizePathProgress(input: PathProgressInput): PathProgressSummary {
  const { passedCount, itemCount, nextItemId } = input;

  if (itemCount === 0) {
    return {
      value: 0,
      max: 0,
      label: t('me.path.no-items'),
      nextLabel: null,
      nextIsItemId: false,
    };
  }

  const label = t('me.path.passed', { passed: passedCount, total: itemCount });

  if (nextItemId !== null) {
    return {
      value: passedCount,
      max: itemCount,
      label,
      nextLabel: t('me.path.next-item', { id: nextItemId }),
      nextIsItemId: true,
    };
  }

  // `nextItemId === null` — phân biệt hai ca, vì chúng nói hai điều ngược nhau
  // với người học. So sánh bằng chính hai con số vừa đọc, không bằng một cờ
  // riêng nào (không có cờ nào như thế, và nếu có thì nó là derived field).
  if (passedCount >= itemCount) {
    return {
      value: passedCount,
      max: itemCount,
      label,
      nextLabel: t('me.path.all-passed'),
      nextIsItemId: false,
    };
  }

  return {
    value: passedCount,
    max: itemCount,
    label,
    nextLabel: t('me.path.locked'),
    nextIsItemId: false,
  };
}
