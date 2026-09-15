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
        {/*
          `text-secondary-foreground`, KHÔNG phải `text-muted-foreground`.

          Câu mô tả nằm trên `bg-destructive/10` ngay phía trên, tức một mặt
          nền ĐÃ pha màu chứ không phải nền trang. Đo trên bảng token thật
          (`globals.css`, lớp `--workspace-*` mà `practice.css` gán vai trò):
          `--muted-foreground` trên tấm nền đó chỉ còn **4.385:1** ở nhánh sáng
          — dưới ngưỡng AA 4.5 của SC 1.4.3, và đó là ô `color-contrast` mà axe
          báo đỏ trên `/me`. `--muted-foreground` không có chỗ hụt nào để mất:
          nó vốn chỉ vừa qua ngưỡng trên nền TRẮNG, nên bất kỳ lớp pha nào cũng
          đủ đẩy nó xuống dưới.

          Số đo sau khi đổi (nền trang / nền thẻ):
            sáng 8.911 / 9.526 · tối 12.439 / 11.024.

          Vì sao KHÔNG đổi token `--muted-foreground`: nó là mực chữ phụ của
          toàn site, hàng trăm chỗ đang dùng và đang đạt ngưỡng; kéo nó tối đi
          để cứu một mặt nền là đổi diện mạo cả sản phẩm. Vì sao KHÔNG dùng
          `text-destructive` (5.116/5.469 sáng, 5.330/4.724 tối): nó qua ngưỡng
          nhưng biến câu mô tả thành chữ đỏ, và ở nhánh tối chỉ còn dư 0.224 —
          một lần chỉnh token nữa là rơi lại.
        */}
        <p className="text-sm text-secondary-foreground">{message}</p>
      </div>
      {onRetry !== undefined && (
        <Button variant="outline" size="sm" onClick={onRetry} loading={retrying}>
          Thử lại
        </Button>
      )}
    </div>
  );
}
