import type { ReactElement } from 'react';
import { AdminOverviewClient } from './overview-client';

/**
 * `/admin`, tổng quan.
 *
 * Server Component MỎNG: cổng vai trò nằm ở `layout.tsx` (bọc mọi đường dưới
 * `/admin`), và trang này không cần dữ liệu server nào. Sức chứa lấy từ
 * `useCapacity()` của vỏ; pool, nguồn metric và nhật ký gần đây lấy phía client.
 */
export default function AdminOverviewPage(): ReactElement {
  return <AdminOverviewClient />;
}
