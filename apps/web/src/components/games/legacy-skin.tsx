import type { ReactElement, ReactNode } from 'react';
import { cn } from '@devops-platform/ds';
import { LEGACY_FONT_VARIABLES } from '../../app/legacy-fonts';

/**
 * Vỏ cho các màn chơi giữ giao diện cũ (canvas K8s, màn chơi Git và CI/CD).
 *
 * `.legacy-skin` mở phạm vi của `app/legacy.css`: biến màu, bán kính và font cũ chỉ
 * có hiệu lực bên trong lớp này, nên trang mới bên ngoài không bị ảnh hưởng. Biến font
 * cũ được gắn tại đây chứ không ở `app/layout.tsx`: trang không có màn chơi thì không
 * tải bộ font đó.
 */
/**
 * Lớp phủ kín màn hình của canvas K8s. `z-[45]`: trên thanh đầu trang, dưới portal Radix.
 * `bg-background` đọc biến cũ khai ngay trên chính phần tử này (`.legacy-skin.dark`).
 */
const OVERLAY = 'fixed inset-0 z-[45] bg-background';

export function LegacySkin({
  children,
  dark = false,
  overlay = false,
  className,
}: {
  readonly children: ReactNode;
  /** Màn chơi luôn tối (canvas K8s), bất kể theme của trang. */
  readonly dark?: boolean;
  /** Phủ kín màn hình, che cả thanh đầu trang (canvas K8s đang chơi). */
  readonly overlay?: boolean;
  readonly className?: string;
}): ReactElement {
  // `flex-1 flex-col`: màn chơi vốn là con trực tiếp của `<main>` (flex cột) và giãn
  // theo nó. Lớp bọc này phải truyền tiếp cú giãn đó, không thì màn chơi co về chiều
  // cao nội dung.
  return (
    <div
      className={cn(
        'legacy-skin flex min-h-0 flex-1 flex-col',
        dark && 'dark',
        overlay && OVERLAY,
        LEGACY_FONT_VARIABLES,
        className,
      )}
    >
      {children}
    </div>
  );
}
