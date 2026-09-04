import type { ReactNode } from 'react';
import { TrpcQueryProvider } from '../../lib/trpc-react';

/**
 * Layout của lộ trình (P10 10.A).
 *
 * KHÔNG gác auth ở đây — mỗi `page.tsx` tự gọi `auth.api.getSession`, cùng
 * khuôn `labs/layout.tsx`: gác thêm ở layout là một lượt `getSession` (đụng DB)
 * THỨ HAI cho mỗi lần mở trang.
 */
export default function PathsLayout({ children }: { children: ReactNode }) {
  return <TrpcQueryProvider>{children}</TrpcQueryProvider>;
}
