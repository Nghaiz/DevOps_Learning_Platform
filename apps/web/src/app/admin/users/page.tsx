import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';
import { readViewerSession } from '../../../components/catalog/viewer-role.server';
import { AdminUsersClient } from './users-client';

/**
 * `/admin/users`.
 *
 * Cần id của admin đang đăng nhập để chặn TỰ hạ quyền ngay trên giao diện (luật
 * cũng có ở server — `setUserRole` ném `FORBIDDEN`). Đọc qua
 * `readViewerSession` (memo hoá `cache()`) nên nó gộp với lượt đọc của
 * `layout.tsx` thành MỘT lần đụng DB.
 *
 * `redirect('/login')` ở đây là đường không bao giờ chạy trong thực tế —
 * `layout.tsx` đã chặn trước. Nó tồn tại vì TypeScript: `session` có kiểu
 * `| null`, và ép kiểu bằng `!` ở một trang quản trị là đúng chỗ để một
 * `undefined` biến thành `actorId` rỗng, thứ làm phép chặn tự hạ quyền im lặng
 * mất tác dụng (rỗng !== id nào cả).
 */
export default async function AdminUsersPage(): Promise<ReactElement> {
  const session = await readViewerSession();
  if (session === null) {
    redirect('/login');
  }

  return <AdminUsersClient actorId={session.user.id} />;
}
