import type { ReactElement } from 'react';
import { Badge } from '@devops-platform/ui';
import {
  PROBLEM_DIFFICULTY_LABELS,
  type ProblemDifficulty,
  type ProblemViewerStatus,
} from '@devops-platform/games';
import {
  PROBLEM_DIFFICULTY_VARIANT,
  PROBLEM_VIEWER_STATUS_LABELS,
  PROBLEM_VIEWER_STATUS_VARIANT,
} from './problem-labels';

/**
 * Hai loại chip dùng ở CẢ trang danh sách và trang chi tiết. Để chung một chỗ
 * vì chúng phải trông giống hệt nhau ở hai nơi — hai bản sao sẽ lệch ở lần đầu
 * tiên ai đó chỉnh một bên.
 *
 * Không `'use client'`: cả hai là component TRÌNH BÀY thuần (không state,
 * không sự kiện), nên chúng chạy được ở cả hai phía và không tự kéo thêm gì
 * vào bundle trình duyệt.
 */

/**
 * Chip độ khó. Bốn bậc, bốn biến thể `Badge` — mỗi bậc có màu riêng VÀ số vạch
 * sóng riêng (1→4), nên hai người phân biệt được kể cả khi in đen trắng.
 */
export function DifficultyBadge({ value }: { readonly value: ProblemDifficulty }): ReactElement {
  return <Badge variant={PROBLEM_DIFFICULTY_VARIANT[value]}>{PROBLEM_DIFFICULTY_LABELS[value]}</Badge>;
}

/**
 * Chip trạng thái của người đang xem.
 *
 * `null` (chưa đăng nhập) ⇒ KHÔNG render gì. Một chip "Chưa động tới" cho
 * người chưa đăng nhập là một câu khẳng định về họ mà máy chủ chưa từng nói —
 * `untouched` nghĩa là "đã kiểm tra và bạn chưa thử", không phải "không biết".
 */
export function ViewerStatusBadge({ value }: { readonly value: ProblemViewerStatus | null }): ReactElement | null {
  if (value === null) {
    return null;
  }
  return <Badge variant={PROBLEM_VIEWER_STATUS_VARIANT[value]}>{PROBLEM_VIEWER_STATUS_LABELS[value]}</Badge>;
}
