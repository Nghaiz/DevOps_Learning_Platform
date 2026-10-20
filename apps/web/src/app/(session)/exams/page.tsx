import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { t } from '@devops-platform/copy';
import { Page, PageHeader } from '@devops-platform/ds';
import { withReturnPath } from '../../login/return-path';

import { readViewerSession } from '../../../components/catalog/viewer-role.server';
import { ExamsClient } from './exams-client';

export const metadata: Metadata = {
  title: t('exam.meta-title'),
  description: t('exam.meta-description'),
};

/**
 * `/exams`: danh sách kỳ thi của người học.
 *
 * Server Component kiểm auth THẬT (đụng DB), cùng khuôn `/problems`: `proxy.ts` chỉ
 * kiểm SỰ TỒN TẠI của cookie, còn trang này là nguồn sự thật nên nó chặn được cả ca
 * cookie còn nhưng phiên đã bị thu hồi ở DB.
 *
 * Không `<Suspense>`: khác `ProblemsClient`, client ở đây không đọc `useSearchParams`.
 * Danh sách kỳ thi của một người không phân trang và không có bộ lọc nào để giữ
 * trong URL.
 */
export default async function ExamsPage() {
  if ((await readViewerSession()) === null) {
    // Mang đường về theo: đăng nhập xong thì quay lại đúng trang này.
    redirect(withReturnPath('/login', '/exams'));
  }
  return (
    <Page>
      <PageHeader title={t('exam.title')} lead={t('exam.lead')} />
      <ExamsClient />
    </Page>
  );
}
