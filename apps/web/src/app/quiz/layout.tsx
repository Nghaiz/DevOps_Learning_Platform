import type { ReactNode } from 'react';
import { TrpcQueryProvider } from '../../lib/trpc-react';

/** Layout của quiz (P10 10.C). Auth gác ở từng `page.tsx` — xem `paths/layout.tsx`. */
export default function QuizLayout({ children }: { children: ReactNode }) {
  return <TrpcQueryProvider>{children}</TrpcQueryProvider>;
}
