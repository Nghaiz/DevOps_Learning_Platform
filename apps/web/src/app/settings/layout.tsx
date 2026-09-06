import type { ReactNode } from 'react';
import { TrpcQueryProvider } from '../../lib/trpc-react';

/** Layout `/settings` (13.E). Auth gác ở `page.tsx` — cùng khuôn `me/layout.tsx`. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <TrpcQueryProvider>{children}</TrpcQueryProvider>;
}
