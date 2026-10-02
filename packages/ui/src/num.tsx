import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn.ts';
import { LINE_CLASSES, LINE_IDS, type LineId } from './lines.ts';

export type NumTone = 'default' | 'primary' | 'success' | 'warning' | 'destructive' | LineId;

export interface NumProps extends Omit<ComponentProps<'span'>, 'children'> {
  readonly children: ReactNode;
  readonly tone?: NumTone;
}

/**
 * Mực CHỮ cho từng sắc thái. `primary` ra `text-brand`, không phải
 * `text-primary`: `--primary` là màu TÔ NỀN của nút, còn `--brand` là bản đỏ đã
 * được chỉnh để đứng làm chữ trên nền trang (design-brief §2.2). Tuyến chủ đề
 * cũng vậy — chữ dùng `-ink`, không dùng màu tô.
 */
const STATUS_TONE: Record<Exclude<NumTone, LineId>, string> = {
  default: '',
  primary: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

function toneClass(tone: NumTone): string {
  return (LINE_IDS as readonly string[]).includes(tone)
    ? LINE_CLASSES[tone as LineId].ink
    : STATUS_TONE[tone as Exclude<NumTone, LineId>];
}

/**
 * Con số nằm TRONG câu (design-brief §4.8): "Đang chạy <Num>12</Num> phiên".
 * Thay cho hàng thẻ số liệu. Chữ số cùng bề rộng để số đổi không làm câu nhảy.
 */
export function Num({ children, tone = 'default', className, ...props }: NumProps) {
  return (
    <span
      data-slot="num"
      data-tone={tone}
      className={cn('font-display font-extrabold tabular-nums', toneClass(tone), className)}
      {...props}
    >
      {children}
    </span>
  );
}
