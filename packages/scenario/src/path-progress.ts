import type {
  LearningPathItemView,
  PathItemKind,
  PathItemState,
} from '@devops-platform/shared-types/path';

/**
 * Luật MỞ KHOÁ của lộ trình — hàm THUẦN (P10 10.A task 4).
 *
 * ⛔ Đây là bản DUY NHẤT của luật, và nó chạy Ở SERVER. Ô AC nói rõ: *"gọi
 * thẳng API item bị khoá vẫn bị từ chối"*. Vì thế hàm này được dùng ở HAI chỗ,
 * không phải một:
 *
 * 1. `paths.get` — để vẽ ổ khoá cho UI.
 * 2. `assertItemUnlocked` — cổng chặn khi người học thật sự mở item đó.
 *
 * Nếu chỉ dùng ở (1) thì ổ khoá là một hình vẽ: bất kỳ ai gõ thẳng URL của item
 * N+1 đều vào được, và không có gì trong hệ thống phản đối. Đó chính là hình
 * dạng của lỗi "kiểm ở client" mà bảng rủi ro P10 xếp score 12.
 *
 * ⚠ Subpath AN TOÀN CHO TRÌNH DUYỆT — cùng lý do `lab-score` / `quiz-score`.
 */

/** Khoá nhận dạng một item trong lộ trình. Cặp `(kind, itemId)`, không phải id đơn. */
export interface PathItemRef {
  readonly kind: PathItemKind;
  readonly itemId: string;
}

export interface PathItemRow extends PathItemRef {
  readonly ordinal: number;
  /** Nạp từ nguồn nội dung lúc đọc; `null` = bài không còn nạp được. */
  readonly title: string | null;
  /** Người ĐANG HỎI đã đạt item này chưa. Suy từ progress/lab-attempt/quiz-attempt. */
  readonly passed: boolean;
}

/**
 * Khoá chuỗi của một item — `kind` PHẢI có mặt.
 *
 * Một lesson và một quiz được phép trùng slug: chúng nằm ở hai bảng khác nhau,
 * không có ràng buộc nào cấm. Dùng riêng `itemId` làm khoá sẽ khiến "đã đạt
 * lesson X" mở khoá luôn "quiz X" — im lặng, và chỉ lộ ra khi có người tình cờ
 * đặt trùng tên.
 */
export function pathItemKey(ref: PathItemRef): string {
  return `${ref.kind}:${ref.itemId}`;
}

/**
 * Trạng thái từng item cho MỘT người học.
 *
 * `sequential: false` (mặc định — học tự do, task 4) ⇒ không item nào `locked`.
 *
 * `sequential: true` ⇒ item N mở khi N−1 **đạt**. Luật được áp theo thứ tự
 * `ordinal` đã sắp, và một item chưa đạt sẽ khoá MỌI item sau nó — không chỉ
 * item liền kề. Cách khác ("chỉ khoá item liền sau") cho phép nhảy cóc qua một
 * mắt xích bằng cách bỏ dở nó, tức là luật tự vô hiệu hoá chính mình.
 *
 * Item đã đạt luôn là `passed` kể cả khi item trước nó chưa đạt — chuyện đó xảy
 * ra thật khi tác giả BẬT `sequential` trên một lộ trình người ta đã học dở.
 * Hiện đúng thứ đã xảy ra, không viết lại lịch sử.
 */
export function viewPathItems(
  rows: readonly PathItemRow[],
  sequential: boolean,
): readonly LearningPathItemView[] {
  const ordered = [...rows].sort((a, b) => a.ordinal - b.ordinal);

  let blocked = false;
  return ordered.map((row) => {
    let state: PathItemState;
    if (row.passed) {
      state = 'passed';
    } else if (sequential && blocked) {
      state = 'locked';
    } else {
      state = 'available';
    }

    if (!row.passed) {
      blocked = true;
    }

    return {
      ordinal: row.ordinal,
      kind: row.kind,
      itemId: row.itemId,
      title: row.title,
      state,
    };
  });
}

/**
 * Item kế tiếp nên làm — `available` đầu tiên theo `ordinal`.
 *
 * `null` khi đã đạt hết, và cũng `null` khi mọi thứ còn lại đều `locked` (chỉ
 * xảy ra nếu `viewPathItems` bị gọi sai). Không bịa ra một item để trỏ tới.
 */
export function nextItemIdOf(items: readonly LearningPathItemView[]): string | null {
  return items.find((item) => item.state === 'available')?.itemId ?? null;
}

/** Số item đã đạt — TÍNH từ `items[]`, không đọc thêm gì. */
export function passedCountOf(items: readonly LearningPathItemView[]): number {
  return items.filter((item) => item.state === 'passed').length;
}

/**
 * Item này có mở cho người học không — cổng chặn của `assertItemUnlocked`.
 *
 * Trả `false` cho item không thuộc lộ trình: một id lạ không phải "mở", nó là
 * một câu hỏi sai. Caller quyết định ném NOT_FOUND hay FORBIDDEN.
 */
export function isItemUnlocked(
  items: readonly LearningPathItemView[],
  ref: PathItemRef,
): boolean {
  const key = pathItemKey(ref);
  const found = items.find((item) => pathItemKey(item) === key);
  return found !== undefined && found.state !== 'locked';
}
