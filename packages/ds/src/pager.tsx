import type { ReactNode } from 'react';
import { cn } from './cn.ts';
import { Button } from './button.tsx';

export interface PagerProps {
  /** "Trang 2", "Dòng 26–50"… do trang tự viết vì chỉ trang biết đơn vị. */
  readonly status: ReactNode;
  readonly onPrevious?: (() => void) | undefined;
  readonly onNext?: (() => void) | undefined;
  readonly onFirst?: (() => void) | undefined;
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly firstLabel?: string;
  readonly loading?: boolean;
  readonly className?: string;
}

/**
 * Phân trang theo con trỏ: đầu, trước, sau. Nút nào không có hàm thì bị khoá chứ
 * không biến mất, để hàng nút không nhảy chỗ khi lật trang. Danh sách chỉ có một trang
 * (không trước, không sau, không đang tải) thì chỉ còn dòng trạng thái: hai nút khoá ở đó
 * không lật được gì mà vẫn trông như bấm được.
 */
export function Pager({
  status,
  onPrevious,
  onNext,
  onFirst,
  previousLabel,
  nextLabel,
  firstLabel,
  loading = false,
  className,
}: PagerProps) {
  return (
    <nav aria-label={typeof status === 'string' ? status : undefined} className={cn('flex flex-wrap items-center justify-between gap-3 pt-4', className)}>
      <p className="text-sm tabular-nums text-ink-3">{status}</p>
      {onPrevious === undefined && onNext === undefined && onFirst === undefined && !loading ? null : (
      <div className="flex items-center gap-2">
        {firstLabel === undefined ? null : (
          <Button variant="ghost" size="sm" onClick={onFirst} disabled={onFirst === undefined || loading}>
            {firstLabel}
          </Button>
        )}
        <Button variant="secondary" size="sm" icon="chevron-left" onClick={onPrevious} disabled={onPrevious === undefined || loading}>
          {previousLabel}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          iconRight="chevron-right"
          onClick={onNext}
          disabled={onNext === undefined}
          loading={loading}
        >
          {nextLabel}
        </Button>
      </div>
      )}
    </nav>
  );
}
