import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { GamesClient } from './games-client';

export const metadata: Metadata = {
  title: t('catalog.meta-title.games'),
  description: t('catalog.games.meta-description'),
};

/**
 * Chỉ mục `/games` — trụ cột ③ (P14).
 *
 * Server Component thuần: không `getSession`, không `redirect('/login')`, khác
 * `quiz/page.tsx` và bốn trang danh mục kia. Đó là hợp đồng §4.2 — game không
 * yêu cầu đăng nhập, nên gác ở đây sẽ là một rào không có lý do.
 *
 * KHÔNG render `main` của riêng nó: vỏ ứng dụng (`components/shell/app-shell.tsx`)
 * sở hữu landmark đó cho mọi trang, và `components/session/landmark-contract.test.ts`
 * gác việc này bằng một phép quét tĩnh trên toàn bộ `.tsx` của `apps/web/src`.
 */
export default function GamesIndexPage() {
  return <GamesClient />;
}
