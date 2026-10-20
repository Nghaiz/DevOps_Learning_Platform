'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Menu, X } from 'lucide-react';
import { t } from '@devops-platform/copy';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  cn,
} from '@devops-platform/ui';
import { activeNavItem, PRIMARY_NAV, sectionsFor, userMenuItems, type Viewer } from './nav';
import { NAV_ICONS } from './nav-icons';
import { SECTION_TONE } from './section-tone';

/**
 * Điều hướng dưới 1024px: một tấm phủ kín màn hình nền chrome, section viết to,
 * trang con xếp ngay dưới. Mỗi liên kết bọc `DialogClose` để bấm xong là đóng.
 */
export function MobileMenu({ viewer }: { readonly viewer: Viewer | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const active = activeNavItem(pathname, PRIMARY_NAV);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t('shell.menu.open')}
          className="grid size-10 place-items-center border border-chrome-border text-chrome-foreground transition-colors hover:bg-chrome-foreground/10 lg:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="inset-0 top-0 left-0 h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-y-auto border-0 bg-chrome p-0 text-chrome-foreground shadow-none [&>button:last-child]:hidden"
      >
        <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-chrome-border bg-chrome px-5">
          <DialogTitle className="type-label text-chrome-muted">{t('shell.menu.title')}</DialogTitle>
          <DialogClose
            aria-label={t('shell.menu.close')}
            className="grid size-10 place-items-center border border-chrome-border"
          >
            <X className="size-5" aria-hidden="true" />
          </DialogClose>
        </div>
        <nav aria-label={t('shell.nav.aria-collapsed')} className="px-5 pb-12">
          {sectionsFor(viewer).map((section, sectionIndex) => {
            const tone = SECTION_TONE[section.tone];
            return (
              <section
                key={section.id}
                className="stagger animate-rise border-b border-chrome-border py-6"
                style={{ '--i': sectionIndex } as CSSProperties}
              >
                <h2 className="flex items-center gap-3 type-display">
                  <span className={cn('inline-block size-4', tone.bar)} aria-hidden="true" />
                  {section.label}
                </h2>
                <ul className="mt-4 grid gap-1">
                  {section.items.map((entry) => {
                    const Icon = NAV_ICONS[entry.icon];
                    const isActive = active?.href === entry.href;
                    return (
                      <li key={entry.href}>
                        <DialogClose asChild>
                          <Link
                            href={entry.href}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                              'flex min-h-12 items-center gap-3 px-3 text-lg transition-colors',
                              isActive ? tone.fill : 'hover:bg-chrome-foreground/10',
                            )}
                          >
                            <Icon className="size-5 shrink-0" aria-hidden="true" />
                            <span className="flex-1">{entry.label}</span>
                            <ArrowRight className="size-4" aria-hidden="true" />
                          </Link>
                        </DialogClose>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {viewer ? (
            <ul className="grid gap-1 py-6">
              {userMenuItems(viewer.role).map((entry) => (
                <li key={entry.href}>
                  <DialogClose asChild>
                    <Link href={entry.href} className="flex min-h-12 items-center px-3 hover:bg-chrome-foreground/10">
                      {entry.label}
                    </Link>
                  </DialogClose>
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid grid-cols-2 gap-3 py-6">
              <DialogClose asChild>
                <Link href="/login" className="flex h-12 items-center justify-center border border-chrome-border font-semibold">
                  {t('shell.header.sign-in')}
                </Link>
              </DialogClose>
              <DialogClose asChild>
                <Link href="/register" className="flex h-12 items-center justify-center bg-primary font-semibold text-primary-foreground">
                  {t('shell.header.register')}
                </Link>
              </DialogClose>
            </div>
          )}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
