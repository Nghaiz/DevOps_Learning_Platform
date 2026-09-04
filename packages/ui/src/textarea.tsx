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
        'min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground',
        'placeholder:text-muted-foreground',
        'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid && 'border-destructive focus-visible:ring-destructive',
        className,
      )}
      {...props}
    />
  );
}
