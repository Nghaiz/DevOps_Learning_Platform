'use client';

import { ArrowLeft, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { t } from '@devops-platform/copy';
import { Button, Spinner, TopicBadge } from '@devops-platform/ui';
import { PageContainer } from '../../kit';

/**
 * Màn chờ / màn lỗi của chế độ làm bài Git OJ: biển ga trống, một câu nói chuyện
 * gì đang xảy ra, và đúng một việc để làm tiếp khi có lỗi.
 */
export function GitStatusScreen({
  text,
  error = false,
  onRetry,
}: {
  readonly text: string;
  readonly error?: boolean;
  readonly onRetry?: (() => void) | undefined;
}) {
  return (
    <PageContainer className="py-16 md:py-24">
      <div className="max-w-2xl border-t-4 border-line-git pt-8">
        <div className="flex items-center gap-3">
          <TopicBadge line="git" />
          {error ? null : <Spinner aria-hidden="true" />}
        </div>
        <h1 className="mt-5 type-display">
          {error ? t('games.git.status.error-title') : t('games.git.status.loading-title')}
        </h1>
        <p className="mt-4 type-lead text-muted-foreground" role={error ? 'alert' : 'status'}>
          {text}
        </p>
        {error ? (
          <div className="mt-8 flex flex-wrap gap-3">
            {onRetry ? (
              <Button onClick={onRetry} iconLeft={<RotateCcw aria-hidden="true" />}>
                {t('games.git.status.retry')}
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/problems">
                <ArrowLeft aria-hidden="true" />
                {t('games.git.status.back')}
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
}
