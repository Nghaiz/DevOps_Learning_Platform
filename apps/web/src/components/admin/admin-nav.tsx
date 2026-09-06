'use client';

import type { ReactElement } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@devops-platform/ui';

export interface AdminNavItem {
  readonly href: string;
  readonly label: string;
}

/**
 * Năm màn hình quản trị (D12 — thêm màn hình phải hỏi chủ dự án).
 *
 * Dữ liệu thuần, export ra để `admin-nav.test.ts` khẳng định đúng năm đường
 * này và không đường nào ngoài `/admin`: một mục nav trỏ ra ngoài nhánh sẽ
 * không được `layout.tsx` của `/admin` gác, tức lọt cổng vai trò.
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: '/admin', label: 'Tổng quan' },
  { href: '/admin/users', label: 'Người dùng' },
  { href: '/admin/sessions', label: 'Phiên đang chạy' },
  { href: '/admin/content', label: 'Nội dung' },
  { href: '/admin/audit', label: 'Nhật ký' },
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

export function AdminNav(): ReactElement {
  const pathname = usePathname();
  return (
    <nav aria-label="Điều hướng quản trị" className="flex flex-wrap gap-1 border-b border-border pb-2">
      {ADMIN_NAV.map((item) => {
        const active = isActiveAdminNav(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
