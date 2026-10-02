import type { ComponentProps, MouseEventHandler, ReactNode } from 'react';
import { cn } from './cn.ts';

export type ChipSize = 'sm' | 'md';

export interface ChipProps extends Omit<ComponentProps<'button'>, 'onClick' | 'children'> {
  /** Đang chọn ⇒ khối mực đảo màu, và `aria-pressed="true"` cho trình đọc màn hình. */
  readonly selected?: boolean;
  readonly onClick: MouseEventHandler<HTMLButtonElement>;
  readonly children: ReactNode;
  /** Số mục khớp bộ lọc, in sau nhãn bằng chữ số cùng bề rộng. */
  readonly count?: number;
  readonly size?: ChipSize;
}

const SIZE: Record<ChipSize, string> = {
  sm: 'h-7 px-2.5',
  md: 'h-8 px-3',
};

/**
 * Chip lọc (design-brief §5): vuông, mono 12px, chọn = khối mực đảo màu.
 *
 * Là một nút BẬT/TẮT, nên trạng thái đi bằng `aria-pressed` chứ không bằng
 * màu: người dùng trình đọc màn hình nghe "đã nhấn", người mù màu thấy khối
 * đặc thay cho khung rỗng. `type="button"` mặc định để chip đặt trong `<form>`
 * không vô tình nộp form.
 */
export function Chip({
  selected = false,
  onClick,
  children,
  count,
  size = 'md',
  type = 'button',
  className,
  ...props
}: ChipProps) {
  return (
    <button
      data-slot="chip"
      data-selected={selected ? 'true' : undefined}
      type={type}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-control border font-mono text-xs whitespace-nowrap',
        'transition-[color,background-color,border-color,transform] duration-[var(--motion-fast)] ease-out outline-none',
        'motion-safe:active:translate-y-px',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        selected
          ? 'border-ink bg-ink text-ink-foreground'
          : 'border-border bg-card text-foreground hover:border-ink',
        SIZE[size],
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && (
        <span data-slot="chip-count" className="tabular-nums opacity-70">
          {count}
        </span>
      )}
    </button>
  );
}
