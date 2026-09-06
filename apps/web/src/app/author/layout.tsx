import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { readViewerSession } from '../../components/catalog/viewer-role.server';
import { normalizeRole } from '../../components/shell/nav';
import { TrpcQueryProvider } from '../../lib/trpc-react';

/**
 * Cổng vai trò của toàn nhánh `/author` (hợp đồng C6).
 *
 * Ba lớp, và chúng KHÔNG thay thế nhau:
 *
 * 1. `proxy.ts` (`PROTECTED_PATHS`) chỉ kiểm SỰ TỒN TẠI của cookie — nó chặn
 *    khách vãng lai, không chặn một người học đã đăng nhập gõ thẳng `/author`.
 * 2. Layout này đụng DB thật và đọc vai trò. Đây là lớp chặn người học.
 * 3. `authorProcedure` + `assertContentOwner` ở tRPC là lớp cuối. Layout chỉ
 *    quyết định NHÌN THẤY được gì; mọi lượt ghi vẫn phải tự bảo vệ, vì một
 *    trang bị ẩn không hề chặn được một lời gọi API viết tay.
 *
 * `redirect('/me')` chứ không 403: người học không làm gì sai khi bấm nhầm một
 * liên kết cũ, và một trang lỗi ở đây chỉ nói với họ rằng có thứ họ không được
 * vào — thông tin vô ích với họ và hữu ích với người dò.
 *
 * ⛔ KHÔNG dựng `<main>`: `components/shell/app-shell.tsx` sở hữu landmark đó
 * (hợp đồng C6bis). Hai `<main>` lồng nhau làm axe của 13.H đỏ `landmark-unique`.
 */
export default async function AuthorLayout({ children }: { children: ReactNode }) {
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
