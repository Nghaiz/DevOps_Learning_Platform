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
 *
 * ── Hiệu ứng: gradient + `animate-pulse`, KHÔNG phải một quét shimmer thật ──
 *
 * Một shimmer quét trái→phải cần một `@keyframes` dịch `background-position`.
 * Keyframe đó phải sống trong CSS, mà CSS của dự án là
 * `apps/web/src/app/globals.css` — file của lane khác, và `packages/ui` không
 * có stylesheet nào của riêng nó (class ở đây do `@source` của apps/web biên
 * dịch). Viết sẵn `animate-[shimmer_1.6s_infinite]` để chờ keyframe đó là ĐỔI
 * một hiệu ứng đang chạy lấy MỘT KHẢ NĂNG HỎNG IM LẶNG: nếu keyframe không bao
 * giờ về, `animate-pulse` đã bị thay mất và khối chờ đứng chết trân, không lỗi
 * build, không lỗi runtime.
 *
 * Nên ở đây dùng thứ chắc chắn có: `animate-pulse` (keyframe dựng sẵn của
 * Tailwind) chồng lên một dải gradient bằng token — nhịp thở đi qua một mặt
 * không phẳng, gần shimmer hơn hẳn khối xám cũ. Muốn quét thật thì thêm vào
 * `globals.css`:
 *
 *     @theme { --animate-shimmer: shimmer 1.6s linear infinite; }
 *     @keyframes shimmer { from { background-position: 200% 0 } to { background-position: -200% 0 } }
 *
 * rồi ở đây đổi `animate-pulse` → `animate-shimmer` và thêm `bg-[size:200%_100%]`.
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
        'animate-pulse rounded-md',
        'bg-muted bg-linear-to-r from-muted via-muted-foreground/10 to-muted',
        className,
      )}
      {...props}
    />
  );
}
