'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useToast,
} from '@devops-platform/ui';
import { userMenuItems, type Viewer } from './nav';
import { USER_MENU_ICONS } from './nav-icons';
import { avatarInitials } from './initials';

export function UserMenu({ viewer }: { readonly viewer: Viewer }) {
  const router = useRouter();
  const { toast } = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const items = userMenuItems(viewer.role);

  /**
   * ⛔ Gọi route logout TỰ VIẾT, KHÔNG phải `authClient.signOut()`.
   *
   * `/api/auth/logout` là NƠI DUY NHẤT thu hồi refresh token (luật 7); nó cũng
   * signOut session Better Auth phía server rồi xoá cả ba cookie. Gọi thẳng
   * `authClient.signOut()` là "đăng xuất" mà refresh token vẫn sống 7 ngày —
   * và triệu chứng của lỗi đó là KHÔNG CÓ triệu chứng nào cho tới lúc bị lạm
   * dụng. (Lý lẽ này đến từ `app/dashboard/sign-out-button.tsx`, file bị thay
   * bởi menu này ở 13.B.)
   */
  async function onSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`HTTP ${String(response.status)}`);
      }
    } catch (error: unknown) {
      console.error('[auth] đăng xuất thất bại', error);
      // KHÔNG điều hướng khi thu hồi thất bại: cookie phiên vẫn còn, nên
      // `/login` sẽ bị `proxy.ts` đẩy ngược về `/me` và người dùng kết luận
      // "bấm đăng xuất không ăn thua" mà không biết vì sao.
      toast({
        title: 'Chưa đăng xuất được',
        description:
          'Máy chủ không phản hồi nên phiên chưa bị thu hồi. Kiểm tra kết nối rồi thử lại; nếu đang dùng máy chung, hãy đóng hẳn trình duyệt.',
        variant: 'destructive',
      });
      setSigningOut(false);
      return;
    }
    router.push('/login');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/*
          Avatar chữ cái thay cho chuỗi tên/email in thẳng ra thanh nav.

          Bản cũ `max-w-24 … truncate` giải đúng bài toán CHỖ, nhưng giải bằng
          cách cắt cụt: tên dài thành "Nguyễn Thị B…", và khi `name` rỗng thì
          nó in cả địa chỉ email — dữ liệu cá nhân nằm thường trực trên mọi màn
          hình được chia sẻ hay chiếu lên máy chiếu. Hai chữ cái không cắt được
          nữa, và tên + email đầy đủ vẫn nằm trong menu khi người dùng chủ động
          mở ra.

          `aria-hidden` cho hình tròn, tên khả truy cập do `sr-only` cấp: chuỗi
          hai chữ cái đọc lên là vô nghĩa với trình đọc màn hình.
        */}
        <Button variant="ghost" size="sm" className="w-8 px-0">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
          >
            {avatarInitials(viewer.name, viewer.email)}
          </span>
          <span className="sr-only">
            Tài khoản{viewer.name === '' ? '' : ` của ${viewer.name}`}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="text-foreground">
          <span className="block truncate font-medium">
            {viewer.name === '' ? 'Tài khoản' : viewer.name}
          </span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {viewer.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item) => {
          const Icon = USER_MENU_ICONS[item.href];
          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href} className="flex items-center gap-2">
                {Icon === undefined ? null : (
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                )}
                {item.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={(event) => {
            // Giữ menu mở trong lúc chờ: đóng ngay rồi thất bại sẽ để lại một
            // toast lỗi không còn ngữ cảnh nào giải thích nó đến từ đâu.
            event.preventDefault();
            void onSignOut();
          }}
        >
          <span className="flex items-center gap-2">
            <LogOut aria-hidden="true" className="size-4 shrink-0" />
            {signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
