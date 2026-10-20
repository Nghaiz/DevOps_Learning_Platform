'use client';

import { useId, type ReactElement, type ReactNode } from 'react';
import { fieldPathProps } from '../../../components/author/studio';

/**
 * Một mục lặp của trình soạn đề: node, tài nguyên, mục tiêu, gợi ý.
 *
 * Số thứ tự trong ô tròn mang màu của game đang soạn (`data-topic` đặt ở gốc trình
 * soạn), tên mục, nút thao tác ở phải, rồi các ô nhập. Không hộp nổi, không bóng: một
 * vạch màu mảnh trên đầu và đường kẻ dưới đáy là đủ tách hai mục.
 *
 * `path` rải `data-field-path` lên cả khối, để một lỗi cấp mục (`objectives.2`) nhảy
 * được về đúng mục đó dù không trỏ vào ô nào bên trong.
 */
export function ItemBlock(props: {
  readonly index: number;
  readonly title: string;
  readonly actions?: ReactNode;
  readonly path?: string;
  readonly children: ReactNode;
}): ReactElement {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} {...fieldPathProps(props.path)} className="group/item animate-enter border-b border-rule">
      <div aria-hidden="true" className="h-0.5 origin-left scale-x-50 bg-tp-mid transition-transform duration-200 group-focus-within/item:scale-x-100" />
      <header className="flex flex-wrap items-center gap-3 py-3">
        <span
          aria-hidden="true"
          className="inline-flex size-7 items-center justify-center rounded-full bg-tp-tint text-xs font-semibold tabular-nums text-tp-ink"
        >
          {props.index + 1}
        </span>
        <h3 id={headingId} className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-ink">
          {props.title}
        </h3>
        {props.actions === undefined ? null : <div className="flex flex-wrap items-center gap-1">{props.actions}</div>}
      </header>
      <div className="flex flex-col gap-5 pb-6">{props.children}</div>
    </section>
  );
}
