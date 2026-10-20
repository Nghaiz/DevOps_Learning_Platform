'use client';

import { Group, Panel, Separator, useDefaultLayout, useGroupRef, usePanelRef, type GroupProps, type PanelProps } from 'react-resizable-panels';
import { cn } from './cn.ts';

/**
 * Khoang chia kéo được (react-resizable-panels v4). Dùng cho khu thực hành:
 * hướng dẫn | terminal/IDE, và IDE / terminal khi xếp dọc.
 *
 * Nhớ bố cục bằng `useDefaultLayout` (localStorage): bố cục đúng ngay lượt vẽ đầu,
 * không đọc trong effect rồi nhảy như bản cũ.
 */
export { useDefaultLayout, useGroupRef, usePanelRef };
export type { GroupProps as PaneGroupProps, PanelProps as PaneProps };

export function PaneGroup({ className, ...rest }: GroupProps) {
  return <Group className={cn('h-full w-full', className)} {...rest} />;
}

export function Pane({ className, ...rest }: PanelProps) {
  return <Panel className={cn('min-h-0 min-w-0', className)} {...rest} />;
}

/**
 * Tay nắm giữa hai khoang. Vùng bấm rộng 9px, nét nhìn thấy 1px; rê vào hoặc kéo
 * thì nét đậm lên màu của mục. Bàn phím: mũi tên đổi cỡ, Home/End về biên.
 */
export function PaneHandle({ orientation = 'horizontal', label, className }: { orientation?: 'horizontal' | 'vertical'; label: string; className?: string }) {
  const vertical = orientation === 'vertical';
  return (
    <Separator
      aria-label={label}
      className={cn(
        'group relative flex shrink-0 items-center justify-center bg-transparent outline-none',
        vertical ? 'h-[9px] w-full -my-1' : 'h-full w-[9px] -mx-1',
        'z-10',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none bg-rule transition-[background-color,transform] duration-150',
          vertical ? 'h-px w-full' : 'h-full w-px',
          'group-data-[separator=hover]:bg-acc-mid group-data-[separator=active]:bg-acc-solid group-data-[separator=focus]:bg-focus',
          vertical
            ? 'group-data-[separator=active]:scale-y-[3] group-data-[separator=focus]:scale-y-[3] group-data-[separator=hover]:scale-y-[2]'
            : 'group-data-[separator=active]:scale-x-[3] group-data-[separator=focus]:scale-x-[3] group-data-[separator=hover]:scale-x-[2]',
        )}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute rounded-full bg-control opacity-0 transition-opacity duration-150 group-data-[separator=hover]:opacity-100 group-data-[separator=active]:opacity-100',
          vertical ? 'h-1 w-8' : 'h-8 w-1',
        )}
      />
    </Separator>
  );
}
