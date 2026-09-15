import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { t } from '@devops-platform/copy';

import { readViewerSession } from '../../../../components/catalog/viewer-role.server';
import { ExamSittingClient } from './exam-sitting-client';

export const metadata: Metadata = {
  title: t('exam.meta-title'),
  description: t('exam.meta-description'),
};

/**
 * `/exams/:examId` (§18.G.4) , màn làm bài.
 *
 * Server Component kiểm auth THẬT (đụng DB), cùng khuôn `/exams` và `/problems`.
 *
 * ⚠ KHÔNG nạp kỳ thi ở đây rồi truyền xuống prop, dù trang chi tiết bài tập làm
 * thế. Lý do: màn này SỐNG theo thời gian , đồng hồ phải hỏi lại máy chủ định
 * kỳ, và một bản chụp render-time sẽ là nguồn thứ hai lệch dần khỏi nguồn thứ
 * nhất. Client tự gọi `examSitting.get` và giữ đúng một nguồn.
 *
 * Tiêu đề tab là tiêu đề CHUNG chứ không phải tên kỳ thi: `generateMetadata`
 * cho tên riêng sẽ cần một lượt đọc DB nữa chỉ để đặt chữ trên tab, và nó chạy
 * trước cả cổng thành viên lớp , tức tên kỳ thi của một lớp khác lọt ra tab
 * trình duyệt của người không thuộc lớp đó.
 */
export default async function ExamSittingPage({
  params,
}: {
  readonly params: Promise<{ readonly examId: string }>;
}) {
  if ((await readViewerSession()) === null) {
    redirect('/login');
  }
  const { examId } = await params;
  return <ExamSittingClient examId={examId} />;
}
