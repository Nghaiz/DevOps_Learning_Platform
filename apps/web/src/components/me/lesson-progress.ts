import { t } from '@devops-platform/copy';
import type { BadgeVariant } from '@devops-platform/ui';

/**
 * Nhãn cho một dòng `me.listProgress` trên `/me` — HÀM THUẦN.
 *
 * ## Bảng `progress` KHÔNG mang đủ dữ liệu cho một tỉ lệ, và nhãn phải chịu điều đó
 *
 * Cột có thật: `step_index`, `completed_at`, `updated_at` (xem
 * `server/db/schema.ts`). KHÔNG có `step_count` — số bước của bài nằm trong
 * scenario, không nằm trong dòng tiến độ. Nên `"3/7 bước"` là một câu KHÔNG
 * dựng được từ dòng này, và cách "sửa" bằng cách nạp thêm `lessons.list` để tra
 * `stepCount` sẽ hỏng lặng lẽ: danh sách đó chỉ chứa bài `published` và bị cắt
 * theo trang, nên bài đã archive hoặc nằm ở trang sau sẽ ra `undefined` rồi
 * hiện `"3/0"`.
 *
 * ## `stepIndex` là VỊ TRÍ, không phải SỐ BƯỚC ĐÃ XONG
 *
 * `lessons.setStep` ghi thẳng `input.stepIndex` mỗi lần người học chuyển step,
 * và chú thích ở `routers/lessons.ts` nói rõ: *"`stepIndex` là VỊ TRÍ HIỆN TẠI,
 * không phải 'step xa nhất từng tới'"*. Người học nhảy về step 1 để đọc lại thì
 * cột này thành 0. Vì vậy nhãn nói `"Đang ở bước N"` (một vị trí) và tuyệt đối
 * KHÔNG nói `"đã xong N bước"` — đó đúng là hình dạng câu đã đẻ ra nợ P2.
 */

export interface LessonProgressInput {
  readonly stepIndex: number;
  /**
   * `null` = chưa xong. Server ghi mốc này khi step cuối đạt.
   *
   * ⚠ `Date` cũng hợp lệ: `me.listProgress` trả thẳng dòng Drizzle, nên KIỂU
   * nói `Date` trong khi JSON qua dây (không transformer) là chuỗi ISO. Hàm này
   * chỉ so với `null` nên cả hai chạy đúng — xem chú thích ở `session-summary.ts`.
   */
  readonly completedAt: string | Date | null;
}

export interface LessonProgressSummary {
  readonly label: string;
  readonly variant: BadgeVariant;
  /** Câu phụ về vị trí đang đứng; `null` khi bài đã xong (vị trí không còn nghĩa gì). */
  readonly detail: string | null;
}

export function summarizeLessonProgress(input: LessonProgressInput): LessonProgressSummary {
  if (input.completedAt !== null) {
    // "Đã xong" đọc từ `completed_at` — một mốc CÓ THẬT trong DB, không suy ra.
    return { label: t('me.lessons.status-done'), variant: 'success', detail: null };
  }

  // `stepIndex` là 0-based; người học đếm từ 1.
  return {
    label: t('me.lessons.status-learning'),
    variant: 'secondary',
    detail: t('me.lessons.step', { step: input.stepIndex + 1 }),
  };
}
