'use client';

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

const CHOICES: readonly { readonly value: ThemeChoice; readonly label: string }[] = [
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
  { value: 'system', label: 'Theo hệ thống' },
];

/**
 * Chuyển giao diện sáng / tối / theo hệ thống (D2, `useTheme()` của C1).
 *
 * Nhãn nút cố định là "Giao diện" chứ không phải "Sáng"/"Tối" theo trạng thái
 * hiện tại — CÓ CHỦ ĐÍCH. `ThemeProvider` khởi tạo state bằng `localStorage`,
 * thứ server không đọc được: một nút hiển thị theo `choice` sẽ render "Theo hệ
 * thống" ở HTML server rồi "Tối" ở lần render client đầu tiên, và React báo
 * hydration mismatch. Nội dung menu thì không dính vì Radix chỉ mount nó khi mở
 * (sau hydrate).
 */
export function ThemeToggle() {
  const { choice, setChoice } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          Giao diện
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>Giao diện</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CHOICES.map(({ value, label }) => (
          <DropdownMenuItem
            key={value}
            className="justify-between"
            onSelect={() => setChoice(value)}
          >
            <span>{label}</span>
            {choice === value ? (
              <>
                <span aria-hidden="true" className="text-primary">
                  ✓
                </span>
                <span className="sr-only">(đang dùng)</span>
              </>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
