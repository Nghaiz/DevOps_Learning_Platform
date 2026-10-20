import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

export interface TextareaProps extends ComponentProps<'textarea'> {
  /** `true` ⇒ `aria-invalid` + viền destructive. */
  readonly invalid?: boolean;
}

export function Textarea({ className, invalid = false, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      aria-invalid={invalid || undefined}
      className={cn(
        // `text-base sm:text-sm`: cùng lý do chống phóng to iOS như `input.tsx`.
        'min-h-20 w-full rounded-control border border-input bg-card px-3 py-2 text-base text-foreground sm:text-sm',
        'placeholder:text-muted-foreground',
        'outline-none transition-colors duration-[var(--motion-fast)] ease-out hover:border-ink',
        'focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid && 'border-destructive focus-visible:ring-destructive',
        className,
      )}
      {...props}
    />
  );
}
