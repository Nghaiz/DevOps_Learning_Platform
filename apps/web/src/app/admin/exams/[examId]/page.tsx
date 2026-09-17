import type { ReactElement } from 'react';

import { AdminExamDetailClient } from './exam-detail-client';

/**
 * `/admin/exams/:examId` (§18.G.6) , bảng điểm một kỳ thi.
 *
 * Server Component MỎNG, cùng khuôn `/admin/classes/[classId]`: cổng vai trò
 * nằm ở `app/admin/layout.tsx` và bọc mọi đường dưới `/admin`.
 */
export default async function AdminExamDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly examId: string }>;
}): Promise<ReactElement> {
  const { examId } = await params;
  return <AdminExamDetailClient examId={examId} />;
}
