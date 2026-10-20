import type { ComponentProps } from 'react';
import { cn } from './cn.ts';
import { LINE_CLASSES, LINE_IDS, type LineId } from './lines.ts';

export type MeterTone = 'primary' | 'success' | 'warning' | 'destructive' | LineId;

export interface MeterProps extends Omit<ComponentProps<'div'>, 'children' | 'role'> {
  readonly value: number;
  readonly max: number;
  /** Chia thước thành N đoạn rời. Bỏ trống ⇒ một thanh liền. */
  readonly segments?: number;
  readonly tone?: MeterTone;
  /** Tên trợ năng của thước ("Sức chứa máy chủ"). Bắt buộc: thước không có chữ nào khác. */
  readonly label: string;
}

const STATUS_TONE: Record<Exclude<MeterTone, LineId>, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
};

function toneClass(tone: MeterTone): string {
  return (LINE_IDS as readonly string[]).includes(tone)
    ? LINE_CLASSES[tone as LineId].bg
    : STATUS_TONE[tone as Exclude<MeterTone, LineId>];
}

/** Giá trị kẹp về [0, max]; `max` ≤ 0 hoặc không hữu hạn ⇒ thước rỗng. */
function ratioOf(value: number, max: number): number {
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(value)) return 0;
  return Math.min(Math.max(value / max, 0), 1);
}

/**
 * Số đoạn được tô. Làm tròn thường, NHƯNG không bao giờ tô 0 đoạn khi còn giá
 * trị dương, cũng không tô kín khi chưa đầy: 1/30 chỗ mà thước trống trơn
 * thì đọc thành "chưa ai dùng", 29/30 mà thước kín thì đọc thành "hết chỗ".
 */
export function filledSegments(ratio: number, segments: number): number {
  if (ratio <= 0) return 0;
  if (ratio >= 1) return segments;
  return Math.min(Math.max(Math.round(ratio * segments), 1), segments - 1);
}

/**
 * Thước đo ngang (design-brief §4.7): sức chứa, tiến độ, điểm. Thay cho thẻ số
 * liệu. Mang `role="meter"` + `aria-valuenow/min/max`, nên trình đọc màn hình
 * đọc được giá trị mà không cần chữ đi kèm.
 */
export function Meter({ value, max, segments, tone = 'primary', label, className, ...props }: MeterProps) {
  const ratio = ratioOf(value, max);
  const hasRange = Number.isFinite(max) && max > 0;
  const clamped = hasRange && Number.isFinite(value) ? Math.min(Math.max(value, 0), max) : 0;
  const fill = toneClass(tone);
  const segmentCount = segments !== undefined && Number.isInteger(segments) && segments > 0 ? segments : 0;

  return (
    <div
      data-slot="meter"
      data-tone={tone}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={hasRange ? max : 0}
      aria-valuenow={clamped}
      className={cn('flex h-2 w-full', segmentCount > 0 ? 'gap-0.5' : 'overflow-hidden bg-muted', className)}
      {...props}
    >
      {segmentCount > 0 ? (
        Array.from({ length: segmentCount }, (_, index) => {
          const isFilled = index < filledSegments(ratio, segmentCount);
          return (
            <span
              key={index}
              data-slot="meter-segment"
              data-filled={isFilled ? 'true' : 'false'}
              className={cn('h-full flex-1', isFilled ? fill : 'bg-muted')}
            />
          );
        })
      ) : (
        <span
          data-slot="meter-fill"
          className={cn(
            'h-full w-full origin-left transition-transform duration-[var(--motion-slow)] ease-out',
            fill,
          )}
          style={{ transform: `scaleX(${ratio})` }}
        />
      )}
    </div>
  );
}
