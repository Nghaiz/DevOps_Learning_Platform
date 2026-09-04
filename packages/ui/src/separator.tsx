'use client';

import type { ComponentProps, HTMLAttributes } from 'react';
import { Separator as RadixSeparator } from 'radix-ui';
import { cn } from './cn.ts';

/**
 * `Separator` (Radix, ranh giới ngữ nghĩa `role="separator"`/`aria-orientation`)
 * và `Kbd` (phím tắt hiển thị, ví dụ "Esc Esc để rời terminal" — D10) sống
 * chung một file: cả hai là primitive TRÌNH BÀY thuần không có trạng thái
 * loading/empty/error/disabled (checklist ghi "n/a" cho cả hai trong
 * `docs/design-system.md`), và gộp một file test cho cả hai đúng ngưỡng
 * rule-of-two của `code-conventions.md` § No Duplicated Logic — tách hai file
 * cho hai component vài dòng mỗi cái không hiển gì thêm.
 */
export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: ComponentProps<typeof RadixSeparator.Root>) {
  return (
    <RadixSeparator.Root
      data-slot="separator"
      orientation={orientation}
      decorative={decorative}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1',
        'font-mono text-xs text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
