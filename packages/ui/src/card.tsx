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
 *   góc bo `rounded-lg`, nhưng `Card` mà `overflow-hidden` thì mọi vòng focus
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
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
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
  /** Cung màu độ khó ở góc trên-trái. Bỏ trống ⇒ không có cung. */
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
        'relative rounded-lg border border-border bg-card p-6 text-card-foreground',
        'shadow-elevation-1',
        'transition-[box-shadow,transform,border-color] duration-[var(--motion-base)] ease-out',
        interactive && [
          'hover:border-input hover:shadow-elevation-2',
          'motion-safe:hover:-translate-y-0.5',
        ],
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
      className={cn('text-lg font-semibold text-foreground', className)}
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
