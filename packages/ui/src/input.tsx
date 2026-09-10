import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

export interface InputProps extends ComponentProps<'input'> {
  /** `true` ⇒ `aria-invalid` + viền destructive. Không tự hiện thông báo lỗi — dùng cạnh `ErrorState`/text lỗi riêng. */
  readonly invalid?: boolean;
}

export function Input({ className, invalid = false, ...props }: InputProps) {
  return (
    <input
      data-slot="input"
      aria-invalid={invalid || undefined}
      className={cn(
        'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground',
        'placeholder:text-muted-foreground',
        'outline-none transition-colors duration-[var(--motion-fast)] ease-out focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid && 'border-destructive focus-visible:ring-destructive',
        className,
      )}
      {...props}
    />
  );
}
