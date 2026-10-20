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
        /*
         * `text-base sm:text-sm`: dưới 640px chữ 16px để Safari iOS không tự
         * phóng to trang khi ô nhận focus (design-brief §2.6). Từ `sm` trở lên
         * về `text-sm` như cũ — game K8s chỉ chạy ở màn rộng nên bố cục của nó
         * không đổi.
         */
        'h-10 w-full rounded-control border border-input bg-card px-3 text-base text-foreground sm:text-sm',
        'placeholder:text-muted-foreground',
        // Focus: viền chuyển sang mực + vòng ring (design-brief §5).
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
