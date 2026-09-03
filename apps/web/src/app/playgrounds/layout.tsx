import type { ReactNode } from 'react';
import { TrpcQueryProvider } from '../../lib/trpc-react';

/**
 * Layout của trụ cột playground (P8 / 8.E). Cùng lý lẽ `labs/layout.tsx`:
 * KHÔNG gác auth ở đây — `[id]/page.tsx` tự gọi `auth.api.getSession` vì nó cần
 * `userId` thật cho router `session.*` dùng chung (gia hạn/kết thúc/hỏi trạng
 * thái), và gác thêm ở layout sẽ là một lượt `getSession` thứ hai không cần
 * thiết.
 */
export default function PlaygroundsLayout({ children }: { children: ReactNode }) {
  return <TrpcQueryProvider>{children}</TrpcQueryProvider>;
}
