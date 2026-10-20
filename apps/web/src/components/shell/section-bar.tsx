'use client';

import Link from 'next/link';
import { Icon, cn } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import { activeNavItem, isActiveNav, type NavSectionDef } from './nav';

/**
 * Thanh mục con, ngay dưới thanh trên cùng, nền nhạt màu của mục. Liên kết đầu là
 * trang tổng quan của mục, sau đó là từng trang con. Trang đang mở có vạch dưới;
 * trên điện thoại thanh cuộn ngang và tự giữ trang đang mở trong tầm nhìn.
 */
export function SectionBar({ section, pathname, search }: { readonly section: NavSectionDef; readonly pathname: string; readonly search: string }) {
  const child = activeNavItem(pathname, section.items, search);
  const onHub = child === null && isActiveNav(pathname, section.hub);
  const links = [
    { href: section.hub, label: t('shell.section.overview'), icon: section.icon, active: onHub },
    ...section.items.map((entry) => ({ href: entry.href, label: entry.label, icon: entry.icon, active: child?.href === entry.href })),
  ];
  return (
    <div className="border-b border-rule bg-acc-wash">
      <nav
        aria-label={t('shell.subnav.aria', { section: section.label })}
        className="mx-auto flex h-11 max-w-[1440px] items-stretch overflow-x-auto px-4 [scrollbar-width:none] lg:px-6"
      >
        <ul className="flex items-stretch gap-1">
          {links.map((entry) => (
            <li key={entry.href} className="flex">
              <Link
                href={entry.href}
                aria-current={entry.active ? 'page' : undefined}
                ref={(node) => {
                  if (entry.active && node !== null) node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                }}
                className={cn(
                  'group relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm transition-colors duration-150',
                  entry.active ? 'font-medium text-ink' : 'text-ink-2 hover:text-ink',
                )}
              >
                <Icon name={entry.icon} size={16} tint="acc" className={entry.active ? 'text-acc-ink' : 'text-ink-3 group-hover:text-acc-ink'} />
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
