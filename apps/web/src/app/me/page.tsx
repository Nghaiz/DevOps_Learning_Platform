import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { redirect } from 'next/navigation';
import { readRequestSession } from '../../server/auth/config';
import { MeClient } from './me-client';

export const metadata: Metadata = {
  title: t('me.page.me-document-title'),
};

/**
 * Server Component — kiểm auth THẬT (đụng DB), cùng khuôn `/labs`.
 *
 * `readRequestSession()` chứ không `getAuth().api.getSession(...)`: hàm đó bọc
 * `cache()` của React nên vỏ ứng dụng ở root layout và trang này dùng CHUNG một
 * lượt đọc trong cùng một render. Một call-site còn sót là hai khoá khác nhau ⇒
 * vẫn hai lượt đụng DB, âm thầm, vì kết quả vẫn đúng.
 */
export default async function MePage() {
  const session = await readRequestSession();

  if (session === null) {
    redirect('/login');
  }

  return <MeClient />;
}
