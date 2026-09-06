import type { ReactElement } from 'react';
import { AdminContentClient } from './content-client';

/**
 * `/admin/content`. Server Component mỏng — cổng vai trò ở `layout.tsx`, dữ
 * liệu lấy phía client qua `authoring.list` (admin thấy mọi bài của mọi người).
 */
export default function AdminContentPage(): ReactElement {
  return <AdminContentClient />;
}
