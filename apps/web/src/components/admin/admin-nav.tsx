'use client';

import type { ReactElement } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t, type TextKey } from '@devops-platform/copy';
import { cn } from '@devops-platform/ui';

export interface AdminNavItem {
  readonly href: string;
  /**
   * Khoá trong bản đồ, KHÔNG phải câu.
   *
   * Giữ chữ ở đây thì `admin-nav.test.ts` so một chuỗi với chính nó và cổng T4
   * của lane đỏ ngay trên file này. Giữ khoá thì gõ sai tên là lỗi biên dịch,
   * vì `TextKey` là union các khoá chữ có thật.
   */
  readonly labelKey: TextKey;
}

/**
 * Năm màn hình quản trị (D12, thêm màn hình phải hỏi chủ dự án).
 *
 * Dữ liệu thuần, export ra để `admin-nav.test.ts` khẳng định đúng năm đường
 * này và không đường nào ngoài `/admin`: một mục nav trỏ ra ngoài nhánh sẽ
 * không được `layout.tsx` của `/admin` gác, tức lọt cổng vai trò.
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: '/admin', labelKey: 'admin.nav.overview' },
  { href: '/admin/users', labelKey: 'admin.nav.users' },
  { href: '/admin/sessions', labelKey: 'admin.nav.sessions' },
  { href: '/admin/content', labelKey: 'admin.nav.content' },
  { href: '/admin/audit', labelKey: 'admin.nav.audit' },
];

/**
 * Mục nào đang mở.
 *
 * `/admin` phải so BẰNG, không so tiền tố: `startsWith('/admin')` làm mục Tổng
 * quan sáng ở cả bốn trang con, nên thanh nav luôn có hai mục được chọn.
 */
export function isActiveAdminNav(pathname: string, href: string): boolean {
  if (href === '/admin') {
    return pathname === '/admin';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Thanh nav quản trị.
 *
 * ## Vì sao mục đang mở dùng `--accent` chứ không `--primary`
 *
 * Bảng token §1.4 giao `--accent` đúng vai "hover/focus của item tương tác
 * (menu, tab)", còn `--primary` là nền ĐẶC của nút hành động chính. Tô một tab
 * bằng `bg-primary` đặt nó ngang hạng với nút "Đổi vai trò" trong cùng màn
 * hình, và luật hai kênh ở §2 chỉ tách được primary khỏi destructive khi
 * primary còn là một tín hiệu hiếm.
 *
 * Vòng focus KHÔNG vẽ sát mặt nút (§1.7): `--ring` bằng `--primary`, nên một
 * vòng dán liền mép sẽ đọc như một viền màu thương hiệu thay vì một chỉ báo
 * bàn phím. `focus-visible:ring-offset-2` là phần bù đó.
 */
export function AdminNav(): ReactElement {
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('admin.nav.aria')}
      className="flex flex-wrap gap-1 border-b border-border pb-3"
    >
      {ADMIN_NAV.map((item) => {
        const active = isActiveAdminNav(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium outline-none',
              'transition-colors duration-(--motion-fast) ease-(--ease-out)',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
