'use client';

import type { ComponentProps } from 'react';
import { DropdownMenu as RadixDropdownMenu } from 'radix-ui';
import { cn } from './cn.ts';

export const DropdownMenu = RadixDropdownMenu.Root;
export const DropdownMenuTrigger = RadixDropdownMenu.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof RadixDropdownMenu.Content>) {
  return (
    <RadixDropdownMenu.Portal>
      {/*
        Portal gắn vào <body>, ngoài `.legacy-skin` của màn chơi, nên token của legacy.css không tới.
        Bọc trong một khung `contents` mang lại phạm vi đó; KHÔNG gắn lớp lên chính nội dung: quy tắc
        `.legacy-skin { color; font-family }` nằm ngoài @layer và sẽ đè lớp chữ của nó.
      */}
      <div className="legacy-skin contents">
        <RadixDropdownMenu.Content
          data-slot="dropdown-menu-content"
          sideOffset={sideOffset}
          className={cn(
            // Lớp nổi: vuông, viền mực, bóng cứng `shadow-float` (design-brief §5).
            'z-50 min-w-[10rem] overflow-hidden rounded-surface border border-ink bg-popover p-1 text-popover-foreground',
            'shadow-float animate-rise [animation-duration:var(--motion-fast)]',
            className,
          )}
          {...props}
        />
      </div>
    </RadixDropdownMenu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof RadixDropdownMenu.Item>) {
  return (
    <RadixDropdownMenu.Item
      data-slot="dropdown-menu-item"
      className={cn(
        'relative flex cursor-default items-center gap-2 rounded-control px-2 py-2 text-sm outline-none select-none',
        'focus:bg-muted focus:text-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof RadixDropdownMenu.Separator>) {
  return (
    <RadixDropdownMenu.Separator
      data-slot="dropdown-menu-separator"
      className={cn('my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof RadixDropdownMenu.Label>) {
  return (
    <RadixDropdownMenu.Label
      data-slot="dropdown-menu-label"
      className={cn('px-2 py-1.5 type-label text-muted-foreground', className)}
      {...props}
    />
  );
}
