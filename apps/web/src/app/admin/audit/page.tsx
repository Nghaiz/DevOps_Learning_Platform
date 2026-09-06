import type { ReactElement } from 'react';
import { AdminAuditClient } from './audit-client';

/**
 * `/admin/audit`. Server Component mỏng — cổng vai trò ở `layout.tsx`, dữ liệu
 * lấy phía client qua `admin.audit.list` (cursor, mới nhất trước).
 */
export default function AdminAuditPage(): ReactElement {
  return <AdminAuditClient />;
}
