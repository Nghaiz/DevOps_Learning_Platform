import type { CopyRef, StaticTextKey } from '@devops-platform/copy';

/**
 * Trạng thái của một kỳ thi trên danh sách `/exams`, tách khỏi JSX để ĐO ĐƯỢC.
 *
 * ## Hai trục, hai hàm
 *
 * - `examWindow`: kỳ thi đang ở đâu trong cửa sổ giờ mở / giờ đóng của nó.
 * - `attemptPhase`: lượt làm của CHÍNH người xem đang ở đâu.
 *
 * Hai trục độc lập: một kỳ thi đang mở có thể chứa một lượt đã hết giờ, và một
 * kỳ thi đã đóng có thể chưa từng có lượt nào. Gộp chúng thành một nhãn là nói
 * sai ít nhất một nửa số ca.
 *
 * ## ⛔ Giờ so là giờ MÁY CHỦ, không phải `Date.now()`
 *
 * `examSitting.list` trả kèm `serverNow`, và `examWindow` so với đúng chuỗi đó.
 * Đồng hồ máy khách lệch (máy ảo ngủ, đồng hồ VM lệch ~59 giây, người dùng chỉnh
 * giờ) sẽ làm một kỳ thi "đang mở" hiện thành "đã đóng" mà không có lỗi nào.
 * Nhãn ở đây chỉ để HIỆN; máy chủ vẫn là nơi duy nhất cho hay không cho bắt đầu.
 *
 * ## `closed` của lượt làm đọc từ MÁY CHỦ
 *
 * Một lượt hết giờ mà bỏ dở có `submittedAt = null`, nên suy từ `submittedAt` sẽ
 * hiện "Đang làm" mãi. `closed` do máy chủ tính (nó cộng cả `closes_at`), và
 * `attemptPhase` chỉ dùng `submittedAt` để TÁCH hai ca bên trong `closed`.
 */

export type ExamWindow = 'upcoming' | 'open' | 'closed';

export type AttemptPhase = 'not-started' | 'in-progress' | 'submitted' | 'expired';

export type ExamFilter = 'all' | 'active' | 'done';

export const EXAM_FILTERS = ['all', 'active', 'done'] as const satisfies readonly ExamFilter[];

export interface ExamWindowInput {
  readonly opensAt: string | null;
  readonly closesAt: string | null;
}

export interface ExamAttemptInput {
  readonly startedAt: string | null;
  readonly submittedAt: string | null;
  readonly closed: boolean;
}

/** Mốc thời gian ISO thành mili-giây, hoặc `null` khi thiếu hay hỏng. */
function instant(iso: string | null): number | null {
  if (iso === null) {
    return null;
  }
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : at;
}

/**
 * Vị trí của kỳ thi trong cửa sổ của nó, so với giờ máy chủ.
 *
 * Mốc thiếu nghĩa là phía đó không giới hạn. `serverNow` hỏng thì không so được
 * gì, và câu trả lời an toàn là `open`: nút bắt đầu vẫn đi qua máy chủ, nên một
 * nhãn lạc quan chỉ tốn một lượt bấm bị từ chối, còn một nhãn "Đã đóng" sai thì
 * làm người học bỏ một kỳ thi đang mở.
 */
export function examWindow(item: ExamWindowInput, serverNow: string): ExamWindow {
  const now = instant(serverNow);
  if (now === null) {
    return 'open';
  }
  const opens = instant(item.opensAt);
  if (opens !== null && now < opens) {
    return 'upcoming';
  }
  const closes = instant(item.closesAt);
  if (closes !== null && now >= closes) {
    return 'closed';
  }
  return 'open';
}

/** Lượt làm của người xem: chưa vào, đang làm, đã nộp, hay hết giờ. */
export function attemptPhase(item: ExamAttemptInput): AttemptPhase {
  if (item.startedAt === null) {
    return 'not-started';
  }
  if (!item.closed) {
    return 'in-progress';
  }
  return item.submittedAt === null ? 'expired' : 'submitted';
}

/**
 * Kỳ thi này còn làm được gì nữa không.
 *
 * "Đã kết thúc" khi lượt làm đã khoá, HOẶC khi cửa sổ đã đóng. Vế sau là chỗ bản
 * cũ sai: kỳ thi đã đóng mà người học chưa từng vào có `closed = false` (máy chủ
 * trả `false` khi chưa có lượt), nên nó nằm mãi trong mục "Chưa kết thúc" dù
 * không còn bắt đầu được.
 */
export function isExamFinished(item: ExamAttemptInput, window: ExamWindow): boolean {
  return item.closed || window === 'closed';
}

export function matchesExamFilter(filter: ExamFilter, finished: boolean): boolean {
  if (filter === 'all') {
    return true;
  }
  return filter === 'done' ? finished : !finished;
}

export const EXAM_WINDOW_KEYS = {
  upcoming: 'exam.window.upcoming',
  open: 'exam.window.open',
  closed: 'exam.window.closed',
} as const satisfies Record<ExamWindow, StaticTextKey>;

export const ATTEMPT_PHASE_KEYS = {
  'not-started': 'exam.attempt.not-started',
  'in-progress': 'exam.attempt.in-progress',
  submitted: 'exam.attempt.submitted',
  expired: 'exam.attempt.expired',
} as const satisfies Record<AttemptPhase, StaticTextKey>;

export const EXAM_FILTER_KEYS = {
  all: 'exam.filter-all',
  active: 'exam.filter-active',
  done: 'exam.filter-done',
} as const satisfies Record<ExamFilter, StaticTextKey>;

/**
 * Câu tả cửa sổ giờ của kỳ thi, dạng khoá.
 *
 * Nhận hàm định dạng từ ngoài vì định dạng giờ theo locale chỉ được chạy ở
 * client (chạy lúc render máy chủ thì lệch múi giờ khi hydrate). Hàm này vẫn
 * thuần: cùng đầu vào, cùng khoá.
 */
export function examWhen(item: ExamWindowInput, format: (iso: string) => string): CopyRef {
  if (item.opensAt !== null && item.closesAt !== null) {
    return { key: 'exam.when.range', params: { from: format(item.opensAt), to: format(item.closesAt) } };
  }
  if (item.opensAt !== null) {
    return { key: 'exam.when.from', params: { at: format(item.opensAt) } };
  }
  if (item.closesAt !== null) {
    return { key: 'exam.when.until', params: { at: format(item.closesAt) } };
  }
  return { key: 'exam.when.any' };
}
