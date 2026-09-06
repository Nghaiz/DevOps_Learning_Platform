import type { ReactElement } from 'react';
import { AdminOverviewClient } from './overview-client';

/**
 * `/admin` — tổng quan.
 *
 * Server Component MỎNG: cổng vai trò đã nằm ở `layout.tsx` (bọc mọi đường
 * dưới `/admin`), và trang này không cần dữ liệu server nào — sức chứa lấy từ
 * `useCapacity()` của vỏ, sức khoẻ lấy từ `admin.health` phía client.
 */
export default function AdminOverviewPage(): ReactElement {
  return <AdminOverviewClient />;
}
