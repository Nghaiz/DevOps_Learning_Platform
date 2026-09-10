import { Fragment, type ComponentProps, type ReactNode } from 'react';
import { Slot } from 'radix-ui';
import { TriangleAlert } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn.ts';
import { Spinner } from './spinner.tsx';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap',
    'transition-colors duration-[var(--motion-fast)] ease-out outline-none',
    /*
     * `ring-offset-2` và `ring-offset-background` đi CÙNG NHAU, không tách được.
     *
     * Offset tồn tại vì `--ring` = `--primary` theo đúng thiết kế, nên vòng
     * focus vẽ SÁT mặt nút primary cho đúng 1.00:1 — vô hình, ở cả hai theme
     * (nút destructive: 1.01 sáng / 1.49 tối).
     *
     * ⚠ 2026-09-08 — CHỖ NÀY TỪNG NÓI "và KHÔNG màu nào sửa được bằng token".
     * Với thương hiệu lam thì đúng: quét vét cạn thang độ chói cho 0 nghiệm, vì
     * trắng tinh chỉ được 2.89:1 với `--primary` tối. Đỏ có độ chói tương đối
     * THẤP hơn lam ở cùng L, nên câu đó nay SAI: trắng được 4.2972:1 với
     * `--primary` tối mới, và phép quét cho **317 nghiệm**. Một giá trị `--ring`
     * riêng ĐANG CÓ SẴN.
     *
     * Ta không lấy nó, và đây là một LỰA CHỌN chứ không phải một ràng buộc vật
     * lý: `--ring` là vòng focus của MỌI phần tử focus được, không riêng nút
     * primary, nên cho nó một hue riêng là sửa cả hệ thống focus chứ không phải
     * sửa màu thương hiệu — ngoài phạm vi đợt đổi màu này. Và kỹ thuật
     * `ring-offset-2` + `ring-offset-background` dưới đây vốn đã khiến vòng
     * focus KHÔNG BAO GIỜ nằm sát mặt nút, nên khoảng trống đó không gây hại
     * ngay. Nếu sau khi đỏ lên vẫn thấy đáng làm thì mở một thay đổi riêng.
     *
     * Offset đẩy vòng focus ra ngoài một khe 2px màu nền, nên màu KỀ nó là
     * `--background`/`--card` — cặp đã được gác sẵn ở
     * `theme/tokens.contract.test.ts` (4.8178 sáng / 4.6065 tối trên
     * `--background`).
     *
     * Thiếu `ring-offset-background` thì Tailwind rơi về mặc định của chính nó,
     * `--tw-ring-offset-color: #fff` (đo trong tailwindcss/dist/lib.js): khe
     * TRẮNG trên nền tối — vừa sai màu, vừa tự đẻ ra một ranh giới không ai
     * chọn. Hai class này vì vậy được gác CÙNG NHAU ở button.test.tsx.
     */
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
    /*
     * Cỡ icon MẶC ĐỊNH, nhưng nhường cho cỡ khai tường minh.
     *
     * `lucide-react` vẽ ở 24px nếu không ai nói gì — to lộ liễu trong một nút
     * cao 32–44px. `[&_svg]:size-4` trần thì sửa được cỡ mặc định nhưng SINH RA
     * một lỗi khác: luật đó là `.nút svg { … }` (độ đặc hiệu 0,1,1) còn class
     * `size-5` của chính icon là (0,1,0), nên nơi gọi KHÔNG tài nào phóng to
     * icon được nữa — và thất bại đó im lặng.
     *
     * `:not([class*='size-'])` để luật mặc định tự lùi ngay khi icon có bất kỳ
     * class `size-*` nào của riêng nó. Cũng chính vì vậy `Spinner` (luôn mang
     * `size-4`/`size-5`/`size-8` từ `SIZE_CLASSES`) nằm ngoài tầm với của luật
     * này — nhánh `loading` bên dưới không bị đụng tới.
     */
    "[&_svg:not([class*='size-'])]:size-4",
  ].join(' '),
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'bg-transparent hover:bg-accent hover:text-accent-foreground',
        /*
         * TÁCH KHỎI `primary` BẰNG HÌNH DẠNG, không bằng màu (quyết định #1 của
         * 14.A). Từ 2026-09-08 thương hiệu là ĐỎ, nên `--primary` và
         * `--destructive` chỉ còn lệch 2.3° hue — đo được 1.01:1 giữa hai mặt
         * nút, tức mắt KHÔNG phân biệt nổi. Nếu cả hai cùng là nền đặc thì "Lưu"
         * và "Xoá vĩnh viễn" trông y hệt nhau.
         *
         * Nên: primary = nền ĐẶC, destructive = VIỀN + nền trong suốt + chữ đỏ
         * + icon bắt buộc. Khác biệt nằm ở CẤU TRÚC (có viền / không viền, nền
         * sáng / nền tối, có icon / không icon), nên nó sống sót khi in đen
         * trắng và với người mù màu đỏ-lục — xem `button.test.tsx` §"khử màu".
         *
         * Vì sao nghỉ = TRONG SUỐT chứ không phải `bg-destructive/10`: chữ đỏ
         * trên nền hồng nhạt KHÔNG đạt SC 1.4.3 ở nhánh sáng. Đo được 3.99:1
         * (cần 4.5), và alpha không cứu nổi — `--destructive` sáng chỉ đạt
         * 4.7647:1 trên nền trắng tinh, nên mọi lớp phủ đều ăn vào đúng phần dư
         * mỏng đó; muốn đạt 4.5 thì tint phải hạ xuống /03, lúc ấy không còn là
         * tint nữa. Bỏ hẳn tint ở trạng thái nghỉ giữ nguyên 4.7647:1 (sáng) và
         * 6.8443:1 (tối) trên `--background`, 4.7647 / 6.1943 trên `--card`.
         *
         * ⚠ Giới hạn ĐÃ ĐO: trên `bg-muted` nhánh SÁNG chỉ được 4.3686:1 —
         * DƯỚI 4.5. Ba nơi gọi thật (confirm-dialog, publish-panel,
         * active-sessions) đều nằm trên mặt dialog/card nên không chạm giới hạn
         * này, nhưng ĐỪNG đặt nút destructive vào khối `bg-muted` ở nhánh sáng.
         * Gác bằng test khoảng-trống ở `theme/tokens.contract.test.ts`.
         *
         * Hover ĐẢO sang nền đặc: cặp `--destructive-foreground` trên
         * `--destructive` đã được `TEXT_PAIRS` gác sẵn (4.5636 sáng / 6.8436
         * tối). Đảo lúc hover không đụng `primary`, vì `primary` đặc từ lúc
         * NGHỈ — và trạng thái nghỉ mới là thứ người dùng quét mắt qua.
         */
        destructive: [
          'border border-destructive bg-transparent text-destructive',
          'hover:bg-destructive hover:text-destructive-foreground',
        ].join(' '),
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

/**
 * Màu Spinner lúc `loading` phải ĐỘC LẬP với `currentColor`.
 *
 * Nhánh nút thường đặt `text-transparent` lên chính `<button>` để giấu nhãn
 * đằng sau Spinner đè lên. Nhưng khi đó `currentColor` = trong suốt, mà
 * `lucide-react` vẽ icon bằng `stroke="currentColor"` + `fill="none"` — không
 * còn NÉT nào để nhìn. Nút "đang tải" thành một nút trống trơn: nhãn bị giấu
 * đúng ý đồ, spinner biến mất ngoài ý đồ. 37 nơi gọi đang dựa vào nó, gồm cả
 * "Đăng nhập" và "Bắt đầu phiên".
 *
 * jsdom không tính được màu đã tính (computed style) nên KHÔNG test nào đỏ
 * được vì chuyện này: `getByRole('status')` vẫn thấy phần tử, nó chỉ vô hình.
 * Vì vậy thứ được gác ở button.test.tsx là CLASS quyết định màu, không phải sự
 * tồn tại của phần tử — một test kiểm sự tồn tại là test không thể đỏ.
 *
 * Mỗi giá trị dưới đây là màu CHỮ của chính biến thể đó, nên tương phản với
 * mặt nút đã được `TEXT_PAIRS` (≥4.5:1) trong `theme/tokens.contract.test.ts`
 * gác sẵn — dư so với mức 3:1 mà SC 1.4.11 đòi cho một thành phần đồ hoạ.
 * `outline`/`ghost` không đặt `text-*` nào ở biến thể của chúng, nên phải nói
 * rõ `text-foreground` chứ không được để thừa kế từ cây cha.
 */
const SPINNER_TONE = {
  primary: 'text-primary-foreground',
  secondary: 'text-secondary-foreground',
  outline: 'text-foreground',
  ghost: 'text-foreground',
  /*
   * `text-destructive`, KHÔNG phải `text-destructive-foreground` — đổi cùng lúc
   * với biến thể viền ở trên. `loading` kéo theo `disabled`, nên nút không bao
   * giờ ở trạng thái hover khi Spinner chạy: màu nền dưới Spinner là màu NGHỈ
   * (trong suốt), và chữ nghỉ là `text-destructive`. Để nguyên
   * `-foreground` ở đây là vẽ Spinner gần-trắng lên nền gần-trắng — vô hình,
   * đúng cùng một hỏng câm mà cả khối chú thích này sinh ra để chặn.
   * `--destructive` trên `--background` đo được 4.7647:1 (sáng) / 6.8443:1
   * (tối), dư so với mức 3:1 mà một thành phần đồ hoạ cần.
   */
  destructive: 'text-destructive',
  link: 'text-primary',
} as const satisfies Record<ButtonVariant, string>;

/**
 * Icon MẶC ĐỊNH của `destructive` — nửa còn lại của tín hiệu hình dạng.
 *
 * Cùng lập luận đã ghi cho `DEFAULT_ICON` ở `badge.tsx`: nếu icon thuần opt-in
 * thì bảo đảm cho người mù màu phụ thuộc vào việc MỌI nơi gọi nhớ truyền nó —
 * tức là không có bảo đảm nào. Viền + nền trong suốt phân biệt được nút này với
 * `primary`; icon là thứ nói thêm rằng nó NGUY HIỂM chứ không chỉ là "nút phụ"
 * (biến thể `outline` cũng có viền). Không có icon thì quyết định #1 chỉ còn
 * một nửa.
 *
 * `aria-hidden` vì nhãn nút đã nói đủ ("Xoá vĩnh viễn", "Lưu trữ"); để icon lộ
 * ra là thêm một node vô nghĩa vào tên hỗ trợ tiếp cận.
 *
 * Nơi gọi vẫn đè được bằng `iconLeft`, và tắt hẳn bằng `iconLeft={null}`.
 * ⚠ BỊ BỎ QUA khi `asChild`, cùng ràng buộc single-child của Radix `Slot` như
 * `iconLeft` — ở nhánh đó nơi gọi tự đặt icon bên trong element con của mình.
 */
const DESTRUCTIVE_ICON = <TriangleAlert aria-hidden />;

export interface ButtonProps
  extends Omit<ComponentProps<'button'>, 'color'>,
    VariantProps<typeof buttonVariants> {
  /** Radix Slot — render component con làm root thay vì `<button>` (vd. `<a>` có kiểu nút). */
  readonly asChild?: boolean;
  /** `true` ⇒ disable + hiện Spinner đè giữa, GIỮ NGUYÊN bề rộng nút (children vẫn render, chỉ ẩn màu). */
  readonly loading?: boolean;
  /**
   * Icon trước nhãn. Icon TRANG TRÍ — nó đứng cạnh chữ, nên node truyền vào
   * phải tự mang `aria-hidden` (component không `cloneElement` node của nơi
   * gọi). Nút chỉ-có-icon thì dùng `size="icon"` + `aria-label` trên nút.
   *
   * ⚠ BỊ BỎ QUA khi `asChild`, và không thể khác: Radix `Slot` đòi
   * `props.children` là ĐÚNG MỘT React element (`Children.only`), nên thêm bất
   * kỳ node anh em nào cũng ném "expected a single React element child" —
   * xem chú thích single-child ở thân component. Ở nhánh đó nơi gọi tự đặt
   * icon BÊN TRONG element con của mình:
   * `<Button asChild><Link><Play aria-hidden />Bắt đầu</Link></Button>`.
   * Hành vi này được ghim ở `button.test.tsx` để nó không trôi thành một sự
   * bỏ qua tình cờ.
   */
  readonly iconLeft?: ReactNode;
  /** Icon sau nhãn. Cùng ràng buộc `aria-hidden` + `asChild` như `iconLeft`. */
  readonly iconRight?: ReactNode;
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
  const {
    variant,
    size,
    asChild = false,
    loading = false,
    iconLeft,
    iconRight,
    disabled,
    className,
    children,
    ...rest
  } = props;
  const Comp = asChild ? Slot.Root : 'button';
  // `undefined` ⇒ dùng icon mặc định của biến thể; `null` ⇒ nơi gọi TẮT hẳn.
  // Cùng quy ước ba trạng thái với prop `icon` của `badge.tsx`.
  const resolvedIconLeft =
    iconLeft === undefined && variant === 'destructive' ? DESTRUCTIVE_ICON : iconLeft;
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
         * `document.querySelectorAll('svg[data-slot="spinner"]').length === 0`.
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
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-0 flex items-center justify-center',
                // KHÔNG `text-current`: nút đang mang `text-transparent` ở ngay
                // trên, nên thừa kế màu là thừa kế đúng sự trong suốt đã giết
                // spinner. Xem SPINNER_TONE.
                SPINNER_TONE[variant ?? 'primary'],
              )}
            >
              <Spinner size="sm" />
            </span>
          )}
          {/* Icon nằm TRONG nhánh này nên khi `loading`, `text-transparent`
              của nút cũng nuốt luôn màu nét của chúng — đúng ý: cả cụm
              icon+nhãn mờ đi sau Spinner đè lên, thay vì icon còn nổi lên
              cạnh một cái nhãn đã tàng hình. */}
          {resolvedIconLeft}
          {children}
          {iconRight}
        </Fragment>
      )}
    </Comp>
  );
}
