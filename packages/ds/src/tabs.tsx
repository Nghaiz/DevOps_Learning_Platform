'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import { Tabs as RadixTabs, ToggleGroup as RadixToggle } from 'radix-ui';
import { cn } from './cn.ts';
import { Icon } from './icons/icon.tsx';
import type { IconName } from './icons/glyphs.ts';

/**
 * Tab trong trang. Kiểu `line`: chữ trên một đường kẻ, tab đang mở có vạch dưới
 * màu của mục (vạch giãn ra từ trái khi đổi tab). Kiểu `segment`: khay xám với
 * ô đang chọn nổi lên, dùng cho bộ chuyển nhỏ (chế độ xem, khoảng thời gian).
 */
export const Tabs = RadixTabs.Root;
export const TabsContent = forwardRef<
  ElementRef<typeof RadixTabs.Content>,
  ComponentPropsWithoutRef<typeof RadixTabs.Content>
>(function TabsContent({ className, ...rest }, ref) {
  return <RadixTabs.Content ref={ref} className={cn('outline-none', className)} {...rest} />;
});

export const TabsList = forwardRef<
  ElementRef<typeof RadixTabs.List>,
  ComponentPropsWithoutRef<typeof RadixTabs.List> & { readonly look?: 'line' | 'segment' }
>(function TabsList({ className, look = 'line', ...rest }, ref) {
  return (
    <RadixTabs.List
      ref={ref}
      data-look={look}
      className={cn(
        look === 'line'
          ? 'scroll-shadow-x relative flex items-end gap-5 overflow-x-auto border-b border-rule [scrollbar-width:none]'
          : 'inline-flex items-center gap-0.5 rounded-md bg-well-2 p-0.5',
        className,
      )}
      {...rest}
    />
  );
});

export const TabsTrigger = forwardRef<
  ElementRef<typeof RadixTabs.Trigger>,
  ComponentPropsWithoutRef<typeof RadixTabs.Trigger> & {
    readonly look?: 'line' | 'segment';
    readonly icon?: IconName;
    readonly count?: ReactNode;
  }
>(function TabsTrigger({ className, look = 'line', icon, count, children, ...rest }, ref) {
  return (
    <RadixTabs.Trigger
      ref={ref}
      className={cn(
        'group inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-focus',
        look === 'line'
          ? [
              'relative -mb-px h-10 text-ink-2 hover:text-ink data-[state=active]:font-medium data-[state=active]:text-ink',
              'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-acc-solid after:transition-transform after:duration-200 after:ease-out',
              'data-[state=active]:after:scale-x-100',
            ]
          : 'h-7 rounded-sm px-3 text-ink-2 hover:text-ink data-[state=active]:bg-paper data-[state=active]:text-ink data-[state=active]:shadow-lift',
        className,
      )}
      {...rest}
    >
      {icon === undefined ? null : <Icon name={icon} size={16} className="text-ink-3 group-data-[state=active]:text-acc-ink" />}
      {children}
      {count === undefined ? null : (
        <span className="rounded-full bg-well-2 px-1.5 text-xs tabular-nums text-ink-2 group-data-[state=active]:bg-acc-tint group-data-[state=active]:text-acc-ink">
          {count}
        </span>
      )}
    </RadixTabs.Trigger>
  );
});

// ── Segmented (chọn một) ────────────────────────────────────────────────────
export interface SegmentedOption<V extends string> {
  readonly value: V;
  readonly label: ReactNode;
  readonly icon?: IconName;
  readonly count?: ReactNode;
}

export interface SegmentedProps<V extends string> {
  readonly value: V;
  readonly onValueChange: (value: V) => void;
  readonly options: readonly SegmentedOption<V>[];
  readonly label: string;
  readonly className?: string;
  readonly size?: 'sm' | 'md';
}

export function Segmented<V extends string>({ value, onValueChange, options, label, className, size = 'md' }: SegmentedProps<V>) {
  return (
    <RadixToggle.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next !== '') onValueChange(next as V);
      }}
      aria-label={label}
      className={cn('inline-flex items-center gap-0.5 rounded-md bg-well-2 p-0.5', className)}
    >
      {options.map((option) => (
        <RadixToggle.Item
          key={option.value}
          value={option.value}
          className={cn(
            'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3 text-sm text-ink-2 transition-colors duration-150 hover:text-ink',
            'data-[state=on]:bg-paper data-[state=on]:font-medium data-[state=on]:text-ink data-[state=on]:shadow-lift',
            size === 'sm' ? 'h-7' : 'h-8',
          )}
        >
          {option.icon === undefined ? null : <Icon name={option.icon} size={16} />}
          {option.label}
          {option.count === undefined ? null : <span className="text-xs tabular-nums text-ink-3">{option.count}</span>}
        </RadixToggle.Item>
      ))}
    </RadixToggle.Root>
  );
}

// ── Chip lọc (chọn nhiều) ───────────────────────────────────────────────────
export interface ChipProps extends Omit<ComponentPropsWithoutRef<'button'>, 'onChange'> {
  readonly pressed: boolean;
  readonly onPressedChange: (pressed: boolean) => void;
  readonly icon?: IconName;
  /** Chip theo chủ đề: đặt `data-topic` ở chip để lấy màu chủ đề khi bật. */
  readonly topic?: string;
  /** Số mục khớp, khi trang biết số THẬT (danh sách nạp trọn). Trang phân trang thì bỏ trống. */
  readonly count?: number;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { pressed, onPressedChange, icon, topic, count, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      data-topic={topic}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm transition-[background-color,border-color,color] duration-150',
        topic === undefined
          ? 'border-rule-2 bg-paper text-ink-2 hover:border-control hover:text-ink aria-pressed:border-acc-mid aria-pressed:bg-acc-tint aria-pressed:text-acc-ink'
          : 'border-rule-2 bg-paper text-ink-2 hover:border-tp-mid hover:text-ink aria-pressed:border-tp-mid aria-pressed:bg-tp-tint aria-pressed:text-tp-ink',
        className,
      )}
      {...rest}
    >
      {icon === undefined ? null : (
        <Icon name={icon} size={16} tint={topic === undefined ? 'neutral' : 'topic'} className={topic === undefined ? undefined : 'text-tp-ink'} />
      )}
      {children}
      {count === undefined ? null : <span className="text-xs tabular-nums opacity-70">{count}</span>}
    </button>
  );
});
