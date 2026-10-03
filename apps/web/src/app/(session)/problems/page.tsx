import { Suspense } from 'react';
import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { redirect } from 'next/navigation';
import { withReturnPath } from '../../login/return-path';
import { readViewerSession } from '../../../components/catalog/viewer-role.server';
import { ProblemsClient } from './problems-client';
import { ProblemsPoster, ProblemsSkeleton } from './problems-poster';

export const metadata: Metadata = {
  title: t('problem.oj.meta-title'),
  description: t('problem.oj.meta-description'),
};

/**
 * Server Component, kiểm auth THẬT (đụng DB), cùng khuôn `/labs` và `/paths`:
 * `proxy.ts` chỉ kiểm SỰ TỒN TẠI của cookie, còn trang này là nguồn sự thật nên
 * nó chặn được cả ca cookie còn nhưng phiên đã bị thu hồi ở DB.
 *
 * `<Suspense>` là bắt buộc: `ProblemsClient` đọc `useSearchParams`, và Next từ
 * chối dựng một cây có hook đó mà không có ranh giới suspense bao ngoài. Ranh
 * giới bọc ĐÚNG phần client; biển ga ở ngoài nên không chờ gì cả.
 */
export default async function ProblemsPage() {
  if ((await readViewerSession()) === null) {
    // Mang đường về theo: đăng nhập xong thì quay lại đúng trang này.
    redirect(withReturnPath('/login', '/problems'));
  }

  return (
    <>
      <ProblemsPoster />
      <Suspense fallback={<ProblemsSkeleton />}>
        <ProblemsClient />
      </Suspense>
    </>
  );
}
