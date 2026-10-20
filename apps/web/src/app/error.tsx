'use client';

import { useEffect } from 'react';
import { Button, EmptyArt, Page } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';

/**
 * Lỗi render chung của mọi route (Next App Router `error.tsx`). Nói thẳng lỗi ở phía
 * hệ thống, cho một nút thử lại và mã `digest` để báo giảng viên.
 */
export default function RouteError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error('[route-error]', error);
  }, [error]);

  return (
    <Page width="text" className="flex flex-1 flex-col justify-center py-16 md:py-24">
      <div className="flex flex-col items-start gap-4">
        <EmptyArt kind="offline" width={180} className="animate-enter" />
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink">{t('common.crash.title')}</h1>
        <p className="max-w-[56ch] text-lg text-ink-2">{t('common.crash.body')}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button variant="primary" icon="refresh" onClick={reset}>
            {t('common.crash.retry')}
          </Button>
          {error.digest === undefined ? null : (
            <code className="rounded-xs bg-well px-2 py-1 font-mono text-sm text-ink-2">
              {t('common.crash.digest', { digest: error.digest })}
            </code>
          )}
        </div>
      </div>
    </Page>
  );
}
