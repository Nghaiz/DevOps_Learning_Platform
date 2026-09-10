import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { redirect } from 'next/navigation';
import { readCanAuthor, readViewerSession } from '../../components/catalog/viewer-role.server';
import { LabsClient } from './labs-client';

export const metadata: Metadata = {
  title: t('catalog.meta-title.labs'),
};

/**
 * Server Component — kiểm auth THẬT (đụng DB), cùng khuôn `/playgrounds` và
 * `/paths`: `proxy.ts` chỉ kiểm SỰ TỒN TẠI của cookie, page này là nguồn sự
 * thật, chặn cả ca cookie còn nhưng session đã bị revoke ở DB.
 *
 * Hai lời gọi bên dưới đi qua cùng một `readViewerSession` memo hoá bằng
 * `cache()` ⇒ MỘT lượt đụng DB, không phải hai.
 */
export default async function LabsPage() {
  const session = await readViewerSession();

  if (session === null) {
    redirect('/login');
  }

  return <LabsClient canAuthor={await readCanAuthor()} />;
}
