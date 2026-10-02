import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

/**
 * Khối chờ tải — caller đặt kích thước qua `className` (`h-4 w-32`,
 * `size-10`, …).
 *
 * `aria-hidden="true"` CỐ Ý: một danh sách 10 thẻ đang tải thì có 10
 * `<Skeleton>`, và mỗi cái tự xưng "Đang tải" sẽ làm trình đọc màn hình lặp
 * lại 10 lần cho MỘT sự kiện. Nơi gọi (danh sách/card bọc ngoài) chịu trách
 * nhiệm phát MỘT thông báo trạng thái duy nhất (`aria-busy`/`role="status"`
 * ở container), Skeleton ở đây thuần là tín hiệu THỊ GIÁC.
 *
 * ── Hiệu ứng: khối phẳng + `animate-pulse` ─────────────────────────────────
 *
 * Bản dựng lại cấm gradient làm thẩm mỹ (design-brief §2.7), nên dải gradient
 * cũ bị gỡ: khối chờ là một ô `bg-muted` vuông thở bằng `animate-pulse`
 * (keyframe dựng sẵn của Tailwind, chắc chắn có mặt). Hình dạng mới là thứ
 * mang thông tin — khung chờ của danh sách dựng theo đúng hình dòng bảng tuyến
 * (`BoardSkeleton` ở apps/web), không phải một vệt sáng chạy ngang.
 *
 * ⚠ KHÔNG có `motion-reduce:*` ở đây, và đó là chủ ý. Khối
 * `@media (prefers-reduced-motion: reduce)` ở cuối `globals.css` hạ
 * `animation-duration` xuống 0.01ms + `animation-iteration-count: 1` bằng bộ
 * chọn phổ quát kèm `!important`, cho MỌI phần tử — nhịp đập này đã tắt sẵn.
 * Lane nền khai một lần ở đó để không lane nào phải tự nhớ; khai lại trong
 * từng component là dựng cơ chế thứ hai cho cùng một bảo đảm, rồi hai cái trôi
 * khác nhau. Muốn kiểm thì kiểm ở `globals.css`, không phải ở đây.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        'animate-pulse bg-muted',
        className,
      )}
      {...props}
    />
  );
}
