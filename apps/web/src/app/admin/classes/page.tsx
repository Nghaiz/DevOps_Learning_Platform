import type { ReactElement } from 'react';
import { AdminClassesClient } from './classes-client';

/**
 * `/admin/classes` (18.F.2) — danh sách lớp và ô tạo lớp.
 *
 * Server Component MỎNG, cùng khuôn `/admin`: cổng vai trò đã nằm ở
 * `app/admin/layout.tsx` và bọc mọi đường dưới `/admin`, nên trang này không
 * lặp lại phép kiểm đó. Nó cũng không cần dữ liệu server nào: chủ lớp của mỗi
 * dòng do máy chủ trả kèm danh sách, và `classes.create` lấy người gọi từ
 * `ctx.user` chứ không nhận `ownerId` qua input, nên không có thứ gì phải nhét
 * xuống client dưới dạng prop.
 */
export default function AdminClassesPage(): ReactElement {
  return <AdminClassesClient />;
}
