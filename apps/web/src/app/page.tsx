import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { Landing } from '../components/landing/landing';
import { readLandingCatalog } from '../components/landing/data/catalog.server';

export const metadata: Metadata = {
  title: t('home.meta.title'),
  description: t('home.meta.description'),
};

/**
 * Landing 3D. Vỏ app (`components/shell/app-shell.tsx`) giữ landmark `main` và để trống mọi
 * chrome khi `pathname === '/'`; landing tự vẽ thanh trên và chân trang.
 *
 * Số liệu catalog KHÔNG được await ở đây: lời hứa đi thẳng xuống client và các khu cần số tự
 * `use()` nó sau ranh giới Suspense. Tiêu đề hero (ứng viên LCP) vì vậy không phải chờ DB.
 */
export default function HomePage() {
  return <Landing catalog={readLandingCatalog()} />;
}
