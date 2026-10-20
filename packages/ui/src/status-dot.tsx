import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

export type StatusDotTone = 'ok' | 'warn' | 'bad' | 'idle' | 'live';

export interface StatusDotProps extends Omit<ComponentProps<'span'>, 'children'> {
  readonly tone: StatusDotTone;
}

const TONE: Record<StatusDotTone, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-destructive',
  idle: 'bg-muted-foreground',
  live: 'bg-success animate-pulse',
};

/**
 * Chấm trạng thái 8px — một trong số ít thứ được TRÒN (design-brief §0.1: chấm
 * thì là chấm). `live` nhấp nháy, và đó là một trong hai chuyển động lặp vô
 * hạn được phép (§6); khối giảm chuyển động toàn cục tắt nó.
 *
 * Chấm chỉ truyền nghĩa bằng màu, nên nó PHẢI đứng cạnh chữ nói cùng trạng
 * thái (WCAG 1.4.1). Mặc định ẩn khỏi cây trợ năng; truyền `aria-label` khi
 * chấm đứng một mình, lúc đó nó mang `role="img"`.
 */
export function StatusDot({ tone, className, ...props }: StatusDotProps) {
  const labelled = props['aria-label'] !== undefined;
  return (
    <span
      data-slot="status-dot"
      data-tone={tone}
      role={labelled ? 'img' : undefined}
      aria-hidden={labelled ? undefined : true}
      className={cn('inline-block size-2 shrink-0 rounded-full', TONE[tone], className)}
      {...props}
    />
  );
}
