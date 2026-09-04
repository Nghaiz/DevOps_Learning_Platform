import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

/**
 * Khối chờ tải — caller đặt kích thước qua `className` (`h-4 w-32`,
 * `size-10 rounded-full`, …).
 *
 * `aria-hidden="true"` CỐ Ý: một danh sách 10 thẻ đang tải thì có 10
 * `<Skeleton>`, và mỗi cái tự xưng "Đang tải" sẽ làm trình đọc màn hình lặp
 * lại 10 lần cho MỘT sự kiện. Nơi gọi (danh sách/card bọc ngoài) chịu trách
 * nhiệm phát MỘT thông báo trạng thái duy nhất (`aria-busy`/`role="status"`
 * ở container), Skeleton ở đây thuần là tín hiệu THỊ GIÁC.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}
