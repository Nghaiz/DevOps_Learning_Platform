'use client';

import Link from 'next/link';
import { Button, Empty, EmptyArt, ErrorBlock, Icon, Pill, Row, RowList, RowsSkeleton, Section, type Tone } from '@devops-platform/ds';
import { err, t } from '@devops-platform/copy';
import type { ContentState } from '@devops-platform/shared-types/authoring';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { formatWhen } from '../../lib/format-moment';
import { KIND_KEYS, STATE_KEYS } from '../author/content-state';

const LIMIT = 5;

const STATE_TONE: Readonly<Record<ContentState, Tone>> = {
  draft: 'neutral',
  publishing: 'info',
  published: 'ok',
  archived: 'warn',
};

const KIND_ICON = { lesson: 'book', lab: 'flask', playground: 'sandbox' } as const;

/**
 * Năm bài người soạn đụng tới gần nhất. `authoring.list` trả cả danh sách trong một
 * lượt (không phân trang), nên sắp và cắt ở client là đúng chỗ, không phải lối tắt.
 */
export function StudioRecent() {
  const list = api.authoring.list.useQuery();
  const items = [...(list.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, LIMIT);

  return (
    <Section title={t('hub.studio.recent')} description={t('hub.studio.recent-description')} icon="history">
      {list.isPending ? <RowsSkeleton rows={3} label={t('hub.studio.recent')} /> : null}
      {list.isError ? (
        <ErrorBlock
          title={err('hub.error.studio-load', { reason: describeTrpcError(list.error) }).what}
          retryLabel={t('common.action.retry')}
          retrying={list.isFetching}
          onRetry={() => void list.refetch()}
        >
          {err('hub.error.studio-load', { reason: describeTrpcError(list.error) }).next}
        </ErrorBlock>
      ) : null}
      {list.isSuccess && items.length === 0 ? (
        <Empty
          size="sm"
          art={<EmptyArt kind="nothing" width={72} />}
          title={t('hub.studio.recent-empty-title')}
          action={
            <Button asChild size="sm" variant="primary" icon="plus">
              <Link href="/author/new">{t('hub.studio.new-lesson')}</Link>
            </Button>
          }
        >
          {t('hub.studio.recent-empty-body')}
        </Empty>
      ) : null}
      {items.length > 0 ? (
        <RowList label={t('hub.studio.recent')}>
          {items.map((item) => (
            <Row
              key={item.id}
              leading={<Icon name={KIND_ICON[item.kind]} size={24} tint="acc" className="text-acc-ink" />}
              title={item.title}
              link={<Link href={`/author/${encodeURIComponent(item.id)}`}>{item.title}</Link>}
              description={`${t(KIND_KEYS[item.kind])}, ${t('hub.studio.steps', { n: item.stepCount })}. ${t('hub.studio.updated', { when: formatWhen(item.updatedAt) })}.`}
              meta={<Pill tone={STATE_TONE[item.state]}>{t(STATE_KEYS[item.state])}</Pill>}
            />
          ))}
        </RowList>
      ) : null}
    </Section>
  );
}
