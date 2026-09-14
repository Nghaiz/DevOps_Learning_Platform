import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

/**
 * `<table>` luôn bọc trong `overflow-x-auto` — bảng nhiều cột trên màn hẹp cuộn
 * ngang thay vì tràn/vỡ layout.
 *
 * ⛔ `relative` KHÔNG phải trang trí. Bỏ nó ra là trang lại tràn ngang, theo một
 * đường mà chú thích cũ ở đây không ngờ tới.
 *
 * `overflow-x-auto` chỉ cắt được những hậu duệ mà khối này LÀ containing block
 * của chúng. Một hậu duệ `position:absolute` lấy containing block là ancestor
 * ĐƯỢC ĐỊNH VỊ gần nhất; chuỗi cha không có cái nào thì nó rơi về initial
 * containing block — tức thoát hẳn vùng cắt, và kéo dài `scrollWidth` của cả
 * tài liệu. `relative` là thứ duy nhất kéo nó trở lại.
 *
 * Đây không phải lo xa. `sr-only` của Tailwind LÀ `position:absolute` (đọc
 * `getComputedStyle` để chắc, không suy từ tên lớp), và một `<th>` chỉ chứa
 * `<span class="sr-only">` là cách chuẩn đặt tên cho cột nút bấm —
 * `apps/web/src/components/me/active-sessions.tsx` làm đúng thế.
 *
 * Số đo trên `/me` ở khung 390px (2026-09-13), đọc
 * `document.documentElement.scrollWidth`:
 *
 * | trạng thái | đo được |
 * |---|---|
 * | nguyên trạng, không `relative` | **698** |
 * | ẩn mọi `.sr-only` | 390 |
 * | thêm `position:relative` cho khối này | 390 |
 *
 * Bảng rộng 762px vẫn cuộn trong khung đúng như thiết kế. Thứ lọt ra ngoài chỉ
 * là cái nhãn ẩn rộng 1px, và một mình nó đẩy cả trang trôi ngang 308px.
 */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b [&_tr]:border-border', className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('border-b border-border transition-colors duration-[var(--motion-fast)] ease-out hover:bg-muted/50', className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground whitespace-nowrap',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return (
    <td data-slot="table-cell" className={cn('p-3 align-middle text-foreground', className)} {...props} />
  );
}

export function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-3 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
