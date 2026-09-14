import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn.ts';

export type AlertVariant = 'default' | 'warning' | 'destructive' | 'success';

/*
 * ĐÃ KIỂM khi thương hiệu chuyển sang đỏ (14.A, 2026-09-08) — KHÔNG đổi gì, và
 * đây là kết luận có số chứ không phải một chỗ bỏ qua.
 *
 * Quyết định #1 bắt tách `destructive` khỏi `primary` bằng hình dạng. Alert
 * KHÔNG dính vấn đề đó, vì hai lý do:
 *
 *   1. Không có biến thể alert nào tô nền `--primary` đặc — `default` là
 *      `bg-card`. Nên không có cặp nào để mà lẫn; cái phải tách ở `button.tsx`
 *      và `badge.tsx` là "nền primary đặc" vs "nền destructive đặc".
 *   2. `destructive` ở đây VỐN ĐÃ là dạng nhạt + viền, đúng hình dạng mà quyết
 *      định #1 yêu cầu — nó không phải sửa để đạt, nó đã đạt sẵn.
 *
 * Số đo lại với token mới (chữ `text-foreground` trên `bg-destructive/10`):
 * 16.56:1 nhánh sáng, 15.16:1 nhánh tối trên `--card` — dư xa 4.5. Icon
 * `text-destructive` trên chính nền nhạt đó: 3.99 sáng / 5.47 tối, đều ≥3 với
 * tư cách đồ hoạ phi-chữ (SC 1.4.11). Nhãn ở đây là `text-foreground` chứ
 * không phải `text-destructive`, nên nó KHÔNG chạm cái trần 4.7647:1 đã buộc
 * nút destructive phải bỏ tint — khác nhau vì alert đọc lâu còn nút thì liếc.
 *
 * Viền `/30` cố ý ở lại mức trang trí: ý nghĩa của alert do `role="alert"` và
 * tiêu đề mang, không do viền — nên nó thuộc ngoại lệ "pure decoration" của
 * SC 1.4.11, cùng lập luận đã ghi cho `--border` ở `docs/design-system.md` §1a.
 */
const alertVariants = cva(
  'relative grid grid-cols-[auto_1fr] gap-x-3 rounded-lg border p-4 text-sm',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground [&_svg]:text-foreground',
        warning: 'border-warning/30 bg-warning/10 text-foreground [&_svg]:text-warning',
        destructive:
          'border-destructive/30 bg-destructive/10 text-foreground [&_svg]:text-destructive',
        success: 'border-success/30 bg-success/10 text-foreground [&_svg]:text-success',
      } satisfies Record<AlertVariant, string>,
    },
    defaultVariants: { variant: 'default' },
  },
);

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

/** Alert headings follow their enclosing section, without changing their visual style. */
export function AlertTitle({
  as: Heading = 'h5',
  className,
  ...props
}: ComponentProps<'h5'> & { readonly as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' }) {
  return (
    <Heading
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
