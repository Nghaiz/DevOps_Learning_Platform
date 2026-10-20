import type { ReactNode } from 'react';
import { TrpcQueryProvider } from '../../lib/trpc-react';

/** Trang tổng quan mục Thực hành. Auth gác ở `page.tsx`, cùng khuôn `/me`. */
export default function PracticeLayout({ children }: { children: ReactNode }) {
  return <TrpcQueryProvider>{children}</TrpcQueryProvider>;
}
