'use client';

import { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { Button } from '@devops-platform/ui';
import { PageContainer } from '../components/kit';

/**
 * Lỗi render chung của mọi route (Next App Router `error.tsx`). Nói thẳng lỗi ở
 * phía hệ thống, cho một nút thử lại và mã `digest` để báo giảng viên.
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
    <PageContainer className="flex flex-1 flex-col justify-center py-16 md:py-24">
      <div className="max-w-2xl animate-rise">
        <p className="inline-flex items-center gap-2 bg-signal px-2 py-1 type-label text-signal-foreground">
          {t('common.crash.kicker')}
        </p>
        <h1 className="mt-5 type-display">{t('common.crash.title')}</h1>
        <p className="mt-4 type-lead text-muted-foreground">{t('common.crash.body')}</p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button onClick={reset} iconLeft={<RotateCcw />}>
            {t('common.crash.retry')}
          </Button>
          {error.digest && (
            <code className="bg-muted px-2 py-1 font-mono text-sm">{t('common.crash.digest', { digest: error.digest })}</code>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
