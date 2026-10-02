'use client';

import type { ComponentProps } from 'react';
import { Popover as RadixPopover } from 'radix-ui';
import { cn } from './cn.ts';

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;

/**
 * Lớp nổi neo vào trigger. Vuông, viền mực 1px, bóng cứng `shadow-float` — chỉ
 * lớp nổi mới có bóng (design-brief §5). `animate-rise` an toàn ở đây: Radix
 * định vị bằng `transform` trên phần tử BỌC ngoài, không phải trên chính
 * Content, nên keyframe animate `transform` không giành nhau với vị trí.
 */
export function PopoverContent({
  className,
  sideOffset = 6,
  align = 'start',
  ...props
}: ComponentProps<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        data-slot="popover-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 w-72 rounded-surface border border-ink bg-popover p-4 text-sm text-popover-foreground shadow-float outline-none',
          'animate-rise [animation-duration:var(--motion-base)]',
          className,
        )}
        {...props}
      />
    </RadixPopover.Portal>
  );
}
