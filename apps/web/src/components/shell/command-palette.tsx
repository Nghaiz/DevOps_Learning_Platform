'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, Search } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { Dialog, DialogContent, DialogTitle, cn } from '@devops-platform/ui';
import { sectionsFor, userMenuItems, type NavIconName, type Viewer } from './nav';
import { NAV_ICONS, USER_MENU_ICONS } from './nav-icons';

interface Entry {
  readonly href: string;
  readonly label: string;
  readonly detail: string;
  readonly group: string;
  readonly icon: NavIconName | null;
}

/** Bỏ dấu tiếng Việt để "bai hoc" khớp "Bài học". */
export function foldVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function buildEntries(viewer: Viewer | null): readonly Entry[] {
  const pages: Entry[] = sectionsFor(viewer).flatMap((section) =>
    section.items.map((entry) => ({
      href: entry.href,
      label: entry.label,
      detail: `${section.label} · ${entry.description}`,
      group: t('shell.command.group.pages'),
      icon: entry.icon,
    })),
  );
  const account: Entry[] = viewer
    ? userMenuItems(viewer.role).map((entry) => ({
        href: entry.href,
        label: entry.label,
        detail: '',
        group: t('shell.command.group.account'),
        icon: null,
      }))
    : [];
  return [...pages, ...account];
}

export function filterEntries(entries: readonly Entry[], query: string): readonly Entry[] {
  const q = foldVietnamese(query.trim());
  if (q === '') return entries;
  return entries.filter((entry) => foldVietnamese(`${entry.label} ${entry.detail}`).includes(q));
}

/**
 * Bảng lệnh Ctrl K / Cmd K: đi tới bất kỳ trang nào bằng bàn phím. Lọc tại chỗ,
 * không gọi mạng.
 */
export function CommandPalette({
  viewer,
  open,
  onOpenChange,
}: {
  readonly viewer: Viewer | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const entries = useMemo(() => buildEntries(viewer), [viewer]);
  const results = useMemo(() => filterEntries(entries, query), [entries, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setCursor(0);
    }
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  const go = (entry: Entry | undefined) => {
    if (entry === undefined) return;
    onOpenChange(false);
    router.push(entry.href);
  };

  let lastGroup = '';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="top-[12vh] max-w-2xl translate-y-0 gap-0 p-0 [&>button:last-child]:hidden"
      >
        <DialogTitle className="sr-only">{t('shell.command.title')}</DialogTitle>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-5 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setCursor((value) => Math.min(value + 1, results.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setCursor((value) => Math.max(value - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                go(results[cursor]);
              }
            }}
            aria-label={t('shell.command.label')}
            aria-controls="command-results"
            aria-activedescendant={results[cursor] ? `command-${cursor}` : undefined}
            role="combobox"
            aria-expanded="true"
            placeholder={t('shell.command.hint')}
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul id="command-results" role="listbox" ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 && (
            <li className="px-5 py-8 text-center text-muted-foreground">{t('shell.command.empty', { query })}</li>
          )}
          {results.map((entry, index) => {
            const Icon = entry.icon ? NAV_ICONS[entry.icon] : USER_MENU_ICONS[entry.href];
            const header = entry.group !== lastGroup ? entry.group : null;
            lastGroup = entry.group;
            return (
              <li key={entry.href} role="presentation">
                {header && <p className="px-5 pt-3 pb-1 type-label text-muted-foreground">{header}</p>}
                <div
                  id={`command-${index}`}
                  role="option"
                  aria-selected={index === cursor}
                  onPointerMove={() => setCursor(index)}
                  onClick={() => go(entry)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 px-5 py-2.5',
                    index === cursor && 'bg-ink text-ink-foreground',
                  )}
                >
                  {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
                  <span className="font-medium">{entry.label}</span>
                  {entry.detail && (
                    <span className={cn('truncate text-sm', index === cursor ? 'opacity-75' : 'text-muted-foreground')}>
                      {entry.detail}
                    </span>
                  )}
                  {index === cursor && <CornerDownLeft className="ml-auto size-4 shrink-0" aria-hidden="true" />}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-border px-5 py-2.5 type-label text-muted-foreground">{t('shell.command.footer')}</p>
      </DialogContent>
    </Dialog>
  );
}
