import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { isUuid } from '../../../../components/admin/route-params';
import { AdminClassDetailClient } from './class-detail-client';

/**
 * `/admin/classes/[classId]`: sinh viên của một lớp và bảng điểm.
 *
 * Cổng vai trò nằm ở `app/admin/layout.tsx`, bọc mọi đường dưới `/admin`.
 * `classId` không phải uuid thì 404 ngay ở đây (lý do: `route-params.ts`).
 */
export default async function AdminClassDetailPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}): Promise<ReactElement> {
  const { classId } = await params;
  if (!isUuid(classId)) {
    notFound();
  }
  return <AdminClassDetailClient classId={classId} />;
}
