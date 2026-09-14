import type { ComponentProps } from 'react';
import {
  ARC_STROKE,
  ARC_STROKE_HAIRLINE,
  ARC_VIEWBOX,
  arcSpinnerProps,
} from '@devops-platform/motion/motif';
import { cn } from './cn.ts';

export type SpinnerSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-8',
};

/**
 * Bề dày nét theo cỡ — KHÔNG phải một hằng số duy nhất, và lý do là hình học
 * chứ không phải thẩm mỹ.
 *
 * `arcSpinnerProps` đặt `vectorEffect: 'non-scaling-stroke'` (§8.2), nghĩa là
 * `strokeWidth` KHÔNG co theo `viewBox` — nó là số pixel màn hình. Một nét
 * `ARC_STROKE` = 4px trên hộp `size-4` (16px) chiếm một phần tư đường kính:
 * vòng ellipse đặc lại thành một cục và khe hở 60° biến mất. Cùng nét đó trên
 * `size-8` (32px) thì đúng cân đối.
 *
 * Bỏ `non-scaling-stroke` đi cũng không cứu được: khi đó tỉ lệ trục 1.4 của
 * ellipse làm nét DÀY MỎNG khác nhau dọc theo cung (xem `ArcStrokeProps`).
 * Chọn nét theo cỡ là đường duy nhất giữ được cả hai.
 */
const SIZE_STROKE: Record<SpinnerSize, number> = {
  sm: ARC_STROKE_HAIRLINE,
  md: ARC_STROKE_HAIRLINE,
  lg: ARC_STROKE,
};

export interface SpinnerProps extends Omit<ComponentProps<'svg'>, 'width' | 'height'> {
  readonly size?: SpinnerSize;
}

/**
 * Trạng thái đang tải dùng chung (Button, ErrorState đang thử lại, …).
 *
 * ## Vì sao là cung ellipse, không phải `Loader2` của lucide
 *
 * Design §3 chốt trạng thái đang tải là "chính vòng ellipse đang tự vẽ ra".
 * Bản trước dùng `Loader2` + `animate-spin`: một hình QUAY, không phải một hình
 * TỰ VẼ, và là hình của thư viện chứ không phải hình của hệ. Hai điều khác nhau
 * đáng kể — vòng quay nói "đang bận", cung tự vẽ nói "đang tiến tới đâu đó", và
 * cái thứ hai mới là vòng reconciliation mà cả thiết kế dựng quanh.
 *
 * ## Cổng giảm chuyển động nằm ở CSS, không ở JS
 *
 * `arcSpinnerProps` phát ra `animation: dlp-arc-sweep … infinite alternate`,
 * trỏ vào `@keyframes` đã có trong `apps/web/src/app/globals.css`. Khối
 * `@media (prefers-reduced-motion: reduce)` ngay dưới đó hạ
 * `animation-duration` xuống `0.01ms` và `animation-iteration-count` xuống `1`
 * bằng `!important` trên bộ chọn phổ quát, nên vòng lặp vô hạn biến thành một
 * lượt vẽ tĩnh ở dạng ĐẦY. Không cần `useReducedMotion` ở đây, và thêm nó vào
 * sẽ kéo cả file sang `'use client'` cho một component thuần trình bày.
 *
 * ⚠ Hệ quả phải nhớ: thiếu khối `@keyframes` đó thì tên animation trỏ vào hư
 * không, trình duyệt bỏ qua trong IM LẶNG, và cung đứng yên ở dạng đầy — trông
 * y hệt một thanh tiến độ đã xong. `packages/motion/src/motif.test.ts` đọc
 * `globals.css` và đối chiếu tên, nên lần lệch sau sẽ đỏ.
 *
 * `data-slot="spinner"` là móc để test tìm ra nó khi nó nằm trong lớp bọc
 * `aria-hidden` của Button (ở đó `getByRole('status')` không thấy được). Bản
 * trước móc vào class `animate-spin`, thứ vừa biến mất cùng `Loader2`.
 */
export function Spinner({ size = 'md', className, ...props }: SpinnerProps) {
  return (
    <svg
      data-slot="spinner"
      role="status"
      aria-label="Đang tải"
      viewBox={ARC_VIEWBOX}
      className={cn('text-current', SIZE_CLASSES[size], className)}
      {...props}
    >
      {/*
        KHÔNG có rãnh (`arcTrackProps`) sau lưng cung này, cố ý. Rãnh dùng
        `var(--border)`/`var(--input)`, hai token định nghĩa trên nền BỀ MẶT;
        Spinner thì hay nằm giữa một nút `bg-primary` hoặc `bg-destructive`,
        nơi cả hai token đó đọc ra sai. Cung chạy một mình vẫn kể đủ câu chuyện
        "đang vẽ ra", và nó thừa hưởng `currentColor` nên luôn đúng nền.
      */}
      <path {...arcSpinnerProps({ width: SIZE_STROKE[size] })} />
    </svg>
  );
}
