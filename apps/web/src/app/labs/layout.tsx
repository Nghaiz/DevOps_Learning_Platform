import type { ReactNode } from 'react';
import { TrpcQueryProvider } from '../../lib/trpc-react';

/**
 * Layout của trụ cột lab (P8 / 8.B–8.D).
 *
 * ⚠ KHÔNG gác auth ở đây — khác `lessons/layout.tsx`. `/labs/[id]` cần
 * `userId` thật (procedure `session.extend`/`session.get`/`session.reap`
 * dùng chung với `/session` đều nhận `userId` trong input — `labs.startAttempt`
 * không có `endSession`/`extendSession`/`sessionStatus` riêng như `lessons.*`,
 * xem `apps/web/src/lib/use-sandbox-session.ts`), và cách rẻ nhất để có giá trị
 * đó là để CHÍNH page.tsx tự gọi `auth.api.getSession` — layout gác thêm ở đây
 * sẽ là một lượt `getSession` (đụng DB) THỨ HAI cho mỗi lần mở `/labs/[id]`.
 * Cùng khuôn với `(session)/session/page.tsx` (không có layout gác auth).
 */
export default function LabsLayout({ children }: { children: ReactNode }) {
  return <TrpcQueryProvider>{children}</TrpcQueryProvider>;
}
