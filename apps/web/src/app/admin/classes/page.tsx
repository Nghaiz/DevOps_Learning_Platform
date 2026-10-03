import type { ReactElement } from 'react';
import { AdminClassesClient } from './classes-client';

/**
 * `/admin/classes`: ô tạo lớp và danh sách lớp.
 *
 * Server Component MỎNG: cổng vai trò nằm ở `app/admin/layout.tsx`. Không có
 * dữ liệu server nào phải nhét xuống prop: chủ lớp của mỗi dòng đi kèm danh
 * sách, và `classes.create` lấy người gọi từ `ctx.user`.
 */
export default function AdminClassesPage(): ReactElement {
  return <AdminClassesClient />;
}
