'use client';

import { Check, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useTheme,
  type ThemeChoice,
} from '@devops-platform/ui';

const CHOICES: readonly {
  readonly value: ThemeChoice;
  readonly label: string;
  readonly icon: LucideIcon;
}[] = [
  { value: 'light', label: 'Sáng', icon: Sun },
  { value: 'dark', label: 'Tối', icon: Moon },
  { value: 'system', label: 'Theo hệ thống', icon: Monitor },
];

/**
 * Chuyển giao diện sáng / tối / theo hệ thống (D2, `useTheme()` của C1).
 *
 * ## Vì sao mặt trời/mặt trăng vẽ bằng CSS, KHÔNG chọn bằng `choice`
 *
 * Nút này từng mang chữ "Giao diện" cố định, và lý do ghi ở đây rất đáng giữ:
 * `ThemeProvider` khởi tạo state từ `localStorage` — thứ server không đọc được
 * — nên bất kỳ nội dung nút nào SUY RA TỪ `choice` sẽ render một đằng ở HTML
 * server và một nẻo ở lần render client đầu, tức hydration mismatch. Đổi sang
 * `{choice === 'dark' ? <Moon/> : <Sun/>}` là dẫm lại đúng cái bẫy đó.
 *
 * Ở đây render CẢ HAI icon rồi để CSS ẩn một cái (`dark:hidden` /
 * `hidden dark:block`). Cây React giống hệt nhau ở server và client nên không
 * có gì để lệch; class `.dark` trên `<html>` do `THEME_INIT_SCRIPT` đặt TRƯỚC
 * PAINT (xem `app/layout.tsx`), nên icon đúng đã hiện ngay khung hình đầu tiên,
 * không nháy.
 *
 * Icon KHÔNG mang nhãn (`aria-hidden`); tên khả truy cập do `sr-only` cấp —
 * nút chỉ có icon nên nếu thiếu chuỗi đó nó sẽ vô danh với trình đọc màn hình.
 */
export function ThemeToggle() {
  const { choice, setChoice } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="w-8 px-0">
          <Sun aria-hidden="true" className="size-4 dark:hidden" />
          <Moon aria-hidden="true" className="hidden size-4 dark:block" />
          <span className="sr-only">Giao diện</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>Giao diện</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CHOICES.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            className="justify-between"
            onSelect={() => setChoice(value)}
          >
            <span className="inline-flex items-center gap-2">
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {label}
            </span>
            {choice === value ? (
              <>
                <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <span className="sr-only">(đang dùng)</span>
              </>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
