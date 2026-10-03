'use client';

import type { ComponentProps } from 'react';
import { Tooltip as RadixTooltip } from 'radix-ui';
import { cn } from './cn.ts';

export const TooltipProvider = RadixTooltip.Provider;
export const Tooltip = RadixTooltip.Root;
export const TooltipTrigger = RadixTooltip.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof RadixTooltip.Content>) {
  return (
    <RadixTooltip.Portal>
      <RadixTooltip.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          /*
           * Khối mực đảo màu (design-brief §2.1). Viền `border-ink` không phải
           * trang trí: Windows High Contrast bỏ hẳn `box-shadow`, nên một lớp nổi
           * chỉ tách khỏi trang bằng bóng sẽ biến mất với người bật chế độ đó.
           *
           * Bo góc `control` chứ không `surface`: trong `.arena-root` của game
           * K8s hai biến này ra bo cũ, và tooltip cao 28px đeo bo 12px thì đọc
           * ra viên thuốc. Trong app cả hai là 0.
           */
          'z-50 max-w-xs rounded-control border border-ink bg-ink px-3 py-1.5 text-xs text-ink-foreground',
          'shadow-float animate-rise [animation-duration:var(--motion-fast)]',
          className,
        )}
        {...props}
      />
    </RadixTooltip.Portal>
  );
}
