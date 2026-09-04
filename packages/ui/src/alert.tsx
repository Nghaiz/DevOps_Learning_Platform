import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn.ts';

export type AlertVariant = 'default' | 'warning' | 'destructive' | 'success';

const alertVariants = cva('relative grid grid-cols-[auto_1fr] gap-x-3 rounded-lg border p-4 text-sm', {
  variants: {
    variant: {
      default: 'border-border bg-card text-card-foreground [&_svg]:text-foreground',
      warning: 'border-warning/30 bg-warning/10 text-foreground [&_svg]:text-warning',
      destructive: 'border-destructive/30 bg-destructive/10 text-foreground [&_svg]:text-destructive',
      success: 'border-success/30 bg-success/10 text-foreground [&_svg]:text-success',
    } satisfies Record<AlertVariant, string>,
  },
  defaultVariants: { variant: 'default' },
});

export interface AlertProps extends ComponentProps<'div'>, VariantProps<typeof alertVariants> {}

/** `role="alert"` chỉ đặt cho `destructive` — đây là mức nghiêm trọng duy nhất cần ngắt lời trình đọc màn hình. */
export function Alert({ variant, className, ...props }: AlertProps) {
  return (
    <div
      data-slot="alert"
      role={variant === 'destructive' ? 'alert' : undefined}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: ComponentProps<'h5'>) {
  return (
    <h5
      data-slot="alert-title"
      className={cn('col-start-2 leading-none font-medium', className)}
      {...props}
    />
  );
}

export function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
