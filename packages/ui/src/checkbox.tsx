'use client';

import type { ComponentProps } from 'react';
import { Checkbox as RadixCheckbox } from 'radix-ui';
import { Check } from 'lucide-react';
import { cn } from './cn.ts';

export function Checkbox({ className, ...props }: ComponentProps<typeof RadixCheckbox.Root>) {
  return (
    <RadixCheckbox.Root
      data-slot="checkbox"
      className={cn(
        'peer flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-background',
        'transition-colors outline-none',
        /*
         * Lúc TÍCH, ô là `bg-primary` — mà `--ring` = `--primary`, nên vòng
         * focus sát mặt ô cho 1.00:1: hộp kiểm đang được chọn là hộp kiểm KHÔNG
         * thấy được focus. Cùng cách sửa như Button (`ring-offset` đẩy vòng ra
         * khe màu nền); `ring-current` không dùng được ở đây vì lúc CHƯA tích ô
         * không đặt `text-*` nào, `currentColor` khi đó là màu thừa kế bất kỳ.
         */
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        className,
      )}
      {...props}
    >
      <RadixCheckbox.Indicator className="flex items-center justify-center text-current">
        <Check className="size-3.5" />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}
