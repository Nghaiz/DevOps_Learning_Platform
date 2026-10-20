'use client';

import type { inferRouterOutputs } from '@trpc/server';
import { t } from '@devops-platform/copy';
import type { AppRouter } from '../../server/trpc/routers/app-router';
import { api } from '../../lib/trpc-react';
import { Page, Pill } from '@devops-platform/ds';
import { CatalogHeader } from '../../components/catalog/catalog-header';
import { CatalogToolbar } from '../../components/catalog/catalog-toolbar';
import { CatalogResults } from '../../components/catalog/catalog-results';
import {
  CatalogRow,
  RowDifficulty,
  RowFact,
  contentTopic,
} from '../../components/catalog/catalog-row';
import { describeLoadedScope } from '../../components/catalog/catalog-labels';
import { buildCatalogListInput } from '../../components/catalog/catalog-input';
import { combineCatalogPages } from '../../components/catalog/catalog-pages';
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

type LabRow = inferRouterOutputs<AppRouter>['labs']['list']['items'][number];

const SORT_OPTIONS: readonly SortOption<LabRow>[] = [
  { key: 'title', label: t('catalog.sort.title'), compare: compareTitle },
  { key: 'difficulty', label: t('catalog.sort.difficulty'), compare: compareDifficulty },
  { key: 'duration', label: t('catalog.sort.duration'), compare: compareMinutes },
  { key: 'tasks', label: t('catalog.sort.tasks'), compare: compareCount((item) => item.taskCount) },
];

function labSearchFields(item: LabRow): readonly (string | null)[] {
  return [item.title, item.description, ...item.capabilities];
}

/**
 * Trang danh sách `/labs`. Cùng khuôn với `/lessons` (xem chú thích ở
 * `lessons-client.tsx`): `useQueries` theo ngăn xếp cursor, lọc chủ đề/độ khó/
 * sandbox ở server, tìm và sắp xếp trên phần đã tải.
 *
 * Lab không có tiến độ trong payload danh sách, nên dòng không có trạng thái
 * học; cờ "Có xếp hạng" đứng ở khe trạng thái. Ngưỡng đạt và hạng sandbox nằm ở
 * trang chi tiết: trên danh sách chúng là hai cột mà gần như dòng nào cũng giống nhau.
 */
export function LabsClient({
  canAuthor,
  total,
}: {
  readonly canAuthor: boolean;
  readonly total: number | null;
}): React.ReactElement {
  const controls = useCatalogControls();
  const results = api.useQueries((q) =>
    controls.cursors.map((cursor) => q.labs.list(buildCatalogListInput(controls.filters, cursor))),
  );
  const pages = combineCatalogPages(results);
  const loaded = pages.status === 'success' ? pages.items : [];
  const items = sortPage(
    searchPage(loaded, controls.normalizedSearch, labSearchFields),
    findSortOption(SORT_OPTIONS, controls.sortKey),
  );
  const hasNext = pages.status === 'success' && pages.hasNext;

  return (
    <Page className="pb-14">
      <CatalogHeader kind="labs" count={total} />
      <CatalogToolbar
        kind="labs"
        fields={['topic', 'difficulty', 'tier']}
        filters={controls.filters}
        onTopic={controls.setTopic}
        onDifficulty={controls.setDifficulty}
        onTier={controls.setTier}
        onClearFilters={controls.clearFilters}
        sortKey={controls.sortKey}
        sortOptions={SORT_OPTIONS}
        onSort={controls.setSortKey}
        search={controls.search}
        onSearch={controls.setSearch}
        scopeNote={describeLoadedScope({
          kind: 'labs',
          loaded: loaded.length,
          hasNext,
          searching: controls.hasSearch,
          sorting: controls.isSorted,
        })}
        disabled={pages.status === 'pending'}
      />
      <div className="pt-2">
        <CatalogResults
          kind="labs"
          pages={pages}
          shown={items.length}
          controls={controls}
          canAuthor={canAuthor}
          onRetry={(index) => void results[index]?.refetch()}
          isFetching={(index) => results[index]?.isFetching ?? false}
        >
          {items.map((item) => (
            <CatalogRow
              key={item.id}
              href={`/labs/${item.id}`}
              topic={contentTopic(item)}
              title={item.title}
              description={item.description}
              meta={
                <>
                  <RowDifficulty level={item.difficulty} />
                  <RowFact icon="target" width="w-28">
                    {t('unit.task', { n: item.taskCount })}
                  </RowFact>
                  <RowFact icon="clock" width="w-24">
                    {item.estimatedMinutes === null
                      ? null
                      : t('catalog.meta.duration', { minutes: item.estimatedMinutes })}
                  </RowFact>
                </>
              }
              state={
                item.leaderboard ? (
                  <Pill tone="acc" icon="award">
                    {t('catalog.flag.leaderboard')}
                  </Pill>
                ) : undefined
              }
            />
          ))}
        </CatalogResults>
      </div>
    </Page>
  );
}
