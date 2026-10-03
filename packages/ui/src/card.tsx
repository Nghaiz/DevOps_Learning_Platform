import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

export interface CardProps extends ComponentProps<'div'> {
  /**
   * `true` ⇒ viền chuyển sang mực + nền ngả muted khi rê chuột, lún 1px khi nhấn.
   *
   * ⚠ MẶC ĐỊNH `false`, và đó là một quyết định chứ không phải sự dè dặt: phản
   * hồi hover là tín hiệu “bấm được”. Đặt nó lên một tấm bảng tĩnh (thẻ “Sức
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
}

/**
 * Tấm phẳng (design-brief §0.1, hợp đồng ui-kit §B): vuông, KHÔNG bóng, viền
 * hairline, nền `bg-card`. "Thẻ" kiểu hộp trắng nổi trên nền xám là thứ bản
 * dựng lại cấm; `Card` còn được export để nơi gọi cũ không vỡ, nhưng trang mới
 * nên dùng page pattern (Board, Split, Section) thay vì xếp thẻ.
 *
 * `interactive` không nhấc thẻ lên nữa — nhấc + bóng là ngôn ngữ của thẻ nổi.
 * Phản hồi bấm được nay là viền chuyển sang MỰC và nền ngả muted, cộng một cú
 * lún 1px khi nhấn. Lún nằm sau `motion-safe:`: khối
 * `@media (prefers-reduced-motion)` toàn cục chỉ hạ `transition-duration`, nó
 * không gỡ `translate`, nên thiếu `motion-safe` thì thẻ vẫn giật, chỉ là giật
 * ngay lập tức.
 *
 * Cung màu độ khó ở góc (prop `accent`) đã gỡ ngày 2026-10-03 (review-1 #23):
 * không nơi gọi nào dùng, nó đọc token độ khó cũ và vẽ một cung tròn, trái với
 * luật góc vuông và màu tuyến của bản dựng lại. Màu theo chủ đề nay đi qua
 * `LINE_CLASSES` của `lines.ts`.
 */
export function Card({ interactive = false, className, children, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      data-interactive={interactive ? 'true' : undefined}
      className={cn(
        // `relative`: giữ để hậu duệ định vị tuyệt đối của nơi gọi neo vào thẻ,
        // không trôi về một tổ tiên khác nhau ở mỗi chỗ dùng.
        'relative border border-border bg-card p-6 text-card-foreground',
        'transition-[background-color,transform,border-color] duration-[var(--motion-base)] ease-out',
        interactive && ['hover:border-ink hover:bg-muted/40', 'motion-safe:active:translate-y-px'],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Vùng đầu thẻ — dùng khi cần bọc `CardTitle` + `CardDescription` + hành động cạnh nhau. */
export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('mb-4 flex flex-col gap-1.5', className)}
      {...props}
    />
  );
}

/** Choose heading semantics from the surrounding page; keep presentation independent. */
export function CardTitle({
  as: Heading = 'h3',
  className,
  ...props
}: ComponentProps<'h3'> & { readonly as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' }) {
  return (
    <Heading
      data-slot="card-title"
      className={cn('type-title text-foreground', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn(className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('mt-4 flex items-center gap-2', className)}
      {...props}
    />
  );
}
