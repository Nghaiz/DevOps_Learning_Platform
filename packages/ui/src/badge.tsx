import type { ComponentProps, ComponentType, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Circle, CircleCheck, CirclePlay, Lock, SignalHigh, SignalLow, SignalMedium } from 'lucide-react';
import { cn } from './cn.ts';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'outline'
  | 'difficulty-basic'
  | 'difficulty-intermediate'
  | 'difficulty-advanced'
  | 'status-todo'
  | 'status-progress'
  | 'status-done'
  | 'status-locked';

/**
 * Bảy biến thể NGỮ NGHĨA (`difficulty-*`, `status-*`) tiêu thụ token của lane
 * nền theo đúng tên đã chốt: `--difficulty-{basic,intermediate,advanced}` và
 * `--status-{progress,done,locked}`, mỗi cái kèm một `-foreground`.
 *
 * ⚠ HAI chỗ lệch giữa hợp đồng token và miền dữ liệu — cố ý ghi ra đây thay vì
 * âm thầm bịa token mới:
 *
 * 1. **`basic` ≠ `beginner`.** Token tên `--difficulty-basic`, còn enum miền
 *    (`SCENARIO_DIFFICULTIES` ở `packages/shared-types/src/scenario.ts`) là
 *    `beginner | intermediate | advanced`. Nơi gọi phải ánh xạ
 *    `beginner → 'difficulty-basic'`. Đổi tên token là việc của lane nền, ở
 *    đây KHÔNG tự đặt tên khác.
 * 2. **`status-todo` KHÔNG có token riêng** — hợp đồng chỉ có `progress`,
 *    `done`, `locked`, nhưng miền tiến độ có bốn giá trị: `not-started`
 *    (“Chưa bắt đầu”), `in-progress`, `completed`, cộng “bị khoá” của lộ trình
 *    tuần tự. `status-todo` vì vậy dùng `--muted`/`--muted-foreground` (token
 *    C1 đã có, đã được `tokens.contract.test.ts` gác ≥4.5:1) chứ không mint
 *    token mới. Trung tính là màu ĐÚNG cho “chưa bắt đầu”; thứ phân biệt nó
 *    khỏi ba trạng thái kia là HÌNH (vòng tròn rỗng), xem `DEFAULT_ICON`.
 *
 * ⚠ Ràng buộc cho lane nền: đây là chữ trên nền tô đặc ⇒ SC 1.4.3 đòi mỗi cặp
 * `--difficulty-*` / `--status-*` với `-foreground` của nó phải ≥ **4.5:1** ở
 * CẢ HAI theme, và phải được thêm vào `C1_COLOR_TOKENS` +
 * `TEXT_PAIRS`. Nếu chỉ khai biến mà quên `@theme inline` thì class
 * `bg-difficulty-basic` KHÔNG được Tailwind sinh ra — badge vẫn render, chỉ là
 * không có luật CSS nào khớp (đúng dạng hỏng im lặng #2 mà
 * `theme/tokens.contract.test.ts` mô tả).
 */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        success: 'border-transparent bg-success text-success-foreground',
        warning: 'border-transparent bg-warning text-warning-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border text-foreground',
        'difficulty-basic': 'border-transparent bg-difficulty-basic text-difficulty-basic-foreground',
        'difficulty-intermediate':
          'border-transparent bg-difficulty-intermediate text-difficulty-intermediate-foreground',
        'difficulty-advanced': 'border-transparent bg-difficulty-advanced text-difficulty-advanced-foreground',
        'status-todo': 'border-border bg-muted text-muted-foreground',
        'status-progress': 'border-transparent bg-status-progress text-status-progress-foreground',
        'status-done': 'border-transparent bg-status-done text-status-done-foreground',
        'status-locked': 'border-transparent bg-status-locked text-status-locked-foreground',
      } satisfies Record<BadgeVariant, string>,
    },
    defaultVariants: { variant: 'default' },
  },
);

/**
 * Kiểu TỐI THIỂU cho một icon, cố ý KHÔNG import `LucideIcon` từ
 * `lucide-react`: ta chỉ cần hai prop, và một kiểu cấu trúc tự khai thì không
 * vỡ khi lucide đổi cách export kiểu ở bản sau (`package.json` ghim `^1.38`,
 * bản đang cài thực tế là 1.40.0).
 */
type BadgeIcon = ComponentType<{ readonly className?: string; readonly 'aria-hidden'?: boolean }>;

/**
 * Icon MẶC ĐỊNH theo biến thể — điều kiện WCAG 1.4.1 (Use of Color): “Đang
 * học” / “Chưa bắt đầu” / “Đã xong” phải phân biệt được KHÔNG CHỈ bằng màu.
 *
 * Vì sao mặc định chứ không phải tuỳ nơi gọi truyền: nếu icon thuần opt-in thì
 * bảo đảm cho người mù màu phụ thuộc vào việc MỌI nơi gọi nhớ truyền nó — tức
 * là không có bảo đảm nào. Nơi gọi vẫn đè được bằng `icon`, và tắt hẳn bằng
 * `icon={null}`.
 *
 * Hai thang hình, mỗi thang đọc được khi in đen trắng:
 *
 * | Thang | Hình |
 * |---|---|
 * | độ khó | sóng tín hiệu thấp → vừa → cao (số vạch tăng dần) |
 * | tiến độ | vòng rỗng → nút play → dấu tích → ổ khoá |
 *
 * Biến thể phi ngữ nghĩa (`default`, `secondary`, …) CỐ Ý không có icon mặc
 * định: chúng không mang một trạng thái cố định nào để mà vẽ.
 */
const DEFAULT_ICON: Partial<Record<BadgeVariant, BadgeIcon>> = {
  'difficulty-basic': SignalLow,
  'difficulty-intermediate': SignalMedium,
  'difficulty-advanced': SignalHigh,
  'status-todo': Circle,
  'status-progress': CirclePlay,
  'status-done': CircleCheck,
  'status-locked': Lock,
};

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  /**
   * Icon ở ĐẦU badge.
   *
   * - bỏ trống ⇒ dùng `DEFAULT_ICON` của biến thể (không có thì không vẽ gì);
   * - truyền node ⇒ thay icon mặc định. Node của nơi gọi tự chịu trách nhiệm
   *   `aria-hidden` của chính nó — component không `cloneElement` để nhét
   *   thuộc tính vào node người khác;
   * - `null` ⇒ TẮT hẳn icon, kể cả icon mặc định.
   */
  readonly icon?: ReactNode;
}

export function Badge({ variant, icon, className, children, ...props }: BadgeProps) {
  const FallbackIcon = DEFAULT_ICON[variant ?? 'default'];
  const glyph =
    icon === undefined ? (
      // `aria-hidden` vì icon này luôn đi KÈM chữ trong badge — để nó lộ ra thì
      // trình đọc màn hình đọc thừa một node vô nghĩa cạnh nhãn đã nói đủ.
      FallbackIcon === undefined ? null : (
        <FallbackIcon aria-hidden className="size-3.5 shrink-0" />
      )
    ) : (
      icon
    );

  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props}>
      {glyph}
      {children}
    </span>
  );
}
