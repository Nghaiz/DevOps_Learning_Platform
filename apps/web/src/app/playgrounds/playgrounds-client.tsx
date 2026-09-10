'use client';

import { useMemo } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { t } from '@devops-platform/copy';
import type { AppRouter } from '../../server/trpc/routers/app-router';
import { api } from '../../lib/trpc-react';
import { describeTrpcError, trpcErrorCode } from '../../lib/trpc';
import { CatalogPage, CatalogScopeNotes } from '../../components/catalog/catalog-page';
import { CatalogCard, CatalogGrid, CatalogGridSkeleton } from '../../components/catalog/catalog-grid';
import { CatalogToolbar } from '../../components/catalog/catalog-toolbar';
import { CatalogEmptyState } from '../../components/catalog/catalog-empty';
import { CatalogError } from '../../components/catalog/catalog-error';
import { CatalogPager } from '../../components/catalog/catalog-pager';
import { catalogErrorTitle, catalogLead, catalogTitle, tierLabel } from '../../components/catalog/catalog-labels';
import { buildCatalogListInput } from '../../components/catalog/catalog-input';
import { searchPage } from '../../components/catalog/catalog-search';
import { useCatalogControls } from '../../components/catalog/use-catalog-controls';
import {
  compareCount,
  compareTitle,
  findSortOption,
  sortPage,
  type SortOption,
} from '../../components/catalog/catalog-sort';

type PlaygroundRow = inferRouterOutputs<AppRouter>['playgrounds']['list']['items'][number];

const SORT_OPTIONS: readonly SortOption<PlaygroundRow>[] = [
  { key: 'title', label: t('catalog.sort.title'), compare: compareTitle },
  { key: 'ttl', label: t('catalog.sort.ttl'), compare: compareCount((item) => item.ttlSeconds) },
];

/** Xem `lessonSearchFields` ở `lessons-client.tsx`: tập trường bằng đúng thứ hiện trên thẻ. */
function playgroundSearchFields(item: PlaygroundRow): readonly (string | null)[] {
  return [item.title, item.description, ...item.capabilities];
}

/**
 * Trang danh sách `/playgrounds`, cùng khuôn `lessons-client.tsx`.
 *
 * ⚠ **Không có ô lọc độ khó ở đây, và đó là chủ ý.** `playgrounds.list` NHẬN
 * `difficulty` nhưng bỏ qua nó: `PlaygroundSummary` không có field độ khó
 * (`playgroundSchema` cố ý không có, vì không có bài thì không có gì để khó dễ),
 * và `listPlaygroundsPage` không đọc field filter đó. Hiện một ô lọc mà server
 * không bao giờ áp dụng là một điều khiển nói dối: người dùng bấm, danh sách
 * không đổi, và không có gì trên màn hình giải thích vì sao.
 *
 * Hệ quả cho hàng tab của `CatalogToolbar`: `fields` ở đây là `['tier']`, nên
 * tab ánh xạ sang hạng sandbox chứ không sang độ khó. Ánh xạ đó là dữ liệu
 * (`fields[0]`), không phải một bảng viết tay cho từng trang.
 *
 * TTL hiện NGAY ở đây (đơn vị phút). AC 8.E đòi người học biết môi trường tự
 * đóng sau bao lâu TRƯỚC KHI bấm vào, không chỉ trước khi bấm "Bắt đầu" bên
 * trong `/playgrounds/[id]`.
 */
export function PlaygroundsClient({ canAuthor }: { readonly canAuthor: boolean }): React.ReactElement {
  const controls = useCatalogControls();
  const query = api.playgrounds.list.useQuery(buildCatalogListInput(controls.filters, controls.cursor));

  const sortOption = findSortOption(SORT_OPTIONS, controls.sortKey);
  const loaded = query.data?.items ?? [];
  const items = useMemo(
    () =>
      sortPage(searchPage(query.data?.items ?? [], controls.normalizedSearch, playgroundSearchFields), sortOption),
    [query.data, controls.normalizedSearch, sortOption],
  );
  const hasNext = query.data?.nextCursor != null;

  return (
    <CatalogPage title={catalogTitle('playgrounds')} description={catalogLead('playgrounds')}>
      <CatalogToolbar
        kind="playgrounds"
        fields={['tier']}
        filters={controls.filters}
        onDifficulty={controls.setDifficulty}
        onTier={controls.setTier}
        onClearFilters={controls.clearFilters}
        sortKey={controls.sortKey}
        sortOptions={SORT_OPTIONS}
        onSort={controls.setSortKey}
        search={controls.search}
        onSearch={controls.setSearch}
        shown={query.isSuccess ? items.length : null}
        hasNext={hasNext}
        disabled={query.isPending}
      />

      {query.isPending && <CatalogGridSkeleton />}

      {query.isError && (
        <CatalogError
          title={catalogErrorTitle('playgrounds')}
          message={describeTrpcError(query.error)}
          errorCode={trpcErrorCode(query.error)}
          retrying={query.isFetching}
          page={controls.page}
          onRetry={() => void query.refetch()}
          onFirstPage={controls.goFirst}
        />
      )}

      {query.isSuccess && items.length === 0 && (
        <CatalogEmptyState
          kind="playgrounds"
          page={controls.page}
          hasActiveFilter={controls.hasActiveFilter}
          canAuthor={canAuthor}
          query={controls.normalizedSearch}
          loaded={loaded.length}
          hasNext={hasNext}
          onClearFilters={controls.clearFilters}
          onClearSearch={controls.clearSearch}
          onFirstPage={controls.goFirst}
        />
      )}

      {query.isSuccess && items.length > 0 && (
        <>
          <CatalogGrid>
            {items.map((item) => (
              <CatalogCard
                key={item.id}
                href={`/playgrounds/${item.id}`}
                title={item.title}
                description={item.description}
                meta={[
                  {
                    icon: 'ttl',
                    label: t('catalog.meta.ttl', { minutes: Math.round(item.ttlSeconds / 60) }),
                  },
                  { icon: 'sandbox', label: tierLabel(item.tier) },
                ]}
                tags={item.capabilities}
              />
            ))}
          </CatalogGrid>

          <CatalogScopeNotes
            kind="playgrounds"
            page={controls.page}
            shown={items.length}
            loaded={loaded.length}
            hasNext={hasNext}
            sortKey={controls.sortKey}
            query={controls.normalizedSearch}
          />

          <CatalogPager
            hasNext={hasNext}
            onNext={() => controls.goNext(query.data.nextCursor)}
            onReset={controls.goFirst}
            page={controls.page}
            loading={query.isFetching}
          />
        </>
      )}
    </CatalogPage>
  );
}
