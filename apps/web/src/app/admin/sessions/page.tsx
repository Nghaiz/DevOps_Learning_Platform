import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';
import { readViewerSession } from '../../../components/catalog/viewer-role.server';
import { AdminSessionsClient } from './sessions-client';

/**
 * `/admin/sessions`.
 *
 * Cần id của admin đang đăng nhập để đánh dấu phiên nào là của CHÍNH họ trong
 * bảng — không phải để phân quyền (cổng nằm ở `layout.tsx`), mà để câu xác nhận
 * nói đúng: kết thúc phiên của chính mình từ đây vẫn được ghi là một hành động
 * quản trị, không phải một lần tự kết thúc ở `/me`.
 */
export default async function AdminSessionsPage(): Promise<ReactElement> {
  const session = await readViewerSession();
  if (session === null) {
    redirect('/login');
  }

  return <AdminSessionsClient viewerId={session.user.id} />;
}
