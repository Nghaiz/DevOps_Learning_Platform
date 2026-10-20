'use client';

import Link from 'next/link';
import { Button, Icon, Kbd, Wordmark, cn } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import { sectionsFor, type SectionId, type Viewer } from './nav';
import { CapacityIndicator } from './capacity-indicator';
import { MobileMenu } from './mobile-menu';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

/**
 * Thanh trên cùng. Mỗi mục cha mang biểu tượng tô màu của chính mục đó (đặt
 * `data-section` trên từng liên kết), nên thanh có màu mà không cần khối màu nào.
 * Mục đang mở có vạch dưới màu mục; bấm vào mục là vào trang tổng quan của mục.
 */
export function SiteHeader({
  viewer,
  activeId,
  onOpenCommand,
}: {
  readonly viewer: Viewer | null;
  readonly activeId: SectionId | null;
  readonly onOpenCommand: () => void;
}) {
  const sections = sectionsFor(viewer);
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-canvas">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 lg:gap-6 lg:px-6">
        <Link
          href={viewer === null ? '/' : '/me'}
          aria-label={t('shell.brand.home')}
          className="group/brand -ml-1 flex shrink-0 items-center rounded-md px-1 py-1"
        >
          <Wordmark name={t('shell.brand.name')} />
        </Link>

        <nav aria-label={t('shell.nav.aria')} className="hidden h-full items-stretch lg:flex">
          <ul className="flex h-full items-stretch gap-0.5">
            {sections.map((section) => {
              const active = section.id === activeId;
              return (
                <li key={section.id} className="flex">
                  <Link
                    href={section.hub}
                    data-section={section.id}
                    data-active={active || undefined}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'group relative flex items-center gap-2 px-3 text-sm font-medium transition-colors duration-150',
                      active ? 'text-ink' : 'text-ink-2 hover:text-ink',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'size-2 shrink-0 transition-colors duration-150',
                        active ? 'bg-acc-solid' : 'bg-acc-mid group-hover:bg-acc-solid',
                      )}
                    />
                    {section.label}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute inset-x-3 -bottom-px h-0.5 origin-center rounded-full bg-acc-solid transition-transform duration-200 ease-out',
                        active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-50 group-hover:bg-acc-mid',
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onOpenCommand}
            aria-keyshortcuts="Control+K"
            // Dưới `sm` nút chỉ còn biểu tượng: bỏ khung để cùng kiểu với nút theme và nút menu
            // đứng cạnh (hai nút đó là nút biểu tượng không viền).
            className="flex h-9 items-center gap-2 rounded-sm border border-rule-2 bg-paper px-2.5 text-sm text-ink-3 transition-colors duration-150 hover:border-control hover:text-ink-2 max-sm:w-9 max-sm:justify-center max-sm:border-transparent max-sm:bg-transparent max-sm:px-0 max-sm:hover:bg-well sm:w-52 sm:px-3"
          >
            <Icon name="search" size={16} />
            <span className="sr-only sm:not-sr-only">{t('shell.command.open')}</span>
            <span className="ml-auto hidden items-center gap-0.5 sm:flex">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          {viewer === null ? null : (
            <div className="hidden xl:block">
              <CapacityIndicator />
            </div>
          )}
          <ThemeToggle />
          {viewer === null ? (
            <div className="hidden items-center gap-1 sm:flex">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">{t('shell.header.sign-in')}</Link>
              </Button>
              <Button asChild variant="ink" size="sm">
                <Link href="/register">{t('shell.header.register')}</Link>
              </Button>
            </div>
          ) : (
            <UserMenu viewer={viewer} />
          )}
          <MobileMenu viewer={viewer} activeId={activeId} />
        </div>
      </div>
    </header>
  );
}
