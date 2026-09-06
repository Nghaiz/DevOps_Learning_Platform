'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
        {/* `max-w-24` ở màn hẹp: một tên dài không được đẩy nút Giao diện và
            nút Menu tràn xuống dòng thứ hai của thanh đầu trang. */}
        <Button variant="ghost" size="sm" className="max-w-24 sm:max-w-40">
          <span className="truncate">{viewer.name === '' ? viewer.email : viewer.name}</span>
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
        {items.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href}>{item.label}</Link>
          </DropdownMenuItem>
        ))}
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
          {signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
