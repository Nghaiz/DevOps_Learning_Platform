'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, DialogPrimitive as RadixDialog, Icon, IconButton, cn } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import { isActiveNav, sectionsFor, userMenuItems, type SectionId, type Viewer } from './nav';

/**
 * Điều hướng dưới 1024px: một nút mở tấm phủ toàn màn, liệt kê mọi mục cùng trang con.
 * Tên nút, tên hộp thoại và tên vùng điều hướng được `e2e/responsive.spec.ts` dò theo.
 */
export function MobileMenu({ viewer, activeId }: { readonly viewer: Viewer | null; readonly activeId: SectionId | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const sections = sectionsFor(viewer);
  const close = (): void => setOpen(false);

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Trigger asChild>
        <IconButton icon="menu" label={t('shell.menu.open')} variant="ghost" className="lg:hidden" />
      </RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-canvas outline-none data-[state=open]:animate-fade lg:hidden"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-rule px-4">
            <RadixDialog.Title className="font-display text-lg font-semibold text-ink">{t('shell.menu.title')}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <IconButton icon="close" label={t('shell.menu.close')} variant="ghost" />
            </RadixDialog.Close>
          </div>
          <nav aria-label={t('shell.nav.aria-collapsed')} className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-2">
            {sections.map((section) => (
              <div key={section.id} data-section={section.id} className="border-b border-rule py-4">
                <Link
                  href={section.hub}
                  onClick={close}
                  aria-current={section.id === activeId ? 'true' : undefined}
                  className="flex items-center gap-2.5 py-1 font-display text-lg font-semibold text-ink"
                >
                  <Icon name={section.icon} size={22} tint="acc" className="text-acc-ink" />
                  {section.label}
                </Link>
                <p className="mb-2 mt-1 text-sm text-ink-3">{section.lead}</p>
                <ul className="flex flex-col">
                  {section.items.map((entry) => {
                    const active = isActiveNav(pathname, entry.href);
                    return (
                      <li key={entry.href}>
                        <Link
                          href={entry.href}
                          onClick={close}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            '-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 text-base transition-colors',
                            active ? 'bg-acc-wash font-medium text-acc-ink' : 'text-ink-2 hover:bg-well',
                          )}
                        >
                          <Icon name={entry.icon} size={18} className={active ? 'text-acc-ink' : 'text-ink-3'} />
                          {entry.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <div className="flex flex-col gap-1 py-4">
              {viewer === null ? (
                <div className="flex gap-2">
                  <Button asChild variant="secondary" className="flex-1">
                    <Link href="/login" onClick={close}>
                      {t('shell.header.sign-in')}
                    </Link>
                  </Button>
                  <Button asChild variant="ink" className="flex-1">
                    <Link href="/register" onClick={close}>
                      {t('shell.header.register')}
                    </Link>
                  </Button>
                </div>
              ) : (
                userMenuItems(viewer.role).map((entry) => (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    onClick={close}
                    className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 text-base text-ink-2 hover:bg-well"
                  >
                    <Icon name={entry.icon} size={18} className="text-ink-3" />
                    {entry.label}
                  </Link>
                ))
              )}
            </div>
          </nav>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
