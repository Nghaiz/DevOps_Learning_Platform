import type { ReactElement, ReactNode } from 'react';
import { cn } from '@devops-platform/ui';

export interface PaneHeaderProps {
  /** Icon lucide — component tự bọc `aria-hidden` và ép cỡ, caller chỉ truyền `<Terminal />`. */
  readonly icon: ReactNode;
  readonly title: string;
  /** Slot bên phải: nút, trạng thái, liên kết thoát. */
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * Thanh nhãn đầu mỗi khoang của màn hình học.
 *
 * ## Vì sao khoang phải có nhãn
 *
 * Bố cục hai (hoặc ba) khoang là toàn bộ giá trị của một nền tảng kiểu
 * KillerCoda, nhưng nó chỉ đọc được khi mỗi khoang tự xưng tên. Không nhãn thì
 * ranh giới giữa "nội dung bài" và "terminal" chỉ còn là một đường kẻ 1px —
 * và ở màn hẹp, nơi hai khoang gần nhau nhất, đó đúng là lúc người học cần
 * biết mình đang nhìn cái gì nhất.
 *
 * ## `<h2>` chứ không phải `<span>`
 *
 * Nhãn khoang là một mục thật trong cấu trúc trang, nên nó phải vào được cây
 * heading — đó là cách người dùng trình đọc màn hình NHẢY giữa các khoang, thứ
 * mà người dùng chuột làm bằng cách liếc mắt. Đã kiểm cả ba trang tiêu thụ
 * (`lessons/[id]`, `playgrounds/[id]`, `labs/[id]`): mỗi trang đúng một `<h1>`,
 * lab đã sẵn có `<h2>` — nên h1 → h2 không phá `heading-order` của axe ở đâu.
 *
 * ## `aria-hidden` trên icon
 *
 * Icon đi KÈM chữ, nên nó không được góp gì vào tên khả truy cập — nếu không
 * trình đọc màn hình sẽ đọc "hình ảnh terminal Terminal". Bọc ở đây thay vì
 * bắt từng caller nhớ: một chỗ quên là một lỗi axe, và ba caller thì sẽ có
 * chỗ quên.
 */
export function PaneHeader({ icon, title, children, className }: PaneHeaderProps): ReactElement {
  return (
    <div
      className={cn(
        'flex h-9 shrink-0 items-center gap-2 border-b border-border bg-card px-3',
        className,
      )}
    >
      <span aria-hidden="true" className="flex shrink-0 items-center text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <h2 className="truncate text-xs font-semibold text-foreground">{title}</h2>
      {children !== undefined && (
        <span className="ml-auto flex shrink-0 items-center gap-2">{children}</span>
      )}
    </div>
  );
}
