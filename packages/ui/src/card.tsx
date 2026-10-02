import type { ComponentProps, ReactElement } from 'react';
import { ARC_PATH_D, ARC_STROKE_HAIRLINE, ARC_VIEWBOX } from '@devops-platform/motion/motif';
import { cn } from './cn.ts';

/**
 * Cung màu độ khó. Ba hậu tố đầu khớp token `--difficulty-*` (xem lệch
 * `basic`/`beginner` ở `badge.tsx`).
 *
 * `'pending'` là độ khó **chưa biết** — khung chờ tải. Nó ở đây thay vì để nơi
 * gọi tự dựng một cung xám: hình học của cung (cỡ hộp, độ lệch, bậc nét, lớp
 * bọc cắt) do file này sở hữu, và một bản chép ở `catalog-grid.tsx` sẽ lệch
 * đúng vào lần sửa thứ hai — lúc đó khung chờ và thẻ thật không còn cùng hình,
 * mà bố cục nhảy khi dữ liệu về chính là thứ khung chờ sinh ra để chặn.
 */
export type CardAccent = 'basic' | 'intermediate' | 'advanced' | 'pending';

const ACCENT_CLASS: Record<CardAccent, string> = {
  basic: 'text-difficulty-basic',
  intermediate: 'text-difficulty-intermediate',
  advanced: 'text-difficulty-advanced',
  pending: 'text-muted',
};

/**
 * Cung màu ở GÓC thẻ — design §3 ("thẻ danh mục: một cung màu ở góc thay cho
 * viền trái phẳng"). Thay cho `border-l-4 border-l-difficulty-*` của bản trước.
 *
 * ## Ba con số, ba lý do
 *
 * - **`ARC_STROKE_HAIRLINE` (2px)** — §8.2 của `motif.ts` gán thẳng bậc nét
 *   này cho "cung nhỏ ở góc thẻ danh mục". Nó MỎNG hơn dải 4px cũ, và đó là
 *   một mất mát thị giác có thật; bù lại `Badge` độ khó trong cùng thẻ mới là
 *   thứ mang nghĩa cho SC 1.4.1, dải màu một mình chưa bao giờ đủ (§4d).
 * - **`size-14` (56px) lệch `-top-7 -left-7` (28px)** — cung chỉ lộ ra một
 *   phần tư dưới-phải của vòng, ôm đúng góc trên-trái. Với hộp 56px, đường
 *   cung nằm trong khoảng 4.5..51.5 của `viewBox` 100 nên phần nhìn thấy kéo
 *   tới ~23px, tức vừa đủ nằm trong lề `p-5`/`p-6` của thẻ và KHÔNG cắt ngang
 *   chữ. Nới hộp to hơn là đẩy cung vào dưới tiêu đề.
 * - **`overflow-hidden` ở lớp bọc, KHÔNG ở `Card`** — cung phải bị cắt theo
 *   mép thẻ, nhưng `Card` mà `overflow-hidden` thì mọi vòng focus
 *   và popover bên trong nó cũng bị cắt theo. Lớp bọc tuyệt đối gánh việc cắt;
 *   `Card` giữ nguyên `overflow` mặc định.
 *
 * `pointer-events-none` vì lớp bọc phủ TOÀN BỘ thẻ (`inset-0`): thiếu nó thì
 * nó nuốt mọi cú bấm vào thẻ — và `CatalogCard` là một `<Link>` bọc ngoài, nên
 * lỗi đó sẽ giết đúng đường đi chính của lưới danh mục.
 */
function CardAccentArc({ accent }: { readonly accent: CardAccent }): ReactElement {
  return (
    <span
      data-slot="card-accent"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <svg
        viewBox={ARC_VIEWBOX}
        role="presentation"
        className={cn('absolute -top-7 -left-7 size-14', ACCENT_CLASS[accent])}
      >
        <path
          d={ARC_PATH_D}
          fill="none"
          stroke="currentColor"
          strokeWidth={ARC_STROKE_HAIRLINE}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}

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
  /** Cung màu độ khó ở góc trên-trái. Bỏ trống ⇒ không có cung. */
  readonly accent?: CardAccent;
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
 */
export function Card({ interactive = false, accent, className, children, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      data-interactive={interactive ? 'true' : undefined}
      data-accent={accent}
      className={cn(
        // `relative` là điều kiện sống của cung góc: `CardAccentArc` định vị
        // tuyệt đối theo thẻ. Không có nó, cung neo vào tổ tiên định vị gần
        // nhất — một thứ KHÁC NHAU ở mỗi nơi gọi, và hỏng im lặng.
        'relative border border-border bg-card p-6 text-card-foreground',
        'transition-[background-color,transform,border-color] duration-[var(--motion-base)] ease-out',
        interactive && ['hover:border-ink hover:bg-muted/40', 'motion-safe:active:translate-y-px'],
        className,
      )}
      {...props}
    >
      {accent !== undefined && <CardAccentArc accent={accent} />}
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
