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
import { catalogErrorTitle, catalogLead, catalogTitle } from '../../components/catalog/catalog-labels';
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

type PathRow = inferRouterOutputs<AppRouter>['paths']['list']['items'][number];

const SORT_OPTIONS: readonly SortOption<PathRow>[] = [
  { key: 'title', label: t('catalog.sort.title'), compare: compareTitle },
  { key: 'items', label: t('catalog.sort.parts'), compare: compareCount((item) => item.itemCount) },
];

/** Lộ trình không mang nhãn năng lực, nên ô tìm soi đúng hai trường hiện trên thẻ. */
function pathSearchFields(item: PathRow): readonly (string | null)[] {
  return [item.title, item.description];
}

/**
 * Trang danh sách `/paths`, cùng khuôn `lessons-client.tsx` (`useQuery`, không
 * `useInfiniteQuery`; không gửi `limit`).
 *
 * ⚠ **Không có ô lọc nào ở đây, và đó là ràng buộc của API chứ không phải một
 * bước làm dở.** `paths.list` nhận đúng `listInputSchema` (`limit` + `cursor`) và
 * `.strict()` TỪ CHỐI `difficulty`/`tier` bằng 400, thứ mà
 * `catalog-input.test.ts` khẳng định lại. Điều đó cũng hợp lý về dữ liệu: một lộ
 * trình gom nhiều bài có độ khó khác nhau, nên "độ khó của lộ trình" không phải
 * một field bị quên mà là một khái niệm chưa được định nghĩa.
 *
 * `fields={[]}` vì vậy, và `CatalogToolbar` hiểu điều đó theo đúng nghĩa đen:
 * không tab, không chip, chỉ còn ô tìm và ô sắp xếp. `SearchTabs` xử lý
 * `tabs: []` sẵn nên trang này không mọc ra một hàng tab giả.
 */
export function PathsClient({ canAuthor }: { readonly canAuthor: boolean }): React.ReactElement {
  const controls = useCatalogControls();
  const query = api.paths.list.useQuery(buildCatalogListInput(controls.filters, controls.cursor));

  const sortOption = findSortOption(SORT_OPTIONS, controls.sortKey);
  const loaded = query.data?.items ?? [];
  const items = useMemo(
    () => sortPage(searchPage(query.data?.items ?? [], controls.normalizedSearch, pathSearchFields), sortOption),
    [query.data, controls.normalizedSearch, sortOption],
  );
  const hasNext = query.data?.nextCursor != null;

  return (
    <CatalogPage title={catalogTitle('paths')} description={catalogLead('paths')}>
      <CatalogToolbar
        kind="paths"
        fields={[]}
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
          title={catalogErrorTitle('paths')}
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
          kind="paths"
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
                href={`/paths/${item.id}`}
                title={item.title}
                description={item.description}
                {...(item.sequential
                  ? { flag: { icon: 'sequential' as const, label: t('catalog.flag.sequential') } }
                  : {})}
                meta={[{ icon: 'parts', label: t('catalog.meta.parts', { n: item.itemCount }) }]}
              />
            ))}
          </CatalogGrid>

          <CatalogScopeNotes
            kind="paths"
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
