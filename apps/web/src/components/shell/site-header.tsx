'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, ChevronDown, Search } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { Button, Kbd, cn } from '@devops-platform/ui';
import { BrandMark } from './brand-mark';
import { CapacityIndicator } from './capacity-indicator';
import { MobileMenu } from './mobile-menu';
import { activeNavItem, activeSection, sectionsFor, type NavSectionDef, type Viewer } from './nav';
import { NAV_ICONS } from './nav-icons';
import { SECTION_TONE } from './section-tone';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

/** Độ trễ ý định: rê ngang qua header không được bật menu. */
const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 180;

/**
 * Header trên cùng (design-brief §3): nền chrome tối ở CẢ HAI theme, section là
 * mục cha, rê/bấm/bàn phím mở mega menu chứa các trang con.
 *
 * Section đang mở = khối tô màu chữ ký của nó, cao hết header, có mũi nhọn chỉ
 * xuống trang. Không dùng viền trái hay gạch dưới làm dấu hiệu.
 */
export function SiteHeader({
  viewer,
  onOpenCommand,
}: {
  readonly viewer: Viewer | null;
  readonly onOpenCommand: () => void;
}) {
  const pathname = usePathname();
  const sections = sectionsFor(viewer);
  const current = activeSection(pathname);
  const [open, setOpen] = useState<NavSectionDef['id'] | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const scheduleOpen = (id: NavSectionDef['id']) => {
    clearTimers();
    openTimer.current = window.setTimeout(() => setOpen(id), open === null ? OPEN_DELAY_MS : 0);
  };
  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(null), CLOSE_DELAY_MS);
  };

  // Đổi trang thì menu đóng.
  useEffect(() => {
    setOpen(null);
  }, [pathname]);

  useEffect(() => {
    if (open === null) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    const onPointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  useEffect(() => clearTimers, [clearTimers]);

  const openDef = sections.find((section) => section.id === open) ?? null;

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 bg-chrome text-chrome-foreground"
      onPointerLeave={scheduleClose}
      onPointerEnter={() => {
        if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      }}
    >
      <div className="mx-auto flex h-16 max-w-[1440px] items-stretch px-3 md:px-6">
        <BrandMark />
        <nav aria-label={t('shell.nav.aria')} className="hidden h-full lg:flex">
          <ul className="flex h-full items-stretch">
            {sections.map((section) => (
              <SectionItem
                key={section.id}
                section={section}
                isCurrent={current === section.id}
                isOpen={open === section.id}
                onHover={() => scheduleOpen(section.id)}
                onToggle={() => {
                  clearTimers();
                  setOpen((value) => (value === section.id ? null : section.id));
                }}
              />
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1.5 md:gap-2">
          <button
            type="button"
            onClick={onOpenCommand}
            className="flex h-10 items-center gap-2 border border-chrome-border px-3 text-sm text-chrome-muted transition-colors hover:border-chrome-foreground hover:text-chrome-foreground"
          >
            <Search className="size-4" aria-hidden="true" />
            <span className="hidden whitespace-nowrap 2xl:inline">{t('shell.command.hint')}</span>
            <span className="sr-only 2xl:hidden">{t('shell.command.open')}</span>
            <Kbd className="ml-2 hidden border-chrome-border bg-transparent whitespace-nowrap text-chrome-muted 2xl:inline-flex">
              Ctrl K
            </Kbd>
          </button>
          {viewer && (
            <span className="hidden whitespace-nowrap xl:inline-flex">
              <CapacityIndicator />
            </span>
          )}
          <ThemeToggle />
          {viewer ? (
            <UserMenu viewer={viewer} />
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Button asChild variant="ghost" size="sm" className="text-chrome-foreground hover:bg-chrome-foreground/10">
                <Link href="/login">{t('shell.header.sign-in')}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">{t('shell.header.register')}</Link>
              </Button>
            </div>
          )}
          <MobileMenu viewer={viewer} />
        </div>
      </div>
      {openDef && <MegaPanel section={openDef} pathname={pathname} />}
    </header>
  );
}

function megaPanelId(id: string): string {
  return `mega-${id}`;
}

function SectionItem({
  section,
  isCurrent,
  isOpen,
  onHover,
  onToggle,
}: {
  readonly section: NavSectionDef;
  readonly isCurrent: boolean;
  readonly isOpen: boolean;
  readonly onHover: () => void;
  readonly onToggle: () => void;
}) {
  const tone = SECTION_TONE[section.tone];
  const first = section.items[0];
  const panelId = megaPanelId(section.id);
  if (first === undefined) return null;
  const hasMany = section.items.length > 1;
  return (
    <li className="relative flex h-full items-stretch" onPointerEnter={hasMany ? onHover : undefined}>
      <Link
        href={first.href}
        aria-current={isCurrent ? 'page' : undefined}
        className={cn(
          'relative flex items-center gap-2 pl-3 text-[0.95rem] font-semibold whitespace-nowrap transition-colors xl:pl-4',
          hasMany ? 'pr-1' : 'pr-3 xl:pr-4',
          isCurrent ? tone.headerFill : 'text-chrome-foreground/85 hover:text-chrome-foreground',
          !isCurrent && isOpen && 'bg-chrome-foreground/10 text-chrome-foreground',
        )}
      >
        {section.label}
        {isCurrent && (
          <span
            aria-hidden="true"
            className={cn('absolute -bottom-[7px] left-1/2 z-10 size-3.5 -translate-x-1/2 rotate-45', tone.headerBar)}
          />
        )}
      </Link>
      {hasMany && (
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-label={t('shell.menu.section-open', { section: section.label })}
          onClick={onToggle}
          className={cn(
            'flex w-7 items-center justify-center transition-colors',
            isCurrent ? tone.headerFill : 'text-chrome-foreground/70 hover:text-chrome-foreground',
          )}
        >
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 transition-transform duration-200', isOpen && 'rotate-180')}
          />
        </button>
      )}
    </li>
  );
}

function MegaPanel({ section, pathname }: { readonly section: NavSectionDef; readonly pathname: string }) {
  const tone = SECTION_TONE[section.tone];
  const active = activeNavItem(pathname, section.items);
  return (
    <div id={megaPanelId(section.id)} className="absolute inset-x-0 top-16 z-30 border-b border-border bg-background text-foreground shadow-float animate-reveal-down">
      <div className={cn('h-1 w-full', tone.bar)} />
      <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-8 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:px-8">
        <div className="flex flex-col justify-between gap-6">
          <div>
            <p className="type-label text-muted-foreground">{t('shell.menu.count', { count: section.items.length })}</p>
            <p className="mt-2 type-display">{section.label}</p>
            <p className="mt-3 max-w-sm text-muted-foreground">{section.lead}</p>
          </div>
        </div>
        <ul className="grid border-t border-l border-border sm:grid-cols-2">
          {section.items.map((entry, index) => {
            const Icon = NAV_ICONS[entry.icon];
            const isActive = active?.href === entry.href;
            return (
              <li key={entry.href} className="border-r border-b border-border bg-background">
                <Link
                  href={entry.href}
                  aria-current={isActive ? 'page' : undefined}
                  style={{ '--i': index, '--row-tint': tone.tint } as CSSProperties}
                  className="interactive-row stagger flex h-full animate-rise items-start gap-4 p-5"
                >
                  <span className={cn('grid size-11 shrink-0 place-items-center', tone.fill)}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 type-title">
                      {entry.label}
                      {isActive && <span className="size-2 bg-primary" aria-hidden="true" />}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">{entry.description}</span>
                  </span>
                  <ArrowUpRight data-row-arrow className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
