import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { redirect } from 'next/navigation';
import { readCanAuthor, readViewerSession } from '../../components/catalog/viewer-role.server';
import { readCatalogCounts } from '../../components/catalog/catalog-counts.server';
import { LabsClient } from './labs-client';

export const metadata: Metadata = {
  title: t('catalog.meta-title.labs'),
};

/**
 * Server Component, kiểm auth THẬT (đụng DB): `proxy.ts` chỉ kiểm SỰ TỒN TẠI của
 * cookie, page này chặn cả ca cookie còn mà session đã bị thu hồi ở DB.
 *
 * `readViewerSession` và `readCanAuthor` đi qua cùng một hàm memo hoá bằng
 * `cache()` ⇒ MỘT lượt đụng DB. `readCatalogCounts` cấp tổng số lab đã xuất bản
 * cho nhãn đầu trang (`null` khi không đọc được kho).
 */
export default async function LabsPage() {
  const session = await readViewerSession();

  if (session === null) {
    redirect('/login');
  }

  const [canAuthor, counts] = await Promise.all([readCanAuthor(), readCatalogCounts()]);
  return <LabsClient canAuthor={canAuthor} total={counts.labs} />;
}
