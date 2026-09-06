import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

/** Dải màu độ khó. Hậu tố khớp token `--difficulty-*` (xem lệch `basic`/`beginner` ở `badge.tsx`). */
export type CardAccent = 'basic' | 'intermediate' | 'advanced';

const ACCENT_CLASS: Record<CardAccent, string> = {
  basic: 'border-l-4 border-l-difficulty-basic',
  intermediate: 'border-l-4 border-l-difficulty-intermediate',
  advanced: 'border-l-4 border-l-difficulty-advanced',
};

export interface CardProps extends ComponentProps<'div'> {
  /**
   * `true` ⇒ nhấc nhẹ + đổi sang `--elevation-2` khi rê chuột.
   *
   * ⚠ MẶC ĐỊNH `false`, và đó là một quyết định chứ không phải sự dè dặt: hiệu
   * ứng nhấc là tín hiệu “bấm được”. Đặt nó lên một tấm bảng tĩnh (thẻ “Sức
   * chứa” ở `admin/overview-client.tsx`, khung đăng nhập ở `login/login-form.tsx`)
   * là hứa một hành động không tồn tại — người dùng bấm và không có gì xảy ra.
   *
   * Nơi PHẢI bật: thẻ nằm trong `<Link>` — `CatalogCard`
   * (`apps/web/src/components/catalog/catalog-grid.tsx`) là chỗ duy nhất hiện
   * nay, và chừng nào nó chưa truyền `interactive` thì lưới danh mục vẫn không
   * có hover. Đây là một prop opt-in nên việc bỏ sót là IM LẶNG — ghi ở đây để
   * lần đọc sau không phải tự phát hiện.
   */
  readonly interactive?: boolean;
  /** Dải màu độ khó ở viền trái. Bỏ trống ⇒ không có dải. */
  readonly accent?: CardAccent;
}

/**
 * Bóng dùng `shadow-elevation-1|2` — tiện ích do namespace `--shadow-*` trong
 * `@theme inline` của `globals.css` sinh ra. Lane nền quy định thẳng ở đó:
 * KHÔNG viết `shadow-[var(--elevation-1)]`, vì dạng arbitrary bỏ qua bảng
 * theme nên mỗi chỗ gọi lại tự chọn bậc — đúng thứ mà ba bậc ngữ nghĩa sinh ra
 * để chặn. `shadow-sm` cũ bị GỠ chứ không để chồng lên (xem cảnh báo dưới).
 *
 * ⚠ `tailwind-merge` KHÔNG khử được trùng cho họ class này — đã đo:
 *
 *     twMerge('shadow-sm shadow-elevation-1')      → cả hai cùng sống
 *     twMerge('shadow-elevation-1 shadow-none')    → cả hai cùng sống
 *
 * Lý do: cấu hình mặc định của `tailwind-merge` chỉ biết thang bóng dựng sẵn
 * (`sm`/`md`/`lg`/…); `elevation-1` không phải cỡ áo phông nên nó rơi xuống
 * nhóm *shadow-COLOR*, và một "màu" thì không xung đột với một "bóng". Hệ quả:
 * nơi gọi truyền `className="shadow-none"` sẽ TƯỞNG đã tắt bóng mà thực ra
 * không — thứ tự nguồn CSS quyết định, không phải ý định. Vì vậy ở đây phát ra
 * ĐÚNG MỘT class bóng cho mỗi trạng thái (nghỉ / hover là hai modifier khác
 * nhau nên không đụng nhau). Sửa tận gốc là dạy `cn.ts` biết nhóm này qua
 * `extendTailwindMerge({ extend: { classGroups: { shadow: [{ shadow: ['elevation-1','elevation-2','elevation-3'] }] } } })`
 * — `cn.ts` không thuộc lane này nên chỉ ghi lại, không tự sửa.
 *
 * Chuyển động dùng `motion-safe:` chứ không phải `motion-reduce:…-0` để đè
 * lại: hai luật cùng độ đặc hiệu thì THỨ TỰ NGUỒN quyết định, mà thứ tự đó do
 * bộ sắp biến thể của Tailwind định — đè có điều kiện vào thứ mình không kiểm
 * soát. Với `motion-safe` thì dưới `prefers-reduced-motion: reduce` luật đơn
 * giản không tồn tại, không có gì phải thắng.
 *
 * Và nó CẦN nằm ở đây, không thừa so với khối `@media (prefers-reduced-motion)`
 * toàn cục ở cuối `globals.css`: khối đó hạ `transition-duration`/
 * `animation-duration` xuống 0.01ms, tức nó làm chuyển động TỨC THÌ chứ không
 * gỡ `translate` đi. Không có `motion-safe`, thẻ vẫn GIẬT nảy lên khi rê chuột,
 * chỉ là nảy ngay lập tức. `duration-[var(--motion-base)]` thì ngược lại —
 * dạng arbitrary vì `--motion-*` cố ý KHÔNG có ánh xạ `@theme inline` nào.
 */
export function Card({ interactive = false, accent, className, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      data-interactive={interactive ? 'true' : undefined}
      className={cn(
        'rounded-lg border border-border bg-card p-6 text-card-foreground',
        'shadow-elevation-1',
        'transition-[box-shadow,transform,border-color] duration-[var(--motion-base)] ease-out',
        interactive && ['hover:border-input hover:shadow-elevation-2', 'motion-safe:hover:-translate-y-0.5'],
        accent !== undefined && ACCENT_CLASS[accent],
        className,
      )}
      {...props}
    />
  );
}

/** Vùng đầu thẻ — dùng khi cần bọc `CardTitle` + `CardDescription` + hành động cạnh nhau. */
export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('mb-4 flex flex-col gap-1.5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 data-slot="card-title" className={cn('text-lg font-semibold text-foreground', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn(className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="card-footer" className={cn('mt-4 flex items-center gap-2', className)} {...props} />
  );
}
