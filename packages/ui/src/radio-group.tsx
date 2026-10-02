'use client';

import type { ComponentProps } from 'react';
import { RadioGroup as RadixRadioGroup } from 'radix-ui';
import { cn } from './cn.ts';

export function RadioGroup({ className, ...props }: ComponentProps<typeof RadixRadioGroup.Root>) {
  return (
    <RadixRadioGroup.Root data-slot="radio-group" className={cn('flex flex-col gap-2', className)} {...props} />
  );
}

export function RadioGroupItem({ className, ...props }: ComponentProps<typeof RadixRadioGroup.Item>) {
  return (
    <RadixRadioGroup.Item
      data-slot="radio-group-item"
      className={cn(
        // Nút radio GIỮ hình tròn: đó là một quy ước chuẩn để phân biệt "chọn
        // một" với "chọn nhiều" (ô vuông của Checkbox). Nét mực 1.5px.
        'flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink bg-card',
        'transition-colors duration-[var(--motion-fast)] ease-out outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',

        className,
      )}
      {...props}
    >
      <RadixRadioGroup.Indicator className="flex items-center justify-center">
        <span className="size-2 rounded-full bg-ink" />
      </RadixRadioGroup.Indicator>
    </RadixRadioGroup.Item>
  );
}
