'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Icon } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import { ZOD_JITLESS_APPLIED } from '../../lib/zod-jitless';
import { isImmersiveRoute } from './immersive-routes';
import { describeProfileCapacity } from './capacity';
import { CapacityProvider, useCapacity } from './use-capacity';
import { CommandMenu } from './command-menu';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { SectionBar } from './section-bar';
import { activeSection, sectionsFor, type Viewer } from './nav';
import { ViewerProvider } from './viewer-context';

/**
 * Vỏ ứng dụng. Đây là nơi DUY NHẤT render `<main>` (landmark-contract.test.ts).
 *
 * Ba chế độ: landing (`/`) tự vẽ mọi thứ; trang khu thực hành và cửa sổ terminal là
 * toàn màn (không thanh trên, không chân trang); còn lại có thanh trên, thanh mục con
 * nếu đang trong một mục, và chân trang.
 *
 * `data-section` đặt ở khung ngoài cùng: mọi thứ bên trong đọc màu nhấn của mục đang
 * mở qua `--acc-*`, kể cả trang toàn màn.
 */
export function AppShell({ viewer, children }: { readonly viewer: Viewer | null; readonly children: ReactNode }) {
  void ZOD_JITLESS_APPLIED;
  const pathname = usePathname();
  const search = useSearchParams();
  const [commandOpen, setCommandOpen] = useState(false);

  const isLanding = pathname === '/';
  const immersive = !isLanding && isImmersiveRoute(pathname);
  const chrome = !isLanding && !immersive;
  const sectionId = activeSection(pathname, search.toString());
  const section = sectionId === null ? null : (sectionsFor(viewer).find((entry) => entry.id === sectionId) ?? null);

  const openCommand = useCallback(() => setCommandOpen(true), []);

  useEffect(() => {
    if (isLanding) return;
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isLanding]);

  return (
    <ViewerProvider viewer={viewer}>
      <CapacityProvider enabled={viewer !== null}>
        <a
          href="#noi-dung"
          className="sr-only z-[70] rounded-md bg-ink px-4 py-3 font-medium text-canvas focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          {t('shell.skip.label')}
        </a>
        <div data-section={sectionId ?? undefined} className={chrome ? 'flex min-h-dvh flex-col' : undefined}>
          {chrome ? <SiteHeader viewer={viewer} activeId={sectionId} onOpenCommand={openCommand} /> : null}
          {chrome && section !== null ? <SectionBar section={section} pathname={pathname} search={search.toString()} /> : null}
          <main id="noi-dung" tabIndex={-1} className={chrome ? 'flex flex-1 flex-col outline-none' : 'outline-none'}>
            {chrome && viewer !== null ? <CapacityFullBanner /> : null}
            {children}
          </main>
          {chrome ? <SiteFooter /> : null}
        </div>
        {isLanding ? null : <CommandMenu viewer={viewer} open={commandOpen} onOpenChange={setCommandOpen} />}
      </CapacityProvider>
    </ViewerProvider>
  );
}

/** Dải báo kín chỗ, chỉ hiện khi cụm thật sự hết chỗ. */
function CapacityFullBanner() {
  const { data } = useCapacity();
  if (data === null) return null;
  const reading = describeProfileCapacity(data);
  if (reading === null || reading.tone !== 'full') return null;
  return (
    <div role="status" className="border-b border-rule bg-warn-wash">
      <div className="mx-auto flex max-w-[1200px] items-start gap-3 px-4 py-2.5 text-sm text-warn-ink sm:px-6 lg:px-8">
        <Icon name="warning" size={18} className="mt-px" />
        <p>
          <strong className="font-medium">{t('shell.capacity.full-title')}.</strong> <span className="text-ink-2">{reading.detail}</span>
        </p>
      </div>
    </div>
  );
}
