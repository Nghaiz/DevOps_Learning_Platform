import { permanentRedirect } from 'next/navigation';

/**
 * `/dashboard` → `/me`, **308 Permanent Redirect** (quyết định **D12**,
 * `plans/devops-learning-platform/phase-13-exec.md` §1: "`/dashboard` và
 * `/session` gộp vào `/me` (redirect 308)").
 *
 * ## Vì sao redirect chứ không xoá thư mục
 *
 * `/dashboard` là đường mà mọi luồng đăng nhập từ P0 tới nay đẩy người dùng tới
 * — `login-form.tsx` (`router.push`, `callbackURL` của OAuth), `proxy.ts`
 * (`AUTH_ONLY_PATHS`), và bất kỳ tab nào ai đó đang mở hoặc đã bookmark. Xoá
 * thư mục cho ra 404 trên tất cả những đường đó. Redirect thì không, và **308**
 * (không phải 307/302) là mã nói đúng sự thật: đường này chuyển vĩnh viễn, mời
 * trình duyệt và mọi thứ đọc HTTP cập nhật liên kết.
 *
 * ## Cái đã bị xoá cùng lúc, và vì sao
 *
 * `sign-out-button.tsx` cạnh file này bị xoá — chính thay đổi này làm nó không
 * còn ai render (nó chỉ được `page.tsx` cũ dùng). Lý lẽ quan trọng của nó
 * (**phải** gọi `/api/auth/logout` chứ không phải `authClient.signOut()`, vì đó
 * là nơi DUY NHẤT thu hồi refresh token — luật 7) đã được chép nguyên vào
 * `components/shell/user-menu.tsx`, chỗ nút Đăng xuất nay sống.
 *
 * Trang cũ (`getSession` + thẻ "Lab sandbox chưa sẵn sàng ở P0") không mất mát
 * gì: `/me` của 13.E là bản đầy đủ của đúng màn hình đó.
 */
export default function DashboardRedirect(): never {
  permanentRedirect('/me');
}
