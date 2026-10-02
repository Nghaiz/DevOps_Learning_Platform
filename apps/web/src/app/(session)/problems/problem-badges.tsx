import type { ReactElement } from 'react';
import { Circle, CircleCheck, CircleDot } from 'lucide-react';
import { Difficulty, cn } from '@devops-platform/ui';
import {
  PROBLEM_DIFFICULTY_LABELS,
  type ProblemDifficulty,
  type ProblemViewerStatus,
} from '@devops-platform/games';
import { PROBLEM_DIFFICULTY_LEVEL, PROBLEM_VIEWER_STATUS_LABELS } from './problem-labels';

/**
 * Hai dấu hiệu dùng ở CẢ trang danh sách và trang chi tiết. Để chung một chỗ vì
 * chúng phải trông giống hệt nhau ở hai nơi: hai bản sao sẽ lệch ở lần đầu tiên
 * ai đó chỉnh một bên.
 *
 * Không `'use client'`: cả hai là component trình bày thuần, chạy được ở cả hai
 * phía và không kéo thêm gì vào bundle trình duyệt.
 */

/**
 * Độ khó: glyph bốn vạch + chữ. Không mang màu (màu dành cho tuyến chủ đề), nên
 * hai bậc phân biệt nhau bằng SỐ VẠCH và bằng chữ, kể cả khi in đen trắng.
 */
export function ProblemDifficultyMark({
  value,
  className,
}: {
  readonly value: ProblemDifficulty;
  readonly className?: string;
}): ReactElement {
  return (
    <Difficulty
      level={PROBLEM_DIFFICULTY_LEVEL[value]}
      label={PROBLEM_DIFFICULTY_LABELS[value]}
      showLabel
      className={className}
    />
  );
}

const STATUS_ICON = {
  solved: CircleCheck,
  attempted: CircleDot,
  untouched: Circle,
} as const satisfies Record<ProblemViewerStatus, unknown>;

const STATUS_TONE: Readonly<Record<ProblemViewerStatus, string>> = {
  solved: 'text-success',
  attempted: 'text-warning',
  untouched: 'text-muted-foreground',
};

/**
 * Kết quả của người đang xem: biểu tượng + chữ, không bao giờ chỉ màu.
 *
 * `null` (máy chủ không biết người xem là ai) ⇒ KHÔNG render gì. "Chưa làm" cho
 * người chưa đăng nhập là một câu khẳng định về họ mà máy chủ chưa từng nói:
 * `untouched` nghĩa là "đã kiểm tra và bạn chưa thử", không phải "không biết".
 *
 * "Chưa qua" chứ không "WA": `attempted` gộp mọi lượt chưa AC, kể cả lượt không
 * chạy tới nơi (CE). Gọi nó là WA là kết luận thay máy chủ một điều nó không nói.
 */
export function ViewerStatusMark({
  value,
  className,
}: {
  readonly value: ProblemViewerStatus | null;
  readonly className?: string;
}): ReactElement | null {
  if (value === null) {
    return null;
  }
  const Icon = STATUS_ICON[value];
  return (
    <span
      data-status={value}
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-xs font-medium whitespace-nowrap',
        STATUS_TONE[value],
        className,
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      {PROBLEM_VIEWER_STATUS_LABELS[value]}
    </span>
  );
}
