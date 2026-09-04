import type { ReactElement } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from './cn.ts';
import { Button } from './button.tsx';

export interface ErrorStateProps {
  readonly title?: string;
  readonly message: string;
  readonly onRetry?: () => void;
  /** `true` = nút "Thử lại" đang chạy (Button.loading) — chặn bấm lại chồng lượt gọi. */
  readonly retrying?: boolean;
  readonly className?: string;
}

/** `role="alert"` — lỗi tải dữ liệu là thứ cần ngắt lời trình đọc màn hình để người dùng biết ngay, không phải chờ họ tự dò. */
export function ErrorState(props: ErrorStateProps): ReactElement {
  const { title = 'Không tải được dữ liệu', message, onRetry, retrying = false, className } = props;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-6 py-10 text-center',
        className,
      )}
    >
      <AlertTriangle aria-hidden="true" className="size-6 text-destructive" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry !== undefined && (
        <Button variant="outline" size="sm" onClick={onRetry} loading={retrying}>
          Thử lại
        </Button>
      )}
    </div>
  );
}
