import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { readRequestSession } from '../../server/auth/config';
import { SettingsClient } from './settings-client';

export const metadata: Metadata = {
  title: 'Hồ sơ & cài đặt — DevOps Learning Platform',
};

/**
 * Server Component — kiểm auth THẬT (đụng DB), cùng khuôn `/me`.
 *
 * `readRequestSession()` chứ không `getAuth().api.getSession(...)`: hàm đó bọc
 * `cache()` của React nên vỏ ứng dụng ở root layout và trang này dùng CHUNG một
 * lượt đọc trong cùng một render. Một call-site còn sót là hai khoá khác nhau ⇒
 * vẫn hai lượt đụng DB, âm thầm, vì kết quả vẫn đúng.
 */
export default async function SettingsPage() {
  const session = await readRequestSession();

  if (session === null) {
    redirect('/login');
  }

  return <SettingsClient />;
}
