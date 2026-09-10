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
import type { CatalogMetaItem } from '../../components/catalog/catalog-grid';
import { buildCatalogListInput } from '../../components/catalog/catalog-input';
import { searchPage } from '../../components/catalog/catalog-search';
import { useCatalogControls } from '../../components/catalog/use-catalog-controls';
import {
  compareCount,
  compareDifficulty,
  compareMinutes,
  compareTitle,
  findSortOption,
  sortPage,
  type SortOption,
} from '../../components/catalog/catalog-sort';
import { catalogErrorTitle, catalogLead, catalogTitle, tierLabel } from '../../components/catalog/catalog-labels';

type LabRow = inferRouterOutputs<AppRouter>['labs']['list']['items'][number];

/** Bốn ô thông tin của thẻ lab. `estimatedMinutes` có thể `null`; xem ghi chú cùng tên ở `lessons-client.tsx`. */
function labMeta(item: LabRow): readonly CatalogMetaItem[] {
  const meta: CatalogMetaItem[] = [
    { icon: 'tasks', label: t('unit.task', { n: item.taskCount }) },
    { icon: 'threshold', label: t('catalog.meta.threshold', { percent: item.passThresholdPercent }) },
  ];
  if (item.estimatedMinutes !== null) {
    meta.push({ icon: 'duration', label: t('catalog.meta.duration', { minutes: item.estimatedMinutes }) });
  }
  meta.push({ icon: 'sandbox', label: tierLabel(item.tier) });
  return meta;
}

/** Xem `lessonSearchFields` ở `lessons-client.tsx` về việc vì sao tập trường này bằng đúng thứ hiện trên thẻ. */
function labSearchFields(item: LabRow): readonly (string | null)[] {
  return [item.title, item.description, ...item.capabilities];
}

const SORT_OPTIONS: readonly SortOption<LabRow>[] = [
  { key: 'title', label: t('catalog.sort.title'), compare: compareTitle },
  { key: 'difficulty', label: t('catalog.sort.difficulty'), compare: compareDifficulty },
  { key: 'duration', label: t('catalog.sort.duration'), compare: compareMinutes },
  { key: 'tasks', label: t('catalog.sort.tasks'), compare: compareCount((item) => item.taskCount) },
];

/**
 * Trang danh sách `/labs`, cùng khuôn `lessons-client.tsx`, gồm cả ràng buộc
 * `useQuery` (không `useInfiniteQuery`), lọc ở SERVER, và ô tìm chỉ soi trang
 * đang tải. Lý lẽ đầy đủ nằm ở bản gốc, không chép lại ở đây.
 *
 * Khác lessons ở một điểm đáng giữ: `labs.list` KHÔNG trả
 * `unsupportedCapabilities` cho từng mục (chỉ `labs.get` mới trả). Cảnh báo năng
 * lực thật sự, thứ chặn một lượt chạy TRƯỚC khi nó hỏng, nằm ở `/labs/[id]`,
 * trước nút "Bắt đầu". Trang này chỉ hiện các nhãn năng lực lab YÊU CẦU, không
 * tự phán "hỗ trợ hay không": phán đoán đó là logic phía server
 * (`server/lessons/catalog.ts`) và dựng lại nó ở đây sẽ là một nguồn sự thật thứ
 * hai, trôi khỏi bản gốc ở lần đầu tiên ai đó đổi danh sách năng lực đã đo.
 */
export function LabsClient({ canAuthor }: { readonly canAuthor: boolean }): React.ReactElement {
  const controls = useCatalogControls();
  const query = api.labs.list.useQuery(buildCatalogListInput(controls.filters, controls.cursor));

  const sortOption = findSortOption(SORT_OPTIONS, controls.sortKey);
  const loaded = query.data?.items ?? [];
  const items = useMemo(
    () => sortPage(searchPage(query.data?.items ?? [], controls.normalizedSearch, labSearchFields), sortOption),
    [query.data, controls.normalizedSearch, sortOption],
  );
  const hasNext = query.data?.nextCursor != null;

  return (
    <CatalogPage title={catalogTitle('labs')} description={catalogLead('labs')}>
      <CatalogToolbar
        kind="labs"
        fields={['difficulty', 'tier']}
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
          title={catalogErrorTitle('labs')}
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
          kind="labs"
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
                href={`/labs/${item.id}`}
                title={item.title}
                description={item.description}
                difficulty={item.difficulty}
                {...(item.leaderboard
                  ? { flag: { icon: 'leaderboard' as const, label: t('catalog.flag.leaderboard') } }
                  : {})}
                meta={labMeta(item)}
                tags={item.capabilities}
              />
            ))}
          </CatalogGrid>

          <CatalogScopeNotes
            kind="labs"
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
