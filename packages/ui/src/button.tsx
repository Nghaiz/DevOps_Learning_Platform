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
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
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

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), loading && 'relative text-transparent', className)}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
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
