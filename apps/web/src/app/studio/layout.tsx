import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { readViewerSession } from '../../components/catalog/viewer-role.server';
import { normalizeRole } from '../../components/shell/nav';
import { TrpcQueryProvider } from '../../lib/trpc-react';

/**
 * Cổng vai trò của `/studio`, cùng ba lớp với `/author/layout.tsx`: proxy chặn khách,
 * layout này chặn người học, `authorProcedure` chặn lời gọi API viết tay.
 *
 * ⛔ Không `<main>`: vỏ ứng dụng sở hữu landmark đó.
 */
export default async function StudioLayout({ children }: { children: ReactNode }) {
  const session = await readViewerSession();
  if (session === null) {
    redirect('/login');
  }
  const role = normalizeRole(session.user.role);
  if (role !== 'author' && role !== 'admin') {
    redirect('/me');
  }
  return <TrpcQueryProvider>{children}</TrpcQueryProvider>;
}
