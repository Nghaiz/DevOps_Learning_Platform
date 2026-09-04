import type { ReactNode } from 'react';
import { TrpcQueryProvider } from '../../lib/trpc-react';

/** Layout trang "của tôi" (P10 10.E). Auth gác ở `page.tsx` — xem `paths/layout.tsx`. */
export default function MeLayout({ children }: { children: ReactNode }) {
  return <TrpcQueryProvider>{children}</TrpcQueryProvider>;
}
