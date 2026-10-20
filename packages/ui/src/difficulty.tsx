import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

export type DifficultyLevel = 'basic' | 'intermediate' | 'advanced' | 'expert';

export interface DifficultyProps extends Omit<ComponentProps<'span'>, 'children'> {
  readonly level: DifficultyLevel;
  /** Hiện nhãn chữ cạnh glyph. Không có `label` thì không có gì để hiện. */
  readonly showLabel?: boolean;
  /**
   * Tên mức độ khó ("Cơ bản", …). Primitive không tự mang chữ tiếng Việt —
   * nơi gọi lấy từ `packages/copy` rồi truyền vào. Không hiện nhãn thì chuỗi
   * này thành tên trợ năng của glyph.
   */
  readonly label?: string;
}

/** Số vạch đặc theo mức: thứ tự đọc được ngay trên bản in đen trắng. */
const FILLED: Record<DifficultyLevel, number> = {
  basic: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
};

/** Chiều cao bốn vạch, tăng dần như cột sóng tín hiệu. */
const BAR_HEIGHT = ['h-1', 'h-2', 'h-3', 'h-4'] as const;

/**
 * Độ khó: bốn vạch tăng dần, đặc theo mức, không mang sắc độ (design-brief §5:
 * sắc độ dành riêng cho tuyến chủ đề). Vạch tô bằng `currentColor` nên đặt
 * trong khối mực đảo màu vẫn đúng.
 */
export function Difficulty({ level, showLabel = false, label, className, ...props }: DifficultyProps) {
  const filled = FILLED[level];
  const hasLabel = label !== undefined && label !== '';
  const visibleLabel = showLabel && hasLabel;
  const glyphNamed = hasLabel && !visibleLabel;

  return (
    <span
      data-slot="difficulty"
      data-level={level}
      className={cn('inline-flex shrink-0 items-center gap-1.5 text-xs font-medium', className)}
      {...props}
    >
      <span
        data-slot="difficulty-glyph"
        role={glyphNamed ? 'img' : undefined}
        aria-label={glyphNamed ? label : undefined}
        aria-hidden={glyphNamed ? undefined : true}
        className="inline-flex h-4 items-end gap-0.5"
      >
        {BAR_HEIGHT.map((height, index) => (
          <span
            key={height}
            data-filled={index < filled ? 'true' : 'false'}
            className={cn('w-1', height, index < filled ? 'bg-current' : 'bg-current/25')}
          />
        ))}
      </span>
      {visibleLabel && <span>{label}</span>}
    </span>
  );
}
