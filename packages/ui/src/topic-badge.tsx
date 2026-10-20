import type { ComponentProps } from 'react';
import { cn } from './cn.ts';
import { LINE_CLASSES, LINE_CODE, type LineId } from './lines.ts';

export type TopicBadgeSize = 'sm' | 'md';

export interface TopicBadgeProps extends Omit<ComponentProps<'span'>, 'children'> {
  readonly line: LineId;
  /** Tên tuyến hiện cạnh mã (ví dụ "Docker & container"). Tiếng Việt, do nơi gọi truyền. */
  readonly label?: string;
  readonly size?: TopicBadgeSize;
}

const CODE_SIZE: Record<TopicBadgeSize, string> = {
  sm: 'h-5 px-1.5 type-label',
  md: 'h-6 px-2 font-mono text-xs font-semibold tracking-wider uppercase',
};

const LABEL_SIZE: Record<TopicBadgeSize, string> = {
  sm: 'h-5 px-1.5 text-xs',
  md: 'h-6 px-2 text-xs',
};

/**
 * Biển tuyến: ô màu tuyến in mã ba chữ, tuỳ chọn kèm tên tuyến.
 *
 * Khi có `label`, mã là chữ viết tắt lặp lại nghĩa của tên nên được ẩn khỏi
 * cây trợ năng (đọc "D K R Docker" là thừa). Không có `label` thì mã là thứ
 * duy nhất mang nghĩa và phải được đọc.
 */
export function TopicBadge({ line, label, size = 'md', className, ...props }: TopicBadgeProps) {
  const hasLabel = label !== undefined && label !== '';
  return (
    <span
      data-slot="topic-badge"
      data-line={line}
      className={cn('inline-flex shrink-0 items-stretch whitespace-nowrap', className)}
      {...props}
    >
      <span
        data-slot="topic-badge-code"
        aria-hidden={hasLabel ? true : undefined}
        className={cn('inline-flex items-center rounded-control', LINE_CLASSES[line].fill, CODE_SIZE[size])}
      >
        {LINE_CODE[line]}
      </span>
      {hasLabel && (
        <span
          data-slot="topic-badge-label"
          className={cn(
            'inline-flex items-center border border-l-0 border-border bg-card font-medium text-foreground',
            LABEL_SIZE[size],
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
