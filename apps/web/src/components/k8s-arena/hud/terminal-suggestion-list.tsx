'use client';

import type { ReactElement } from 'react';
import { cn } from '@devops-platform/ui';
import type { Suggestion } from './terminal-suggest-vocab.ts';

export interface TerminalSuggestionListProps {
  readonly suggestions: readonly Suggestion[];
  readonly highlight: number;
}

/**
 * Danh sách gợi ý nằm ngay trên ô nhập.
 *
 * Trả `null` khi rỗng chứ không render một khung trống: một dải xám không có gì
 * trong đó đọc ra là "đang tải" hoặc "hỏng", mà thật ra nó chỉ đang nói "không
 * có gợi ý nào cho thứ bạn vừa gõ".
 *
 * ⚠ Không phải `role="listbox"` / `option`: mẫu combobox của WAI-ARIA đòi ô nhập
 * mang `aria-activedescendant` trỏ tới mục đang chọn, và khai một nửa mẫu đó còn
 * tệ hơn không khai — trình đọc màn hình sẽ thông báo một hộp chọn mà bàn phím
 * không đi được theo cách nó vừa hứa. Ở đây là một `<ul>` thường, và cái đang
 * chọn nói bằng `aria-current`.
 */
export function TerminalSuggestionList({
  suggestions,
  highlight,
}: TerminalSuggestionListProps): ReactElement | null {
  if (suggestions.length === 0) {
    return null;
  }
  const index = Math.min(highlight, suggestions.length - 1);
  return (
    <ul className="max-h-40 overflow-y-auto border-t border-border bg-muted px-1 py-1">
      {suggestions.map((item, position) => (
        <li
          key={item.value}
          aria-current={position === index}
          className={cn(
            'flex items-baseline gap-2 rounded-sm px-2 py-0.5 text-xs',
            position === index ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
          )}
        >
          <span className="font-mono text-foreground">{item.value}</span>
          <span className="truncate">{item.hint}</span>
        </li>
      ))}
    </ul>
  );
}
