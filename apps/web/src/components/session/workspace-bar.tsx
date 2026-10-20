import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import { Icon } from '@devops-platform/ds';

export interface WorkspaceBarProps {
  readonly backHref: string;
  readonly backLabel: string;
  /** Tiêu đề trang. Thanh này mang `<h1>` duy nhất của màn thực hành. */
  readonly title: string;
  /** Biểu tượng chủ đề đứng trước tiêu đề. */
  readonly badge?: ReactNode;
  /** Tiến độ hoặc điểm. */
  readonly progress?: ReactNode;
  /** Khung điều khiển máy. */
  readonly controls: ReactNode;
}

/**
 * Thanh trên của khu thực hành: cao CỐ ĐỊNH 52px, không bao giờ xuống dòng. Mọi thứ
 * xuất hiện hay biến mất trên thanh (đồng hồ, nút Thêm giờ) chỉ đổi bề ngang của
 * nó; nếu thanh cao lên thì terminal bên dưới phải fit lại giữa lúc người học gõ.
 *
 * Nền theo giao diện sáng/tối của trang. Khoang làm việc bên dưới mới luôn tối.
 */
export function WorkspaceBar({ backHref, backLabel, title, badge, progress, controls }: WorkspaceBarProps): ReactElement {
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2 overflow-hidden border-b border-rule bg-paper pl-1.5 pr-2 sm:gap-3 sm:pr-3">
      <Link
        href={backHref}
        className="group flex h-9 shrink-0 items-center gap-1.5 rounded-sm px-2 text-sm text-ink-2 outline-none focus-visible:outline-solid transition-colors duration-150 hover:bg-well hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Icon name="arrow-left" size={18} className="transition-transform duration-150 group-hover:-translate-x-0.5" />
        <span className="hidden md:inline">{backLabel}</span>
        <span className="sr-only md:hidden">{backLabel}</span>
      </Link>
      <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-rule-2 sm:block" />
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {badge}
        <h1 className="min-w-0 truncate font-display text-md font-semibold text-ink">{title}</h1>
      </div>
      {progress === undefined ? null : <div className="hidden w-44 shrink-0 lg:block">{progress}</div>}
      <div className="flex min-w-0 shrink-0 items-center">{controls}</div>
    </header>
  );
}
