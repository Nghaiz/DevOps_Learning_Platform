'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Button, DialogPrimitive as RadixDialog, IconButton, cn } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import { activeNavItem, sectionsFor, userMenuItems, type SectionId, type Viewer } from './nav';

/**
 * Điều hướng dưới 1024px: một nút mở tấm phủ toàn màn, liệt kê mọi mục cùng trang con.
 * Tên nút, tên hộp thoại và tên vùng điều hướng được `e2e/responsive.spec.ts` dò theo.
 */
export function MobileMenu({ viewer, activeId }: { readonly viewer: Viewer | null; readonly activeId: SectionId | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const sections = sectionsFor(viewer);
  const close = (): void => setOpen(false);

  // Tấm phủ chỉ hiện dưới 1024px. Màn rộng ra lúc nó đang mở (xoay máy tính bảng) thì CSS giấu
  // nó đi nhưng hộp thoại vẫn mở: trang trơ, cuộn bị khoá, focus kẹt trong một thứ vô hình.
  useEffect(() => {
    if (!open) return undefined;
    const wide = window.matchMedia('(min-width: 1024px)');
    const onChange = (event: MediaQueryListEvent): void => {
      if (event.matches) setOpen(false);
    };
    if (wide.matches) setOpen(false);
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, [open]);

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
          <nav aria-label={t('shell.nav.aria-collapsed')} className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-2">
            {sections.map((section) => (
              <div key={section.id} data-section={section.id} className="border-b border-rule py-4">
                <Link
                  href={section.hub}
                  onClick={close}
                  aria-current={section.id === activeId ? 'true' : undefined}
                  className="flex items-center gap-2.5 py-1 font-display text-lg font-semibold text-ink"
                >
                  <span aria-hidden className="size-2.5 shrink-0 bg-acc-solid" />
                  {section.label}
                </Link>
                <p className="mb-2 mt-1 text-sm text-ink-3">{section.lead}</p>
                <ul className="flex flex-col">
                  {section.items.map((entry) => {
                    // Một trang hiện tại duy nhất, như thanh mục con: chỉ trong mục đang mở, khớp
                    // dài nhất kèm query. So tiền tố từng đánh dấu cả /author lẫn /author/problems.
                    const active = section.id === activeId && activeNavItem(pathname, section.items, search)?.href === entry.href;
                    return (
                      <li key={entry.href}>
                        <Link
                          href={entry.href}
                          onClick={close}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-2.5 py-2.5 text-base transition-colors',
                            active ? 'font-medium text-ink' : 'text-ink-2 hover:text-ink',
                          )}
                        >
                          {/* Dấu trang hiện tại là ô vuông màu mục, như thanh mục con; không mảng nền bo góc. */}
                          <span aria-hidden className={cn('size-2 shrink-0', active ? 'bg-acc-solid' : 'bg-transparent')} />
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
