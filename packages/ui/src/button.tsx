import { Fragment, type ComponentProps } from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn.ts';
import { Spinner } from './spinner.tsx';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap',
    'transition-colors outline-none',
    /*
     * `ring-offset-2` và `ring-offset-background` đi CÙNG NHAU, không tách được.
     *
     * Offset tồn tại vì `--ring` = `--primary` theo đúng thiết kế, nên vòng
     * focus vẽ SÁT mặt nút primary cho đúng 1.00:1 — vô hình, ở cả hai theme
     * (nút destructive: 1.09 sáng / 1.00 tối). Và KHÔNG màu nào sửa được bằng
     * token: ở chế độ tối `--primary` chỉ cách `--card` 6.20:1, mà đạt 3:1 với
     * CẢ HAI thì cần khe ≥9:1 — quét vét cạn thang độ chói cho 0 nghiệm (trắng
     * tinh chỉ được 2.89:1 với `--primary` tối). Offset đẩy vòng focus ra ngoài
     * một khe 2px màu nền, nên màu KỀ nó là `--background`/`--card` — cặp đã
     * được gác sẵn ở `theme/tokens.contract.test.ts` (5.17 sáng / 6.85 tối).
     *
     * Thiếu `ring-offset-background` thì Tailwind rơi về mặc định của chính nó,
     * `--tw-ring-offset-color: #fff` (đo trong tailwindcss/dist/lib.js): khe
     * TRẮNG trên nền tối — vừa sai màu, vừa tự đẻ ra một ranh giới không ai
     * chọn. Hai class này vì vậy được gác CÙNG NHAU ở button.test.tsx.
     */
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'bg-transparent hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        link: 'bg-transparent text-primary underline-offset-4 hover:underline',
      } satisfies Record<ButtonVariant, string>,
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-11 px-6',
        icon: 'size-10 p-0',
      } satisfies Record<ButtonSize, string>,
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends Omit<ComponentProps<'button'>, 'color'>,
    VariantProps<typeof buttonVariants> {
  /** Radix Slot — render component con làm root thay vì `<button>` (vd. `<a>` có kiểu nút). */
  readonly asChild?: boolean;
  /** `true` ⇒ disable + hiện Spinner đè giữa, GIỮ NGUYÊN bề rộng nút (children vẫn render, chỉ ẩn màu). */
  readonly loading?: boolean;
}

/**
 * Primitive dùng chung — không tự "use client", component gọi nó tự quyết định.
 *
 * `ref` là một prop THƯỜNG (không `forwardRef`) — React 19 chuyển ref sang cơ
 * chế prop chuẩn cho component hàm; `ComponentProps<'button'>` đã bao gồm nó,
 * và spread `{...props}` xuống `<Comp>` là đủ để DOM node thật nhận được ref
 * (Radix `Slot` khi `asChild` cũng merge ref theo đúng cơ chế này).
 */
export function Button(props: ButtonProps) {
  const { variant, size, asChild = false, loading = false, disabled, className, children, ...rest } = props;
  const Comp = asChild ? Slot.Root : 'button';
  const isDisabled = disabled === true || loading;

  return (
    <Comp
      data-slot="button"
      className={cn(
        buttonVariants({ variant, size }),
        /*
         * `text-transparent` CHỈ ở nhánh nút thường. Nó tồn tại để giấu nhãn
         * ĐẰNG SAU Spinner đè lên — mà Spinner chỉ được render ở nhánh đó
         * (xem chú thích single-child bên dưới). Áp nó khi `asChild` cho ra
         * một liên kết chữ tàng hình KHÔNG có gì thay thế: đo được bằng
         * `tailwind-merge` nuốt mất `text-primary-foreground`, và
         * `document.querySelectorAll('svg.animate-spin').length === 0`.
         */
        !asChild && loading && 'relative text-transparent',
        /*
         * `disabled` là THUỘC TÍNH CHỈ CÓ TÁC DỤNG trên các phần tử form
         * (`<button>`, `<input>`, …). Khi `asChild` bọc một `<a>` — đúng cách
         * dùng phổ biến nhất của `asChild` — React vẫn in ra `disabled=""`
         * nhưng trình duyệt bỏ qua: liên kết vẫn bấm được, vẫn nhận focus, và
         * cả hai class `disabled:pointer-events-none` / `disabled:opacity-50`
         * đều KHÔNG khớp (pseudo-class `:disabled` không bao giờ đúng với
         * `<a>`). Tức là nút "bị khoá" trông y hệt nút bình thường và vẫn điều
         * hướng được. Ở nhánh này phải diễn đạt bằng `aria-disabled` +
         * class không điều kiện.
         */
        asChild && isDisabled && 'pointer-events-none opacity-50',
        className,
      )}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      /*
       * Chỉ khi `asChild`: với `<button>` thật thì thuộc tính `disabled` ở trên
       * đã nói đủ cho trình đọc màn hình, thêm `aria-disabled` là thừa.
       */
      aria-disabled={asChild && isDisabled ? true : undefined}
      {...rest}
    >
      {/*
       * ĐÚNG MỘT expression con giữa `<Comp>`/`</Comp>` — bắt buộc khi
       * `asChild`: Radix `Slot` yêu cầu `props.children` là MỘT React element
       * duy nhất (`Children.only`), và JSX với HAI expression con trở lên
       * (`{a}{b}`) luôn tạo MẢNG cho `props.children` dù một trong hai bằng
       * `false`/`null` lúc runtime — Slot vẫn thấy mảng 2 phần tử và ném lỗi
       * "expected a single React element child". Nhánh `asChild` vì vậy
       * truyền thẳng `children`, không bọc gì thêm; nhánh nút thường gói
       * Spinner overlay + `children` trong MỘT `<Fragment>` — vẫn là một
       * expression con duy nhất, nhưng lần này giá trị của nó là Fragment
       * (Slot không tham gia nhánh này nên không có ràng buộc single-child).
       */}
      {asChild ? (
        children
      ) : (
        <Fragment>
          {/* `aria-hidden` trên WRAPPER (không phải trong `Spinner` — cái đó
              vẫn cần `role="status"`/`aria-label` khi dùng ĐỘC LẬP) chặn thuật
              toán tính accessible-name của `<button>` gộp luôn "Đang tải" từ
              `aria-label` của Spinner con vào tên nút — nếu không, tên nút
              thành "Đang tảiTiếp" thay vì "Tiếp"; `aria-busy` ở `<Comp>` đã đủ
              để báo trạng thái bận cho trình đọc màn hình. */}
          {loading && (
            <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-current">
              <Spinner size="sm" />
            </span>
          )}
          {children}
        </Fragment>
      )}
    </Comp>
  );
}
