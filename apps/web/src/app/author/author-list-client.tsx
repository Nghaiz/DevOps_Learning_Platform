'use client';

import { useMemo, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { renderCopy, t } from '@devops-platform/copy';
import { Button, Empty, EmptyArt, ErrorBlock, Page, PageHeader, Row, RowList, RowsSkeleton, TopicGlyph } from '@devops-platform/ds';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { topicLook } from '../../lib/topic-look';
import { StateChip, StudioListBody, type StudioFilter } from '../../components/author/studio';
import {
  KIND_KEYS,
  STATE_FILTERS,
  STATE_KEYS,
  countByFilter,
  describeItem,
  describeUpdatedAt,
  filterByState,
  filterLabelKey,
  lastPublishFailure,
  sortByRecent,
  type AuthoredItem,
  type StateFilter,
} from '../../components/author/content-state';

/**
 * `/author`: bài học, lab, sân chơi của người soạn.
 *
 * ## Lọc và tìm ở CLIENT, có đếm
 *
 * `authoring.list` là procedure không tham số và không phân trang: nó trả MỌI bài của
 * người gọi trong một lượt (admin: mọi bài của mọi người). Nên bộ lọc trạng thái và ô
 * tìm chạy tại chỗ, và số ở mỗi tab là số THẬT của toàn bộ, không phải "trang này".
 * `/author/problems` thì phân trang ở máy chủ nên không đếm; hai trang dùng chung
 * `StudioListBody` để trông như một hệ.
 *
 * ⛔ KHÔNG `useInfiniteQuery`: `@trpc/react-query` tự chèn `direction` vào input, mọi
 * input schema của dự án là `.strict()`, và request thật 400.
 * ⛔ KHÔNG dựng `<main>`: vỏ ứng dụng sở hữu landmark đó.
 */
export function AuthorListClient(): ReactElement {
  const [filter, setFilter] = useState<StateFilter>('all');
  const [search, setSearch] = useState('');
  const query = api.authoring.list.useQuery();

  const items: readonly AuthoredItem[] = query.data ?? [];
  const counts = useMemo(() => countByFilter(items), [items]);
  const needle = search.trim().toLocaleLowerCase('vi');
  const shown = useMemo(
    () =>
      sortByRecent(filterByState(items, filter)).filter(
        (item) => needle === '' || item.title.toLocaleLowerCase('vi').includes(needle) || item.id.includes(needle),
      ),
    [items, filter, needle],
  );
  // MỘT mốc thời gian cho cả lượt render, để hai hàng cạnh nhau không đọc hai đồng hồ
  // khác nhau và nhãn "vừa xong" không nhảy giữa các hàng.
  const now = new Date();

  const filters: readonly StudioFilter<StateFilter>[] = STATE_FILTERS.map((value) => ({
    value,
    label: t(filterLabelKey(value)),
    count: counts[value],
  }));

  return (
    <Page className="pb-16">
      <PageHeader
        title={t('author.list.title')}
        lead={t('author.list.lead')}
        actions={
          <Button asChild variant="primary" size="lg" icon="plus">
            <Link href="/author/new">{t('author.list.new-cta')}</Link>
          </Button>
        }
      >
        {query.isSuccess ? (
          <p className="text-sm text-ink-3">{t('author.list.summary', { total: counts.all, drafts: counts.draft })}</p>
        ) : null}
      </PageHeader>

      <div className="flex flex-col gap-6">
        {query.isPending ? <RowsSkeleton rows={4} label={t('author.studio.list.loading')} /> : null}

        {query.isError ? (
          <ErrorBlock
            title={t('author.list.error-title')}
            retryLabel={t('common.action.retry')}
            retrying={query.isFetching}
            onRetry={() => void query.refetch()}
          >
            {describeTrpcError(query.error)}
          </ErrorBlock>
        ) : null}

        {query.isSuccess && items.length === 0 ? (
          <Empty
            title={t('author.list.empty-title')}
            art={<EmptyArt kind="nothing" />}
            action={
              <Button asChild variant="primary" icon="plus">
                <Link href="/author/new">{t('author.list.empty-cta')}</Link>
              </Button>
            }
          >
            {t('author.list.empty-body')}
          </Empty>
        ) : null}

        {query.isSuccess && items.length > 0 ? (
          <StudioListBody
            filterLabel={t('author.studio.list.filter-label')}
            filters={filters}
            filter={filter}
            onFilterChange={setFilter}
            searchLabel={t('author.studio.list.search-label')}
            searchPlaceholder={t('author.studio.list.search-placeholder')}
            search={search}
            onSearchChange={setSearch}
          >
            {shown.length === 0 ? (
              <Empty
                size="sm"
                className="mt-4"
                title={
                  needle === ''
                    ? renderCopy({ key: 'author.list.filter.empty.title', params: { filter: t(filterLabelKey(filter)) } })
                    : t('author.studio.list.no-match', { query: search.trim() })
                }
              >
                {needle === '' ? t('author.list.filter.empty.body') : undefined}
              </Empty>
            ) : (
              <RowList label={t('author.list.board-label')}>
                {shown.map((item) => (
                  <ItemRow key={item.id} item={item} now={now} />
                ))}
              </RowList>
            )}
          </StudioListBody>
        ) : null}
      </div>
    </Page>
  );
}

function ItemRow(props: { readonly item: AuthoredItem; readonly now: Date }): ReactElement {
  const { item } = props;
  const look = topicLook({ id: item.id });
  const failure = lastPublishFailure(item);
  // Lỗi máy chủ có thể dài cả trang. Hàng chỉ mang dòng đầu; nguyên văn nằm ở chế độ
  // Xuất bản của bài, nơi người soạn sửa được nó.
  const reason = failure?.split('\n').find((line) => line.trim() !== '')?.trim() ?? null;

  return (
    <Row
      topic={look.topic}
      leading={<TopicGlyph topic={look.topic} icon={look.icon} size={24} />}
      title={item.title}
      link={<Link href={`/author/${encodeURIComponent(item.id)}`}>{item.title}</Link>}
      description={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span>{renderCopy(describeItem(item))}</span>
          <code className="font-mono text-xs text-ink-3">{item.id}</code>
        </span>
      }
      {...(reason === null
        ? {}
        : { below: <p className="line-clamp-1 text-sm font-medium text-bad-ink">{t('author.list.publish-failed', { reason })}</p> })}
      meta={
        <>
          <span className="w-20 text-xs text-ink-2">{t(KIND_KEYS[item.kind])}</span>
          <span className="w-36 text-xs text-ink-3">{renderCopy(describeUpdatedAt(item.updatedAt, props.now))}</span>
        </>
      }
      trailing={<StateChip state={item.state} label={t(STATE_KEYS[item.state])} />}
    />
  );
}
