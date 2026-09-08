'use client';

import { type ReactElement } from 'react';
import { cn } from '@devops-platform/ui';
import type { StatusToken } from './scene-tokens';

/**
 * Chú giải màu trạng thái.
 *
 * ## Vì sao nó cần tồn tại
 *
 * Trên ảnh chụp 1920 của bản trước, hai pod cạnh nhau ra hai màu khác nhau —
 * xanh lá và xanh dương — và không có gì trên màn hình nói vì sao. Màu đó KHÔNG
 * tuỳ tiện: `view.ts` gán `success` cho pod Running-VÀ-Ready, `status-progress`
 * cho pod Running-nhưng-CHƯA-Ready, và chính lane B ghi trong mã rằng phân biệt
 * đó là một điểm dạy học cố ý.
 *
 * Nhưng một phân biệt dạy học mà người học không giải mã được thì không dạy gì —
 * nó chỉ là hai màu. Chú giải này là chỗ khoá giải mã sống.
 *
 * ⚠ Đây là chú giải cho MÀU, nên nó phải nói bằng CHỮ. Một hàng chấm màu không
 * kèm nhãn sẽ tái tạo đúng vấn đề nó sinh ra để giải quyết, và vô dụng với người
 * mù màu đỏ-lục — nhóm mà cặp success/destructive của ta ảnh hưởng trực tiếp.
 */
const ROWS: readonly { readonly token: StatusToken; readonly dot: string; readonly label: string }[] = [
  { token: 'success', dot: 'bg-success', label: 'Running và Ready' },
  { token: 'status-progress', dot: 'bg-status-progress', label: 'Running, chưa Ready' },
  { token: 'warning', dot: 'bg-warning', label: 'Thiếu so với mong muốn' },
  { token: 'destructive', dot: 'bg-destructive', label: 'Hỏng hoặc không có pod nào' },
  { token: 'status-locked', dot: 'bg-status-locked', label: 'Đã tắt (0 replica)' },
];

export function StatusLegend({ className }: { readonly className?: string }): ReactElement {
  return (
    <div className={cn('flex flex-col gap-1 px-3 py-2', className)}>
      <h3 className="text-[10px] font-semibold tracking-wider text-muted-foreground">CHÚ GIẢI</h3>
      <ul role="list" className="flex flex-col gap-0.5">
        {ROWS.map((row) => (
          <li key={row.token} className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', row.dot)} />
            {row.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
