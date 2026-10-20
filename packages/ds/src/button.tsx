import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn.ts';
import { Icon } from './icons/icon.tsx';
import type { IconName } from './icons/glyphs.ts';

/**
 * Nút. Một màn hình có tối đa một nút `primary` (màu của mục đang mở); hành động
 * phụ dùng `secondary`/`ghost`. Hành động phá huỷ dùng `danger` (viền + chữ đỏ),
 * không bao giờ là một khối đỏ đặc.
 *
 * Đang xử lý (`loading`): nhãn giữ nguyên để người dùng biết mình đã bấm gì, một
 * vạch mảnh chạy dọc mép dưới. Hệ này không có vòng xoay.
 */
export const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 select-none items-center justify-center gap-2 overflow-hidden whitespace-nowrap',
    'rounded-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out',
    // Khoá (không phải đang tải): nền xám trung tính, chữ xám, không bóng. Làm mờ màu nhấn đọc
    // ra như nút hỏng (rà ảnh 2026-10-20). Đang tải cũng `disabled` nhưng giữ màu, có vạch quét.
    'motion-safe:active:scale-[0.97] disabled:pointer-events-none [&:disabled:not([aria-busy=true])]:shadow-none',
    'aria-busy:cursor-progress',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-acc-solid text-on-solid shadow-lift hover:bg-[color-mix(in_oklch,var(--acc-solid),var(--ink)_14%)] [&:disabled:not([aria-busy=true])]:bg-well-2 [&:disabled:not([aria-busy=true])]:text-ink-3',
        ink: 'bg-ink text-canvas shadow-lift hover:bg-[color-mix(in_oklch,var(--ink),var(--canvas)_18%)] [&:disabled:not([aria-busy=true])]:bg-well-2 [&:disabled:not([aria-busy=true])]:text-ink-3',
        secondary: 'border border-rule-2 bg-paper text-ink shadow-lift hover:border-control hover:bg-well [&:disabled:not([aria-busy=true])]:border-rule [&:disabled:not([aria-busy=true])]:bg-well [&:disabled:not([aria-busy=true])]:text-ink-3',
        ghost: 'text-ink-2 hover:bg-well hover:text-ink [&:disabled:not([aria-busy=true])]:text-ink-3',
        danger: 'border border-[color-mix(in_oklch,var(--st-bad-mid),transparent_45%)] bg-paper text-bad-ink hover:bg-bad-wash [&:disabled:not([aria-busy=true])]:border-rule [&:disabled:not([aria-busy=true])]:text-ink-3',
        link: 'h-auto px-0 text-acc-ink underline-offset-4 hover:underline active:scale-100 [&:disabled:not([aria-busy=true])]:text-ink-3',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-9 px-3.5 text-sm',
        lg: 'h-11 px-5 text-base',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
    },
    compoundVariants: [{ variant: 'link', size: ['sm', 'md', 'lg'], className: 'h-auto px-0' }],
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  readonly asChild?: boolean;
  readonly loading?: boolean;
  readonly icon?: IconName;
  readonly iconRight?: IconName;
}

function Content({
  icon,
  iconRight,
  size,
  children,
  loading,
}: {
  icon?: IconName | undefined;
  iconRight?: IconName | undefined;
  size: ButtonProps['size'];
  children: ReactNode;
  loading: boolean;
}) {
  const glyph = size === 'lg' ? 20 : size === 'sm' || size === 'icon-sm' ? 16 : 18;
  return (
    <>
      {icon === undefined ? null : <Icon name={icon} size={glyph} />}
      {children}
      {iconRight === undefined ? null : <Icon name={iconRight} size={glyph} />}
      {loading ? (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
          <span className="block h-full w-2/5 animate-sweep bg-current opacity-60" />
        </span>
      ) : null}
    </>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, loading = false, icon, iconRight, disabled, children, type, ...rest },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    // `Slottable` để biểu tượng chui VÀO trong phần tử con (thường là `<Link>`), không
    // đứng cạnh nó: `<Button asChild icon="book"><Link/></Button>` ra một `<a>` có icon.
    //
    // ⛔ Ba con phải là con TRỰC TIẾP của `Slot.Root`, không bọc trong Fragment. Slot tìm
    // `Slottable` bằng `Children.toArray`, hàm này không duỗi Fragment: bọc vào là Slot không
    // thấy `Slottable`, đem clone chính cái Fragment, và mọi lớp CSS rơi mất. Đã gặp
    // 2026-10-20: mọi nút-link có icon mất nền, mất `inline-flex`, icon rớt thành dòng riêng.
    if (icon === undefined && iconRight === undefined) {
      return (
        <Slot.Root ref={ref} className={classes} {...rest}>
          {children}
        </Slot.Root>
      );
    }
    const glyph = size === 'lg' ? 20 : size === 'sm' || size === 'icon-sm' ? 16 : 18;
    return (
      <Slot.Root ref={ref} className={classes} {...rest}>
        {icon === undefined ? null : <Icon name={icon} size={glyph} />}
        <Slot.Slottable>{children}</Slot.Slottable>
        {iconRight === undefined ? null : <Icon name={iconRight} size={glyph} />}
      </Slot.Root>
    );
  }
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <Content icon={icon} iconRight={iconRight} size={size} loading={loading}>
        {children}
      </Content>
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon' | 'iconRight' | 'asChild'> {
  readonly icon: IconName;
  /** Bắt buộc: nút chỉ có biểu tượng phải có tên đọc được. */
  readonly label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 'icon', variant = 'ghost', ...rest },
  ref,
) {
  return (
    <Button ref={ref} size={size} variant={variant} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={size === 'icon-sm' ? 16 : 18} />
    </Button>
  );
});
