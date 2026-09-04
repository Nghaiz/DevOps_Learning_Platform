import type { ReactElement } from 'react';

export interface ProgressBarProps {
  readonly value: number;
  readonly max: number;
  readonly label?: string;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Thanh tiến trình hoàn thành bài học. */
export function ProgressBar(props: ProgressBarProps): ReactElement {
  const { value, max, label } = props;
  // `max <= 0` là dữ liệu chưa sẵn sàng (ví dụ danh sách bước chưa tải xong).
  // Chia cho 0 ra `NaN`, và React render `width: 'NaN%'` bằng cách ÂM THẦM bỏ
  // qua toàn bộ thuộc tính `style` đó — thanh tiến trình biến mất không dấu
  // vết thay vì báo lỗi rõ ràng. Ép về 0% thay vì để tới đó.
  const percent = max > 0 ? clampPercent((value / max) * 100) : 0;

  return (
    <div className="w-full">
      {label && <div className="mb-1 text-xs text-muted-foreground">{label}</div>}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
