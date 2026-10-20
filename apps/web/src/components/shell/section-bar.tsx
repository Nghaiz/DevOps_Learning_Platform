'use client';

import Link from 'next/link';
import { cn } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import { activeNavItem, isActiveNav, type NavSectionDef } from './nav';

/**
 * Thanh mục con, ngay dưới thanh trên cùng, nền nhạt màu của mục. Liên kết đầu là
 * trang tổng quan của mục, sau đó là từng trang con. Trang đang mở có vạch dưới.
 * Chỉ chữ, không icon: tên trang đã đủ nghĩa. Trên điện thoại thanh cuộn ngang, hai mép
 * mờ dần để báo còn mục bị che, và trang đang mở được cuộn vào giữa.
 */
export function SectionBar({ section, pathname, search }: { readonly section: NavSectionDef; readonly pathname: string; readonly search: string }) {
  const child = activeNavItem(pathname, section.items, search);
  const onHub = child === null && isActiveNav(pathname, section.hub);
  const links = [
    { href: section.hub, label: t('shell.section.overview'), active: onHub },
    ...section.items.map((entry) => ({ href: entry.href, label: entry.label, active: child?.href === entry.href })),
  ];
  return (
    <div className="border-b border-rule bg-acc-wash">
      <nav
        aria-label={t('shell.subnav.aria', { section: section.label })}
        className="relative mx-auto flex h-11 max-w-[1440px] items-stretch overflow-x-auto px-4 [scrollbar-width:none] max-lg:[mask-image:linear-gradient(to_right,transparent,var(--ink)_16px,var(--ink)_calc(100%_-_16px),transparent)] lg:px-6"
      >
        <ul className="flex items-stretch gap-1">
          {links.map((entry) => (
            <li key={entry.href} className="flex">
              <Link
                href={entry.href}
                aria-current={entry.active ? 'page' : undefined}
                ref={(node) => {
                  if (entry.active && node !== null) node.scrollIntoView({ block: 'nearest', inline: 'center' });
                }}
                className={cn(
                  'group relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm transition-colors duration-150',
                  entry.active ? 'font-medium text-ink' : 'text-ink-2 hover:text-ink',
                )}
              >
                {entry.label}
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-acc-solid transition-transform duration-200 ease-out',
                    entry.active ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
