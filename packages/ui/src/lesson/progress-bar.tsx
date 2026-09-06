import type { ReactElement } from 'react';
import { cn } from '../cn.ts';
import { MOTION_SLOW } from './motion.ts';

export interface ProgressBarProps {
  readonly value: number;
  readonly max: number;
  readonly label?: string;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Thanh tiến trình hoàn thành bài học.
 *
 * ## `aria-label` là bắt buộc, không phải trang trí (axe `aria-progressbar-name`)
 *
 * Lượt e2e ngày 2026-09-06 trên cụm thật bắt lỗi mức **serious** ở đúng đây:
 * `role="progressbar"` không có tên khả truy cập, nên trình đọc màn hình đọc ra
 * một "progress bar" trống — người dùng biết CÓ một thanh tiến độ nhưng không
 * biết nó đo cái gì. `label` chỉ là chữ nằm CẠNH thanh, không phải tên của nó:
 * quan hệ đó không tồn tại với AT trừ khi được nối tường minh.
 *
 * Dùng `aria-label` chứ không `aria-labelledby`: nối bằng id đòi `useId()`, mà
 * hook thì kéo cả file sang `'use client'` cho một component thuần trình bày.
 * Chữ có lặp lại một lần với AT — đổi lại là một tên luôn có mặt, kể cả khi
 * caller không truyền `label`.
 *
 * ## Vì sao con số phần trăm `aria-hidden`
 *
 * `aria-valuenow`/`aria-valuemax` đã đủ để AT tự đọc ra phần trăm. Để con số
 * hiện lên cây a11y nữa là bắt người dùng nghe cùng một thông tin hai lần.
 * Nó ở đây cho MẮT: "còn bao xa" phải đọc được trong một cái liếc.
 */
export function ProgressBar(props: ProgressBarProps): ReactElement {
  const { value, max, label } = props;
  // `max <= 0` là dữ liệu chưa sẵn sàng (ví dụ danh sách bước chưa tải xong).
  // Chia cho 0 ra `NaN`, và React render `width: 'NaN%'` bằng cách ÂM THẦM bỏ
  // qua toàn bộ thuộc tính `style` đó — thanh tiến trình biến mất không dấu
  // vết thay vì báo lỗi rõ ràng. Ép về 0% thay vì để tới đó.
  const percent = max > 0 ? clampPercent((value / max) * 100) : 0;
  // Suy tại chỗ dùng, KHÔNG thêm prop `tone`: trạng thái "xong" đã nằm trọn
  // trong `value`/`max` mà caller truyền, và một prop thứ ba nói lại cùng điều
  // đó chỉ tạo chỗ cho hai nguồn sự thật lệch nhau.
  const complete = max > 0 && value >= max;

  return (
    <div className="w-full">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        {label !== undefined && <span className="truncate text-xs text-muted-foreground">{label}</span>}
        <span
          aria-hidden="true"
          className={cn(
            'ml-auto shrink-0 text-xs font-semibold tabular-nums',
            complete ? 'text-status-done' : 'text-muted-foreground',
          )}
        >
          {Math.round(percent)}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label ?? 'Tiến độ bài học'}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        {/*
          ⛔ Đúng MỘT `style` chạy lúc runtime, y như bản trước — không thêm cái
          thứ hai. Mỗi thuộc tính `style` inline là một lý do nữa để CSP phải
          giữ `style-src 'unsafe-inline'`; bề rộng thì không diễn đạt được bằng
          class tĩnh vì nó là số liên tục. Màu thì diễn đạt được, nên nó ở
          `className`.
        */}
        <div
          className={cn(
            'h-full rounded-full transition-[width]',
            MOTION_SLOW,
            complete ? 'bg-status-done' : 'bg-status-progress',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
