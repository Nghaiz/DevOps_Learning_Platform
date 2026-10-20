'use client';

import Link from 'next/link';
import { Button, Empty, EmptyArt, ErrorBlock, Icon, ProgressLine, Row, RowList, RowsSkeleton, Section } from '@devops-platform/ds';
import { err, t } from '@devops-platform/copy';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { formatWhen } from '../../lib/format-moment';
import { summarizePathProgress } from './path-progress';

const LIMIT = 4;

/**
 * Bài học và lộ trình đang dở. Lộ trình có thanh tiến độ đúng tỉ lệ phần đã đạt;
 * bài học nói bước đang đứng. Bấm cả dòng để học tiếp.
 */
export function ContinueLearning({ headingLevel = 2 }: { readonly headingLevel?: 2 | 3 }) {
  const paths = api.paths.mine.useQuery({});
  const progress = api.me.listProgress.useQuery({});
  const lessons = (progress.data?.items ?? [])
    .filter((row) => row.completedAt === null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, LIMIT);
  const pathRows = (paths.data?.items ?? []).slice(0, LIMIT);
  const pending = paths.isPending || progress.isPending;
  const failed = paths.isError ? paths.error : progress.isError ? progress.error : null;
  const empty = !pending && failed === null && lessons.length === 0 && pathRows.length === 0;

  return (
    <Section title={t('me.continue.title')} level={headingLevel} icon="book">
      {pending ? <RowsSkeleton rows={3} label={t('me.continue.loading')} /> : null}
      {failed !== null ? (
        <ErrorBlock
          title={err('me.error.paths-load', { reason: describeTrpcError(failed) }).what}
          retryLabel={t('common.action.retry')}
          onRetry={() => {
            void paths.refetch();
            void progress.refetch();
          }}
        >
          {err('me.error.paths-load', { reason: describeTrpcError(failed) }).next}
        </ErrorBlock>
      ) : null}
      {empty ? (
        <Empty
          size="sm"
          art={<EmptyArt kind="nothing" width={72} />}
          title={t('me.continue.empty-title')}
          action={
            <Button asChild size="sm" variant="secondary">
              <Link href="/lessons">{t('me.continue.empty-action')}</Link>
            </Button>
          }
        >
          {t('me.continue.empty-body')}
        </Empty>
      ) : null}
      {!pending && failed === null && !empty ? (
        <RowList label={t('me.continue.title')}>
          {pathRows.map((path) => {
            const summary = summarizePathProgress({
              passedCount: path.passedCount,
              itemCount: path.itemCount,
              nextItemId: path.nextItemId,
            });
            return (
              <Row
                key={`path-${path.id}`}
                leading={<Icon name="stairs" size={26} tint="acc" className="text-acc-ink" />}
                title={path.title}
                link={<Link href={`/paths/${encodeURIComponent(path.id)}`}>{path.title}</Link>}
                description={t('me.continue.path')}
                meta={
                  <ProgressLine
                    className="w-48"
                    value={summary.max === 0 ? 0 : summary.value / summary.max}
                    label={summary.label}
                    caption={`${String(summary.value)}/${String(summary.max)}`}
                  />
                }
              />
            );
          })}
          {lessons.map((row) => {
            const title = row.lessonTitle ?? row.lessonId;
            return (
              <Row
                key={`lesson-${row.id}`}
                leading={<Icon name="book" size={26} tint="acc" className="text-acc-ink" />}
                title={title}
                link={<Link href={`/lessons/${encodeURIComponent(row.lessonId)}`}>{title}</Link>}
                description={`${t('me.continue.lesson')}. ${t('me.lessons.step', { step: row.stepIndex + 1 })}, ${formatWhen(row.updatedAt)}.`}
                meta={<span className="text-sm font-medium text-acc-ink">{t('me.continue.open')}</span>}
              />
            );
          })}
        </RowList>
      ) : null}
    </Section>
  );
}
