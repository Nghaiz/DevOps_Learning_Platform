'use client';

import type { ComponentProps } from 'react';
import { Label as RadixLabel } from 'radix-ui';
import { cn } from './cn.ts';

export type LabelProps = ComponentProps<typeof RadixLabel.Root>;

/** Radix Label — click vào label focus đúng control có `htmlFor` trùng `id`. */
export function Label({ className, ...props }: LabelProps) {
  return (
    <RadixLabel.Root
      data-slot="label"
      className={cn(
        'text-sm leading-none font-medium text-foreground',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
