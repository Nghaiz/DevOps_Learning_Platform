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
           * `border border-border` KHÔNG phải trang trí: hợp đồng §6 cấm dùng
           * bóng làm cơ chế tương phản duy nhất, vì Windows High Contrast bỏ
           * hẳn `box-shadow` — một mặt nổi chỉ tách khỏi nền bằng bóng thì biến
           * mất với người bật chế độ đó. Tooltip này còn tách bằng MÀU (mặt đảo
           * `bg-foreground` trên `bg-background` = 10.83:1), nên viền là lớp
           * bảo hiểm thứ hai chứ không phải lớp duy nhất.
           *
           * `rounded-md` chứ không `rounded-lg`: tooltip cao 28px, một bo góc
           * 12px trên một hộp cao 28px đọc ra gần như viên thuốc. Thang §5 xếp
           * nó cùng bậc với nút/ô nhập.
           */
          'z-50 rounded-md border border-border bg-foreground px-3 py-1.5 text-xs text-background',
          'shadow-elevation-3',
          className,
        )}
        {...props}
      />
    </RadixTooltip.Portal>
  );
}
