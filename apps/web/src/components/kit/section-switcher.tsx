'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t } from '@devops-platform/copy';
import { cn } from '@devops-platform/ui';
import { activeNavItem, sectionById, type SectionId } from '../shell/nav';
import { NAV_ICONS } from '../shell/nav-icons';

/**
 * Thanh chuyển giữa các trang con của MỘT section (design-brief §3). Nằm ở mép
 * dưới `PosterHeader`. Trang đang mở = khối đảo màu (nền trang, chữ mực) nhô lên
 * như một thẻ nối liền với phần thân trang. Không có tầng thứ ba.
 */
export function SectionSwitcher({ section }: { readonly section: SectionId }) {
  const pathname = usePathname();
  const def = sectionById(section);
  const active = activeNavItem(pathname, def.items);
  return (
    <nav aria-label={t('shell.switcher.aria', { section: def.label })} className="-mx-5 overflow-x-auto md:mx-0">
      <ul className="flex min-w-max gap-1 px-5 md:px-0">
        {def.items.map((entry) => {
          const Icon = NAV_ICONS[entry.icon];
          const isActive = active?.href === entry.href;
          return (
            <li key={entry.href}>
              <Link
                href={entry.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex h-12 items-center gap-2 px-4 text-[0.95rem] font-semibold transition-colors',
                  isActive
                    ? 'bg-background text-foreground'
                    : 'bg-chrome/15 hover:bg-chrome/30',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {entry.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
