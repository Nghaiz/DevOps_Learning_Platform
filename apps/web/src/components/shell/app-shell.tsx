'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { TriangleAlert } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { ZOD_JITLESS_APPLIED } from '../../lib/zod-jitless';
import { isImmersiveRoute } from './immersive-routes';
import { describeProfileCapacity } from './capacity';
import { CapacityProvider, useCapacity } from './use-capacity';
import { CommandPalette } from './command-palette';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import type { Viewer } from './nav';
import { ViewerProvider } from './viewer-context';

/**
 * Vỏ ứng dụng của bản dựng lại PTIT (design-brief §3).
 *
 * Ba chế độ, quyết định bằng đường hiện tại:
 * - `/`: trang giới thiệu do phiên 5a dựng. Chỉ providers + `<main>` trần, trang tự
 *   vẽ thanh trên và chân trang của nó.
 * - immersive (`isImmersiveRoute`): bài học, lab, sân chơi, màn game. Không header,
 *   không footer; trang tự vẽ thanh gọn của nó.
 * - còn lại: header chrome + `<main>` + footer.
 *
 * ⚠ `<main>` xuất hiện ĐÚNG MỘT LẦN trong toàn bộ mã TSX, ở file này
 * (`components/session/landmark-contract.test.ts`). Đừng thêm `<main>` ở trang.
 */
export function AppShell({
  viewer,
  children,
}: {
  readonly viewer: Viewer | null;
  readonly children: ReactNode;
}) {
  void ZOD_JITLESS_APPLIED;
  const pathname = usePathname();
  const [commandOpen, setCommandOpen] = useState(false);
  const isLanding = pathname === '/';
  const immersive = !isLanding && isImmersiveRoute(pathname);
  const chrome = !isLanding && !immersive;

  return (
    <ViewerProvider viewer={viewer}>
      <CapacityProvider enabled={viewer !== null}>
        <a
          href="#noi-dung"
          className="sr-only z-50 bg-signal px-4 py-3 font-semibold text-signal-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          {t('shell.skip.label')}
        </a>
        <div className={chrome ? 'flex min-h-dvh flex-col' : undefined}>
          {chrome && <SiteHeader viewer={viewer} onOpenCommand={() => setCommandOpen(true)} />}
          <main
            id="noi-dung"
            tabIndex={-1}
            className={chrome ? 'flex flex-1 flex-col outline-none' : 'outline-none'}
          >
            {chrome && viewer && <CapacityFullBanner />}
            {children}
          </main>
          {chrome && <SiteFooter viewer={viewer} />}
        </div>
        {!isLanding && (
          <CommandPalette viewer={viewer} open={commandOpen} onOpenChange={setCommandOpen} />
        )}
      </CapacityProvider>
    </ViewerProvider>
  );
}

function CapacityFullBanner() {
  const { data } = useCapacity();
  if (data === null) return null;
  const reading = describeProfileCapacity(data);
  if (reading === null || reading.tone !== 'full') return null;
  return (
    <div role="status" className="bg-signal text-signal-foreground">
      <div className="mx-auto flex max-w-[1440px] items-start gap-3 px-5 py-3 md:px-8">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p className="text-sm">
          <strong className="font-semibold">{t('shell.capacity.full-title')}.</strong> {reading.detail}
        </p>
      </div>
    </div>
  );
}
