'use client';

import type { ReactElement } from 'react';
import { cn } from '@devops-platform/ui';

export interface ContextMenuItemProps {
  readonly label: string;
  /** Câu giải thích ngắn hiện khi rê chuột — nói HỆ QUẢ, không nhắc lại nhãn. */
  readonly hint: string;
  readonly danger?: boolean;
  /**
   * Mục có mặt nhưng chưa dùng được (ví dụ "Sắp xếp lại" khi chưa kéo gì).
   *
   * Ẩn hẳn thì menu đổi chiều cao giữa hai lần mở và người dùng mất chỗ neo thị
   * giác; để đó và tắt thì họ đọc được rằng chức năng CÓ, chỉ là chưa tới lúc.
   */
  readonly disabled?: boolean;
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
export function ContextMenuItem({
  label,
  hint,
  danger = false,
  disabled = false,
  onSelect,
}: ContextMenuItemProps): ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      title={hint}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'block w-full px-3 py-1.5 text-left text-xs transition-colors',
        'hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent',
        danger ? 'text-destructive' : 'text-foreground',
      )}
    >
      {label}
    </button>
  );
}
