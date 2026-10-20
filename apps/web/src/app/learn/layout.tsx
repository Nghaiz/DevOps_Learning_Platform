import type { ReactNode } from 'react';
import { TrpcQueryProvider } from '../../lib/trpc-react';

/** Trang tổng quan mục Học. Auth gác ở `page.tsx`, cùng khuôn `/me`. */
export default function LearnLayout({ children }: { children: ReactNode }) {
  return <TrpcQueryProvider>{children}</TrpcQueryProvider>;
}
