/**
 * Điều hướng — hợp đồng **C6** (`plans/devops-learning-platform/phase-13-exec.md` §2).
 *
 * Dữ liệu THUẦN: không JSX, không import React, không import gì từ `server/**`.
 * Đó là điều kiện để CẢ HAI phía dùng chung một nguồn — `app/layout.tsx`
 * (Server Component, gọi `normalizeRole`) và `app-shell.tsx` (Client Component,
 * đọc bảng nav) — mà không kéo Better Auth/DB vào bundle trình duyệt.
 */

export type ViewerRole = 'user' | 'author' | 'admin';

/** Người dùng đang đăng nhập, đã rút gọn về đúng thứ vỏ ứng dụng cần. */
export interface Viewer {
  readonly name: string;
  readonly email: string;
  readonly role: ViewerRole;
}

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

/**
 * Điều hướng chính — **thứ tự và nhãn khớp C6 từng chữ**. Đổi ở đây là đổi hợp
 * đồng: `nav.test.ts` khẳng định lại đúng sáu cặp (href, label) này, nên một
 * lần "sửa nhãn cho gọn" sẽ đỏ ở test chứ không trôi vào production.
 */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: '/lessons', label: 'Bài học' },
  { href: '/labs', label: 'Lab' },
  { href: '/playgrounds', label: 'Playground' },
  { href: '/paths', label: 'Lộ trình' },
  { href: '/quiz', label: 'Quiz' },
  { href: '/me', label: 'Của tôi' },
];

interface RoleGatedItem extends NavItem {
  /** `'all'` = mọi vai trò đã đăng nhập. */
  readonly roles: 'all' | readonly ViewerRole[];
}

const USER_MENU_NAV: readonly RoleGatedItem[] = [
  { href: '/settings', label: 'Hồ sơ & cài đặt', roles: 'all' },
  { href: '/author', label: 'Soạn bài', roles: ['author', 'admin'] },
  { href: '/admin', label: 'Quản trị', roles: ['admin'] },
];

/**
 * Mục menu người dùng thấy được với vai trò `role`.
 *
 * ⚠ **Đây là trang trí, KHÔNG phải phân quyền.** Giấu một liên kết chỉ làm nó
 * không hiện ra; gõ thẳng `/admin` vào thanh địa chỉ vẫn tới nơi. Cổng thật là
 * `layout.tsx` phía server của chính route đó (`getSession` + role →
 * `redirect('/me')`) — hợp đồng C6 ghi rõ, và `proxy.ts` cố ý KHÔNG gác vai trò
 * (nó chỉ kiểm sự tồn tại của cookie, không đụng DB, xem chú thích ở đó).
 */
export function userMenuItems(role: ViewerRole): readonly NavItem[] {
  return USER_MENU_NAV.filter(
    (item) => item.roles === 'all' || item.roles.includes(role),
  ).map(({ href, label }) => ({ href, label }));
}

const KNOWN_ROLES: readonly ViewerRole[] = ['user', 'author', 'admin'];

/**
 * Vai trò lấy từ session server, fail-closed: giá trị lạ → `'user'`.
 *
 * ⚠ **Bản sao có chủ ý của `toRole` trong `apps/web/src/server/trpc/init.ts`** —
 * hàm đó không được export, và `server/**` thuộc lane BE1 nên lane này không sửa
 * được. Hai allowlist rời nhau là một chỗ để trôi: thêm vai trò thứ tư mà chỉ
 * sửa một bên thì menu và `adminProcedure` sẽ nói hai chuyện khác nhau. Đã ghi
 * vào report để lead cho export `toRole` rồi xoá bản này.
 */
export function normalizeRole(raw: unknown): ViewerRole {
  return KNOWN_ROLES.find((known) => known === raw) ?? 'user';
}

/**
 * Mục nav nào đang "ở trong" đường hiện tại.
 *
 * Cùng luật khớp với `matchesProtected` của `proxy.ts` và vì cùng một lý do:
 * `startsWith(href)` trần sẽ nuốt `/mentor` cho mục `/me`, còn so bằng chính
 * xác thì `/lessons/<id>` không làm sáng mục "Bài học" — người học vào trang chi
 * tiết sẽ thấy thanh nav không mục nào được chọn.
 */
export function isActiveNav(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
