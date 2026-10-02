import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@devops-platform/ui';

export interface WorkspaceBarProps {
  readonly backHref: string;
  readonly backLabel: string;
  /** Tiêu đề trang. Thanh này mang `<h1>` duy nhất của màn thực hành. */
  readonly title: string;
  /** Huy hiệu tuyến chủ đề đứng trước tiêu đề. */
  readonly badge?: ReactNode;
  /** Thước tiến độ hoặc điểm. */
  readonly progress?: ReactNode;
  /** Khung điều khiển phiên. */
  readonly controls: ReactNode;
}

/**
 * Thanh trên của màn thực hành: 48px, nền `chrome` tối ở cả hai theme.
 *
 * Một thanh duy nhất gánh bốn việc (quay lại, tên bài, tiến độ, điều khiển phiên)
 * thay cho ba dải chồng nhau của bản trước (thanh đầu trang, dải cảnh báo, hàng
 * bước). Mỗi dải là ~40px lấy khỏi terminal, và trên màn 768px cao thì terminal
 * còn lại không đủ 20 dòng.
 *
 * Gốc mang `dark` để mọi token bên trong (badge, nút) phân giải về bản đêm trên nền tối.
 */
export function WorkspaceBar({ backHref, backLabel, title, badge, progress, controls }: WorkspaceBarProps): ReactElement {
  return (
    <header
      className={cn(
        'dark flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 bg-chrome px-2 py-1.5 text-chrome-foreground',
        '[color-scheme:dark]',
      )}
    >
      <Link
        href={backHref}
        className={cn(
          'flex h-9 shrink-0 items-center gap-2 px-2 font-mono text-xs text-chrome-muted',
          'transition-colors duration-[var(--motion-fast)] ease-out hover:bg-chrome-border hover:text-chrome-foreground',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        <span className="hidden sm:inline">{backLabel}</span>
        <span className="sr-only sm:hidden">{backLabel}</span>
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {badge}
        <h1 className="min-w-0 truncate font-display text-base font-extrabold tracking-tight">{title}</h1>
      </div>
      {progress !== undefined && <div className="hidden w-44 shrink-0 md:block">{progress}</div>}
      <div className="ml-auto min-w-0">{controls}</div>
    </header>
  );
}
