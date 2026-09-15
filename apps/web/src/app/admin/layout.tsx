import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { readViewerSession } from '../../components/catalog/viewer-role.server';
import { resolveAdminAccess } from '../../components/admin/admin-guard';
import { AdminNav } from '../../components/admin/admin-nav';
import { TrpcQueryProvider } from '../../lib/trpc-react';

/**
 * Cổng vai trò của toàn nhánh `/admin` (13.G, hợp đồng **C6**).
 *
 * ## Đây là cổng THẬT — ba lớp còn lại không phải
 *
 * 1. `userMenuItems()` (`components/shell/nav.ts`) chỉ ẨN liên kết "Quản trị"
 *    với người không phải admin. Gõ thẳng `/admin` vào thanh địa chỉ vẫn tới.
 *    Chú thích của chính hàm đó viết: *"Đây là trang trí, KHÔNG phải phân
 *    quyền."*
 * 2. `proxy.ts` có `/admin` trong `PROTECTED_PATHS`, nhưng nó chỉ kiểm cookie
 *    CÓ tồn tại hay không — nó cố ý không đụng DB, nên nó không biết vai trò và
 *    cũng không biết phiên đã bị thu hồi chưa.
 * 3. `adminProcedure` gác **dữ liệu**, không gác **trang**: thiếu layout này,
 *    một người dùng thường vẫn mở được `/admin/users`, thấy khung bảng, và chỉ
 *    nhận 403 khi query chạy — tức ta xác nhận với họ rằng trang tồn tại và họ
 *    thiếu quyền gì.
 *
 * Gác ở `layout.tsx` chứ không ở từng `page.tsx`: layout bọc MỌI đường dưới
 * `/admin`, kể cả route lane khác thêm sau này mà quên gác. Một cổng phải phủ
 * theo mặc định, không theo trí nhớ của người thêm file.
 *
 * ⚠ Phiên đọc qua `readViewerSession` (memo hoá bằng `cache()` của React) chứ
 * KHÔNG gọi thẳng `getAuth().api.getSession`: `page.tsx` của `/admin/users` và
 * `/admin/sessions` cũng cần id của admin đang đăng nhập (để chặn tự hạ quyền
 * và để nói rõ ai là người bấm), và chỉ khi cả hai đi qua đúng hàm đó thì hai
 * lời gọi mới gộp về MỘT lượt đụng DB.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = resolveAdminAccess(await readViewerSession());

  if (!access.allow) {
    redirect(access.redirectTo);
  }

  return (
    <TrpcQueryProvider>
      <div className="practice-catalog">
        <AdminNav />
        {children}
      </div>
    </TrpcQueryProvider>
  );
}
