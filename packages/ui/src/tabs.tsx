'use client';

import type { ComponentProps } from 'react';
import { Tabs as RadixTabs } from 'radix-ui';
import { cn } from './cn.ts';
import { SCROLL_REGION_FOCUS } from './lesson/scroll-region.ts';

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      data-slot="tabs-list"
      className={cn('inline-flex h-10 items-center gap-1 rounded-md bg-muted p-1', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex h-8 items-center justify-center rounded-sm px-3 text-sm font-medium whitespace-nowrap',
        'text-muted-foreground transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof RadixTabs.Content>) {
  return (
    <RadixTabs.Content
      data-slot="tabs-content"
      // ⚠ PANEL LÀ MỘT ĐIỂM DỪNG TAB, không phải một khối trơ. Radix render
      // `role="tabpanel"` KÈM `tabIndex: 0` (đọc `@radix-ui/react-tabs` dist —
      // `tabIndex: 0` nằm ngay cạnh `role: "tabpanel"`), đúng theo WAI-ARIA APG:
      // panel phải tới được bằng bàn phím khi nó không chứa control nào.
      //
      // Bản trước để `outline-none` mà KHÔNG có gì thay thế, nên người dùng bàn
      // phím Tab vào panel và màn hình không đổi một pixel — họ mất dấu con trỏ
      // giữa trang. Đo được trên cụm 2026-09-07, `/me`: "1 điểm dừng Tab KHÔNG
      // đổi gì trên màn hình khi nhận focus". Ba trang dùng `Tabs` (`/me`,
      // `/labs/:id`, `/author/:id`) đều dính, vì lỗi ở component chứ không ở
      // trang. `TabsTrigger` ngay bên trên đã có `focus-visible:ring-2` — chỉ
      // panel bị bỏ quên.
      //
      // Dùng `SCROLL_REGION_FOCUS` (outline vẽ VÀO TRONG) chứ không `ring-2`
      // như trigger: trên `/labs/:id` panel mang `min-h-0 flex-1
      // overflow-y-auto` trong một khoang flex, nên một vòng đẩy ra NGOÀI mép sẽ
      // bị cắt — đúng lý do `scroll-region.ts` chọn outline, và ở đó cũng có
      // phép đo tương phản của `--ring`.
      className={cn('mt-2 outline-none', SCROLL_REGION_FOCUS, className)}
      {...props}
    />
  );
}
