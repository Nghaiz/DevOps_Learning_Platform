'use client';

import { useMemo, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge, Button, EmptyState, ErrorState } from '@devops-platform/ui';
import { renderCopy, t } from '@devops-platform/copy';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { Board, BoardRow, BoardSkeleton, PageContainer, PosterHeader, lineForTopic } from '../../components/kit';
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
 * `authoring.list` là procedure không tham số và không phân trang: nó trả MỌI
 * bài của người gọi trong một lượt (admin: mọi bài của mọi người). Nên bộ lọc
 * trạng thái và ô tìm chạy tại chỗ, và số ở mỗi tab là số THẬT của toàn bộ, không
 * phải "trang này". `/author/problems` thì phân trang ở máy chủ nên không đếm;
 * hai trang dùng chung `StudioListBody` để trông như một hệ.
 *
 * ⛔ KHÔNG `useInfiniteQuery`: `@trpc/react-query` tự chèn `direction` vào input,
 * mọi input schema của dự án là `.strict()`, và request thật 400.
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
        (item) =>
          needle === '' ||
          item.title.toLocaleLowerCase('vi').includes(needle) ||
          item.id.includes(needle),
      ),
    [items, filter, needle],
  );
  // MỘT mốc thời gian cho cả lượt render, để hai hàng cạnh nhau không đọc hai
  // đồng hồ khác nhau và nhãn "vừa xong" không nhảy giữa các hàng.
  const now = new Date();

  const filters: readonly StudioFilter<StateFilter>[] = STATE_FILTERS.map((value) => ({
    value,
    label: t(filterLabelKey(value)),
    count: counts[value],
  }));

  const newButton = (
    <Button asChild variant="ink" size="lg" iconLeft={<Plus aria-hidden className="size-4" />}>
      <Link href="/author/new">{t('author.list.new-cta')}</Link>
    </Button>
  );

  return (
    <>
      <PosterHeader
        section="studio"
        kicker={
          query.isSuccess
            ? t('author.list.kicker', { total: counts.all, drafts: counts.draft })
            : undefined
        }
        title={t('author.list.title')}
        lead={t('author.list.lead')}
        aside={newButton}
      />
      <PageContainer>
        <div className="flex flex-col gap-6 py-10">
          {query.isPending && <BoardSkeleton rows={4} label={t('author.studio.list.loading')} />}

          {query.isError && (
            <ErrorState
              title={t('author.list.error-title')}
              message={describeTrpcError(query.error)}
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          )}

          {query.isSuccess && items.length === 0 && (
            <EmptyState
              title={t('author.list.empty-title')}
              description={t('author.list.empty-body')}
              action={
                <Button asChild>
                  <Link href="/author/new">{t('author.list.empty-cta')}</Link>
                </Button>
              }
            />
          )}

          {query.isSuccess && items.length > 0 && (
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
                <EmptyState
                  title={
                    needle === ''
                      ? renderCopy({
                          key: 'author.list.filter.empty.title',
                          params: { filter: t(filterLabelKey(filter)) },
                        })
                      : t('author.studio.list.no-match', { query: search.trim() })
                  }
                  description={needle === '' ? t('author.list.filter.empty.body') : undefined}
                />
              ) : (
                <Board label={t('author.list.board-label')}>
                  {shown.map((item, index) => (
                    <ItemRow key={item.id} item={item} index={index + 1} now={now} />
                  ))}
                </Board>
              )}
            </StudioListBody>
          )}
        </div>
      </PageContainer>
    </>
  );
}

function ItemRow(props: {
  readonly item: AuthoredItem;
  readonly index: number;
  readonly now: Date;
}): ReactElement {
  const { item } = props;
  const failure = lastPublishFailure(item);
  // Lỗi máy chủ có thể dài cả trang. Hàng chỉ mang dòng đầu; nguyên văn nằm ở
  // chế độ Xuất bản của bài, nơi người soạn sửa được nó.
  const reason = failure?.split('\n').find((line) => line.trim() !== '')?.trim() ?? null;

  return (
    <BoardRow
      href={`/author/${encodeURIComponent(item.id)}`}
      index={props.index}
      order={props.index - 1}
      line={lineForTopic({ id: item.id })}
      title={item.title}
      sub={
        <span className="flex flex-col gap-1">
          <span>
            {renderCopy(describeItem(item))} · <code className="font-mono text-xs">{item.id}</code>
          </span>
          {reason !== null && (
            <span className="line-clamp-1 font-medium text-destructive">
              {t('author.list.publish-failed', { reason })}
            </span>
          )}
        </span>
      }
      meta={
        <>
          <Badge variant="outline">{t(KIND_KEYS[item.kind])}</Badge>
          <span className="font-mono text-xs text-muted-foreground">
            {renderCopy(describeUpdatedAt(item.updatedAt, props.now))}
          </span>
        </>
      }
      state={<StateChip state={item.state} label={t(STATE_KEYS[item.state])} />}
    />
  );
}
