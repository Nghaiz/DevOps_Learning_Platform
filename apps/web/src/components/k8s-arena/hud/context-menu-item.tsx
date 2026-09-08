'use client';

import type { ReactElement } from 'react';
import { cn } from '@devops-platform/ui';

export interface ContextMenuItemProps {
  readonly label: string;
  /** Câu giải thích ngắn hiện khi rê chuột — nói HỆ QUẢ, không nhắc lại nhãn. */
  readonly hint: string;
  readonly danger?: boolean;
  readonly onSelect: () => void;
}

/**
 * Một mục trong menu chuột phải.
 *
 * Tách khỏi `context-menu.tsx` để giữ file mẹ dưới trần 200 dòng (README §5),
 * không phải vì có nơi thứ hai dùng nó.
 *
 * `<button role="menuitem">` chứ không `<div role="menuitem" tabIndex>`: nút
 * thật đã có sẵn hành vi bàn phím (Enter/Space kích hoạt), trạng thái
 * `disabled`, và ngữ nghĩa cho trình đọc màn hình. Dựng lại bằng `div` là ba
 * thứ phải tự viết và ba chỗ để viết sai.
 */
export function ContextMenuItem({ label, hint, danger = false, onSelect }: ContextMenuItemProps): ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      title={hint}
      onClick={onSelect}
      className={cn(
        'block w-full px-3 py-1.5 text-left text-xs transition-colors',
        'hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
        danger ? 'text-destructive' : 'text-foreground',
      )}
    >
      {label}
    </button>
  );
}
