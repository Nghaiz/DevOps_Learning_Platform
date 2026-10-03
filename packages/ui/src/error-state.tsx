import type { ReactElement, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from './cn.ts';
import { Button } from './button.tsx';

export interface ErrorStateProps {
  readonly title?: string;
  /** Chuyện gì đã xảy ra + làm gì tiếp, một câu (design-brief §8). */
  readonly message: string;
  /**
   * Chi tiết kỹ thuật (mã lỗi, request id) in nhỏ bằng mono dưới câu chính —
   * thứ người dùng chép gửi cho trợ giảng, không phải thứ họ phải đọc hiểu.
   */
  readonly detail?: string;
  readonly onRetry?: () => void;
  /** `true` = nút "Thử lại" đang chạy (Button.loading) — chặn bấm lại chồng lượt gọi. */
  readonly retrying?: boolean;
  /**
   * Nhãn nút thử lại. Mặc định "Thử lại"; nơi gọi có bộ chữ riêng truyền động
   * từ của mình ("Tải lại") để cả màn nói một động từ cho cùng một việc.
   */
  readonly retryLabel?: string;
  /**
   * Nút phụ đặt cạnh nút thử lại: lối ra khi thử lại không đủ, ví dụ "Về đầu"
   * cho một danh sách phân trang hỏng ở trang sau.
   */
  readonly actions?: ReactNode;
  readonly className?: string;
}

/**
 * `role="alert"` — lỗi tải dữ liệu là thứ cần ngắt lời trình đọc màn hình để
 * người dùng biết ngay, không phải chờ họ tự dò.
 *
 * Bố cục: ô icon đỏ nhạt bên trái, chữ bên phải, trên mặt `bg-card` có viền.
 * Chữ nằm trên `bg-card` chứ KHÔNG trên một tấm nền pha đỏ như bản trước:
 * `--muted-foreground` trên `bg-destructive/10` từng chỉ đạt 4.385:1 ở nhánh
 * sáng (dưới AA, axe báo đỏ ở `/me`), và phải mượn `--secondary-foreground`
 * (token nay chỉ còn giữ cho game) để thoát. Đặt chữ trên mặt card thì cặp `muted-foreground`/`card`
 * đã được cổng token đo sẵn, không cần mượn gì.
 */
export function ErrorState(props: ErrorStateProps): ReactElement {
  const {
    title = 'Không tải được dữ liệu',
    message,
    detail,
    onRetry,
    retrying = false,
    retryLabel = 'Thử lại',
    actions,
    className,
  } = props;
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn(
        'grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-3 border border-destructive/40 bg-card p-5',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center bg-destructive/10 text-destructive"
      >
        <AlertTriangle className="size-5" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        {detail !== undefined && (
          <p className="font-mono text-xs break-all text-muted-foreground">{detail}</p>
        )}
      </div>
      {(onRetry !== undefined || actions !== undefined) && (
        <div className="col-start-2 flex flex-wrap gap-2">
          {onRetry !== undefined && (
            <Button variant="outline" size="sm" onClick={onRetry} loading={retrying}>
              {retryLabel}
            </Button>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}
