'use client';

import type { ReactElement } from 'react';
import { cn } from '@devops-platform/ui';
import type { Suggestion } from './terminal-suggest-vocab.ts';
import { HUD_SCROLL_HIDDEN } from './top-bar.tsx';

export interface TerminalSuggestionListProps {
  readonly suggestions: readonly Suggestion[];
  readonly highlight: number;
}

/**
 * Danh sách gợi ý NỔI ngay trên ô nhập.
 *
 * ## Vì sao nổi, không nằm trong dòng chảy bố cục
 *
 * Bản trước là một phần tử thường, nằm GIỮA bảng kết quả và ô nhập. Mỗi ký tự
 * gõ vào làm số gợi ý đổi, chiều cao khối đổi theo, và bảng kết quả bên trên bị
 * đẩy lên đẩy xuống theo từng phím — đúng thứ chủ dự án gọi là *"nhảy UI"*. Tệ
 * nhất là lúc gợi ý biến mất hẳn: cả bảng kết quả nhảy một nhịp 40px xuống dưới
 * ngay giữa lúc người ta đang đọc nó.
 *
 * Nay nó `absolute bottom-full`: chồng LÊN bảng kết quả thay vì đẩy nó. Không
 * một pixel nào của phần còn lại dịch chuyển khi danh sách xuất hiện hay biến mất.
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
    <ul
      className={cn(
        'absolute inset-x-3 bottom-full z-10 mb-1 max-h-44 overflow-y-auto rounded-md',
        'border border-border bg-popover/95 p-1 shadow-elevation-3 backdrop-blur-md',
        HUD_SCROLL_HIDDEN,
      )}
    >
      {suggestions.map((item, position) => (
        <li
          key={item.value}
          aria-current={position === index}
          className={cn(
            'flex items-baseline gap-2 rounded-sm px-2 py-1 text-xs transition-colors',
            position === index
              ? 'bg-status-progress/15 text-foreground ring-1 ring-status-progress/40'
              : 'text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'font-mono',
              position === index ? 'text-status-progress' : 'text-foreground',
            )}
          >
            {item.value}
          </span>
          <span className="truncate">{item.hint}</span>
          {position === index ? (
            <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
              Tab
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
