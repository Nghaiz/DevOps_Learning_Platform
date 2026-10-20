import type { ReactNode } from 'react';
import { TrpcQueryProvider } from '../../lib/trpc-react';

/** Trang tổng quan mục Luyện đề. Auth gác ở `page.tsx`, cùng khuôn `/me`. */
export default function JudgeLayout({ children }: { children: ReactNode }) {
  return <TrpcQueryProvider>{children}</TrpcQueryProvider>;
}
