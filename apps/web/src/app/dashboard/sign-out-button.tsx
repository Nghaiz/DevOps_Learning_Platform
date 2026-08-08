'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@devops-platform/ui';

export function SignOutButton() {
  const router = useRouter();

  async function onSignOut() {
    // Gọi route logout TỰ VIẾT chứ không phải authClient.signOut(): route đó là
    // NƠI DUY NHẤT thu hồi refresh token (revocation, luật 7) — nó cũng signOut
    // session Better Auth server-side rồi xoá cả 3 cookie. Gọi thẳng
    // authClient.signOut() là đăng xuất mà refresh token vẫn sống 7 ngày.
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <Button variant="secondary" onClick={() => void onSignOut()}>
      Đăng xuất
    </Button>
  );
}
