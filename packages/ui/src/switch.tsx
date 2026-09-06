'use client';

import type { ComponentProps } from 'react';
import { Switch as RadixSwitch } from 'radix-ui';
import { cn } from './cn.ts';

export function Switch({ className, ...props }: ComponentProps<typeof RadixSwitch.Root>) {
  return (
    <RadixSwitch.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent',
        'bg-input transition-colors outline-none',
        /*
         * Lúc BẬT rãnh là `bg-primary`, mà `--ring` = `--primary`, nên vòng
         * focus vẽ sát mặt rãnh cho 1.00:1. Cùng một hỏng và cùng một cách sửa
         * như Button; chứng minh vô nghiệm token ghi đầy đủ ở button.tsx.
         */
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-primary',
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb
        className={cn(
          'pointer-events-none block size-4 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform',
          'data-[state=checked]:translate-x-[18px]',
        )}
      />
    </RadixSwitch.Root>
  );
}
