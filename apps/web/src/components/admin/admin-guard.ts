import { normalizeRole, type ViewerRole } from '../shell/nav';

/**
 * Quyết định vào được `/admin` hay không — hàm THUẦN, để `layout.tsx` chỉ còn
 * một dòng `redirect(...)`.
 *
 * Tách ra vì `apps/web` chạy vitest ở `environment: 'node'` theo MẶC ĐỊNH (không
 * jsdom) — ⚠ từ `727af45` mặc định đó bật được theo TỪNG FILE bằng docblock
 * `// @vitest-environment jsdom`, nên đây là lựa chọn thiết kế chứ không còn là
 * ràng buộc. Một
 * cổng phân quyền phải kiểm được bằng test, và cách duy nhất kiểm nó mà không
 * dựng cả Next là để nhánh quyết định nằm ngoài component. `role-gate.test.ts`
 * gọi CẢ hàm này LẪN chính `AdminLayout` (mock `next/navigation`) — hàm thuần
 * một mình chỉ chứng minh được logic đúng, không chứng minh được layout có
 * THẬT SỰ gọi nó.
 */
export type AdminAccess =
  | { readonly allow: true }
  | { readonly allow: false; readonly redirectTo: '/login' | '/me' };

/**
 * Hai đích chuyển hướng khác nhau, cố ý:
 *
 * · **Chưa đăng nhập → `/login`.** Đẩy về `/me` sẽ chỉ nảy thêm một lần nữa
 *   (`/me` cũng là route được gác) và người dùng thấy hai lần chuyển hướng cho
 *   một việc. Ca này CÓ xảy ra dù `proxy.ts` đã gác `/admin`: proxy chỉ kiểm
 *   cookie CÒN hay không, không kiểm session còn hiệu lực — cookie còn mà phiên
 *   đã bị thu hồi thì tới đúng đây.
 * · **Đăng nhập nhưng không phải admin → `/me`**, đúng hợp đồng C6. Không hiện
 *   thông báo "bạn không có quyền": trang quản trị không cần xác nhận với người
 *   lạ rằng nó tồn tại và họ thiếu quyền gì.
 *
 * Fail-closed: vai trò lạ (hoặc thiếu) đi qua `normalizeRole` thành `'user'` ⇒
 * bị đẩy ra. Một giá trị `role` không đọc được KHÔNG được coi là admin.
 */
export function resolveAdminAccess(session: { readonly user: { readonly role?: unknown } } | null): AdminAccess {
  if (session === null) {
    return { allow: false, redirectTo: '/login' };
  }
  const role: ViewerRole = normalizeRole(session.user.role);
  if (role !== 'admin') {
    return { allow: false, redirectTo: '/me' };
  }
  return { allow: true };
}
