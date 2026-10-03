import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { isUuid } from '../../../../components/admin/route-params';
import { AdminExamDetailClient } from './exam-detail-client';

/**
 * `/admin/exams/:examId`: thông tin, bảng điểm, sửa, xoá và xuất CSV.
 *
 * Cổng vai trò nằm ở `app/admin/layout.tsx`. `examId` không phải uuid thì 404
 * ngay ở đây, cùng khuôn `/admin/classes/[classId]`: trước bản dựng lại, trang
 * này cho chuỗi bất kỳ đi tiếp và người dùng nhận hai khối lỗi Zod 400 cho một
 * đường dẫn gõ sai.
 */
export default async function AdminExamDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly examId: string }>;
}): Promise<ReactElement> {
  const { examId } = await params;
  if (!isUuid(examId)) {
    notFound();
  }
  return <AdminExamDetailClient examId={examId} />;
}
