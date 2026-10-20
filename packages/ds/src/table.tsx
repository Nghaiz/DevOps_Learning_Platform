import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from './cn.ts';
import { Icon } from './icons/icon.tsx';

/**
 * Bảng dữ liệu: chỉ đường kẻ và căn lề. Tiêu đề cột chữ nhỏ màu xám, viết thường
 * đầu câu; số căn phải, chữ số đều rộng. Không sọc vằn, không dải nền tiêu đề.
 *
 * Khung bọc PHẢI `relative`: nhãn `sr-only` trong `<th>` là `position:absolute`, khung
 * tĩnh thì nó thoát vùng cuộn ngang và kéo cả trang trôi sang phải ở 390px.
 */
export function Table({ className, children, label }: { className?: string; children: ReactNode; label?: string }) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table aria-label={label} className={cn('w-full border-collapse text-sm', className)}>
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('[&_th]:border-b [&_th]:border-rule-2', className)} {...rest} />;
}

export function TBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child_td]:border-b-0', className)} {...rest} />;
}

export function TR({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors duration-150 hover:bg-acc-wash/70', className)} {...rest} />;
}

export function TH({
  className,
  numeric = false,
  sort,
  children,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; sort?: 'asc' | 'desc' }) {
  return (
    <th
      scope="col"
      aria-sort={sort === undefined ? undefined : sort === 'asc' ? 'ascending' : 'descending'}
      className={cn(
        'h-10 whitespace-nowrap px-3 text-xs font-medium text-ink-3',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...rest}
    >
      <span className={cn('inline-flex items-center gap-1', numeric && 'flex-row-reverse')}>
        {children}
        {sort === undefined ? null : <Icon name={sort === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} />}
      </span>
    </th>
  );
}

export function TD({ className, numeric = false, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        'border-b border-rule px-3 py-2.5 align-middle text-ink',
        numeric && 'text-right tabular-nums',
        className,
      )}
      {...rest}
    />
  );
}
