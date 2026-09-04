import type { ComponentProps } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn.ts';

export type SpinnerSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-8',
};

export interface SpinnerProps extends Omit<ComponentProps<'svg'>, 'width' | 'height'> {
  readonly size?: SpinnerSize;
}

/** Icon xoay dùng chung cho mọi trạng thái loading (Button, ErrorState đang thử lại, …). */
export function Spinner({ size = 'md', className, ...props }: SpinnerProps) {
  return (
    <Loader2
      role="status"
      aria-label="Đang tải"
      className={cn('animate-spin text-current', SIZE_CLASSES[size], className)}
      {...props}
    />
  );
}
