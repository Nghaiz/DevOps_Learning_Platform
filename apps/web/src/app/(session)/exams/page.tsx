import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { t } from '@devops-platform/copy';

import { readViewerSession } from '../../../components/catalog/viewer-role.server';
import { ExamsClient } from './exams-client';

export const metadata: Metadata = {
  title: t('exam.meta-title'),
  description: t('exam.meta-description'),
};

/**
 * `/exams` (§18.G.4) , danh sách kỳ thi của người học.
 *
 * Server Component kiểm auth THẬT (đụng DB), cùng khuôn `/problems`: `proxy.ts`
 * chỉ kiểm SỰ TỒN TẠI của cookie, còn trang này là nguồn sự thật nên nó chặn
 * được cả ca cookie còn nhưng phiên đã bị thu hồi ở DB.
 *
 * Không `<Suspense>`: khác `ProblemsClient`, client ở đây không đọc
 * `useSearchParams` , danh sách kỳ thi của một người không phân trang và không
 * có bộ lọc nào để giữ trong URL.
 */
export default async function ExamsPage() {
  if ((await readViewerSession()) === null) {
    redirect('/login');
  }
  return <ExamsClient />;
}
