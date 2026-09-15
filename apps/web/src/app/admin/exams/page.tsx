import type { ReactElement } from 'react';

import { AdminExamsClient } from './exams-client';

/**
 * `/admin/exams` (§18.G.2) , danh sách kỳ thi và ô ra đề.
 *
 * Server Component MỎNG, cùng khuôn `/admin/classes`: cổng vai trò nằm ở
 * `app/admin/layout.tsx` và bọc mọi đường dưới `/admin`, nên trang này không
 * lặp lại phép kiểm đó. Không có dữ liệu server nào phải nhét xuống prop ,
 * `exams.create` lấy người ra đề từ `ctx.user`, không nhận `ownerId` qua input.
 */
export default function AdminExamsPage(): ReactElement {
  return <AdminExamsClient />;
}
