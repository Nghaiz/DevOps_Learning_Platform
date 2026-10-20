'use client';

import { useId, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { cn, LINE_CLASSES } from '@devops-platform/ui';
import { lineFillClass, type TopicLine } from '../../../components/kit';
import { fieldPathProps } from '../../../components/author/studio';

/**
 * Một mục lặp của trình soạn đề: node, tài nguyên, mục tiêu, gợi ý.
 *
 * Hình dạng mượn bảng ga: số thứ tự in trong ô vuông màu tuyến của game đang
 * soạn, tên mục, nút thao tác ở phải, rồi các ô nhập. Không hộp nổi, không bóng:
 * vạch màu trên đầu và một đường kẻ mảnh dưới đáy là đủ tách hai mục.
 *
 * `path` rải `data-field-path` lên cả khối, để một lỗi cấp mục (`objectives.2`)
 * nhảy được về đúng mục đó dù không trỏ vào ô nào bên trong.
 */
export function ItemBlock(props: {
  readonly index: number;
  readonly title: string;
  readonly line: TopicLine;
  readonly actions?: ReactNode;
  readonly path?: string;
  readonly children: ReactNode;
}): ReactElement {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      {...fieldPathProps(props.path)}
      className="stagger animate-rise border-b border-border"
      style={{ '--i': props.index } as CSSProperties}
    >
      <div aria-hidden="true" className={cn('h-0.5', lineBarClass(props.line))} />
      <header className="flex flex-wrap items-center gap-3 py-3">
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex h-7 min-w-7 items-center justify-center px-1.5 font-mono text-xs font-medium tabular-nums',
            lineFillClass(props.line),
          )}
        >
          {String(props.index + 1).padStart(2, '0')}
        </span>
        <h3 id={headingId} className="min-w-0 flex-1 truncate type-title">
          {props.title}
        </h3>
        {props.actions !== undefined && <div className="flex flex-wrap items-center gap-1">{props.actions}</div>}
      </header>
      <div className="flex flex-col gap-5 pb-6">{props.children}</div>
    </section>
  );
}

/** Vạch màu tuyến. Tuyến `ink` (game chưa có màu) rơi về vạch mực, không đoán màu. */
export function lineBarClass(line: TopicLine): string {
  return line === 'ink' ? 'bg-foreground' : LINE_CLASSES[line].bg;
}
