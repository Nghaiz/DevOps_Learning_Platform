import type { ComponentProps } from 'react';
import { cn } from './cn.ts';
import { LINE_CLASSES, type LineId } from './lines.ts';

export type LineMarkerState = 'todo' | 'current' | 'done' | 'locked';

export interface LineMarkerProps extends Omit<ComponentProps<'span'>, 'children'> {
  readonly line: LineId;
  readonly state?: LineMarkerState;
}

/**
 * Ô ga 12px trên sơ đồ tuyến (design-brief §4.5).
 *
 * | state | hình |
 * |---|---|
 * | `todo` | ô rỗng, viền màu tuyến |
 * | `current` | ô đặc + vòng mực, quầng vàng tín hiệu nhấp nháy ("bạn đang ở đây") |
 * | `done` | ô đặc màu tuyến |
 * | `locked` | ô rỗng, viền xám |
 *
 * Vòng `current` vẽ bằng `outline`, KHÔNG bằng `ring-*`: ring của Tailwind là
 * `box-shadow`, mà keyframe `animate-pulse-station` cũng animate `box-shadow`.
 * Đặt cả hai lên một phần tử thì nhịp đập ghi đè vòng ring ở mọi khung hình,
 * và vòng biến mất đúng lúc nó phải nổi bật nhất.
 *
 * Vòng là MỰC, không phải vàng `signal`: vàng trên nền giấy chỉ ~1.1:1, dưới
 * sàn 3:1 cho thành phần giao diện (review-1 #23). Màu vàng còn lại ở quầng
 * nhấp nháy của `animate-pulse-station`, thứ trang trí thêm chứ không mang
 * nghĩa một mình.
 *
 * Mặc định là glyph trang trí (`aria-hidden`), vì nó luôn đứng cạnh tên bài.
 * Truyền `aria-label` khi ô ga đứng một mình; lúc đó nó mang `role="img"`.
 */
export function LineMarker({ line, state = 'todo', className, ...props }: LineMarkerProps) {
  const lineClasses = LINE_CLASSES[line];
  const labelled = props['aria-label'] !== undefined;
  return (
    <span
      data-slot="line-marker"
      data-line={line}
      data-state={state}
      role={labelled ? 'img' : undefined}
      aria-hidden={labelled ? undefined : true}
      className={cn(
        'inline-block size-3 shrink-0 border-2',
        state === 'todo' && [lineClasses.border, 'bg-card'],
        state === 'current' && [
          lineClasses.border,
          lineClasses.bg,
          'outline-2 outline-offset-2 outline-ink animate-pulse-station',
        ],
        state === 'done' && [lineClasses.border, lineClasses.bg],
        state === 'locked' && 'border-muted-foreground bg-transparent opacity-60',
        className,
      )}
      {...props}
    />
  );
}
