/**
 * Điều hướng bằng bàn phím trong cảnh 3D — toán thuần, không `three`, không DOM.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO TIÊU ĐIỂM LÀ TRẠNG THÁI NỘI BỘ CỦA CẢNH 3D
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ở cảnh 2D mỗi node là một phần tử DOM thật, nên tiêu điểm do trình duyệt lo và
 * không ai phải viết gì. Cảnh 3D vẽ trên canvas — **không có DOM để lo**, nên
 * tiêu điểm phải do chính cảnh giữ. Nó KHÔNG đi vào `CicdSceneInteraction`: HUD
 * không cần biết con trỏ bàn phím của cảnh 3D đang ở đâu, và đưa nó lên hợp đồng
 * chung là bắt cảnh 2D mang một trường nó không bao giờ dùng.
 *
 * Thứ tự duyệt lấy từ chính `cicdSceneNodes()` — nó đã sắp ổn định theo
 * `(x, z, y, id)`. Không bịa một thứ tự mới: hai renderer đi cùng một trật tự
 * thì người chơi chuyển qua lại giữa 2D và 3D không phải học lại, và ô AC-D2 vẫn
 * nói về cùng một tập.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ TAB KHÔNG ĐƯỢC BẪY TIÊU ĐIỂM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `Tab` đi tiếp trong cảnh, nhưng **tới node cuối thì nó rời khỏi cảnh** (và
 * `Shift+Tab` ở node đầu cũng vậy) — tức chỗ đó KHÔNG gọi `preventDefault`. Một
 * cảnh nuốt sạch `Tab` là một cái bẫy tiêu điểm: người dùng bàn phím vào được mà
 * không ra được, và đó là một lỗi a11y nặng hơn hẳn thứ nó định sửa.
 *
 * Mũi tên thì QUẤN VÒNG, vì mũi tên là phím "đi trong một nhóm" — không ai chờ
 * mũi tên đưa mình ra khỏi cảnh.
 */

/** Ý định đọc ra từ một phím. `null` = phím không liên quan, đừng nuốt nó. */
export type NavIntent =
  | 'next'
  | 'previous'
  | 'next-or-exit'
  | 'previous-or-exit'
  | 'first'
  | 'last'
  | 'select'
  | 'clear';

/**
 * Đọc phím thành ý định.
 *
 * ⛔ Trả `null` cho mọi phím khác, và chỗ gọi phải KHÔNG `preventDefault` khi
 * nhận `null`. Nuốt một phím mình không xử lý là cách làm hỏng mọi phím tắt của
 * trình duyệt và của chính ứng dụng, một cách âm thầm.
 */
export function navIntentOf(key: string, shiftKey: boolean): NavIntent | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return 'next';
    case 'ArrowLeft':
    case 'ArrowUp':
      return 'previous';
    case 'Tab':
      return shiftKey ? 'previous-or-exit' : 'next-or-exit';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    case 'Enter':
    case ' ':
    case 'Spacebar':
      return 'select';
    case 'Escape':
      return 'clear';
    default:
      return null;
  }
}

export interface FocusMove {
  /** Tiêu điểm mới. `null` = chưa có node nào được trỏ tới. */
  readonly index: number | null;
  /** Có gọi `preventDefault` không. `false` ở mép `Tab` để tiêu điểm rời cảnh. */
  readonly handled: boolean;
}

/**
 * Tiêu điểm mới sau một ý định DI CHUYỂN.
 *
 * `select` và `clear` không đổi tiêu điểm nên chúng không đi qua đây — chỗ gọi
 * xử lý riêng. Tách vậy để hàm này chỉ có một việc và ô test nói được về đúng
 * một thứ.
 */
export function resolveFocus(
  current: number | null,
  count: number,
  intent: NavIntent,
): FocusMove {
  if (count <= 0) {
    // Cảnh rỗng: không có gì để trỏ tới, và nuốt phím ở đây chỉ làm người dùng
    // tưởng mình đang điều khiển một thứ không tồn tại.
    return { index: null, handled: false };
  }
  const last = count - 1;
  switch (intent) {
    case 'first':
      return { index: 0, handled: true };
    case 'last':
      return { index: last, handled: true };
    case 'next':
      return { index: current === null ? 0 : (current + 1) % count, handled: true };
    case 'previous':
      return { index: current === null ? last : (current - 1 + count) % count, handled: true };
    case 'next-or-exit':
      if (current === null) {
        return { index: 0, handled: true };
      }
      // Ở node cuối thì THÔI, để trình duyệt đưa tiêu điểm ra khỏi cảnh.
      return current < last
        ? { index: current + 1, handled: true }
        : { index: current, handled: false };
    case 'previous-or-exit':
      if (current === null) {
        return { index: last, handled: true };
      }
      return current > 0
        ? { index: current - 1, handled: true }
        : { index: current, handled: false };
    case 'select':
    case 'clear':
    default:
      return { index: current, handled: current !== null || intent === 'clear' };
  }
}

/**
 * Kẹp tiêu điểm khi danh sách node đổi.
 *
 * Đồ thị đổi hình sau mỗi lượt chạy (thêm/bớt thực thể vì `fanOut`, node rụng vì
 * toạ độ hỏng), nên một chỉ số hợp lệ ở lượt trước có thể trỏ ra ngoài mảng ở
 * lượt này. Không kẹp thì `draw.nodes[index]` trả `undefined` và tiêu điểm biến
 * mất mà không có gì báo — người dùng bàn phím mất chỗ đứng sau mỗi lần bấm chạy.
 */
export function clampFocus(current: number | null, count: number): number | null {
  if (current === null || count <= 0) {
    return null;
  }
  if (current < 0) {
    return 0;
  }
  return current > count - 1 ? count - 1 : current;
}
