'use client';

import type { inferRouterOutputs } from '@trpc/server';
import { t } from '@devops-platform/copy';
import type { AppRouter } from '../../server/trpc/routers/app-router';
import { api } from '../../lib/trpc-react';
import { Page, Pill, Segments } from '@devops-platform/ds';
import { CatalogHeader } from '../../components/catalog/catalog-header';
import { CatalogToolbar } from '../../components/catalog/catalog-toolbar';
import { CatalogResults } from '../../components/catalog/catalog-results';
import { CatalogRow, RowFact } from '../../components/catalog/catalog-row';
import { describeLoadedScope } from '../../components/catalog/catalog-labels';
import { buildCatalogListInput } from '../../components/catalog/catalog-input';
import { combineCatalogPages } from '../../components/catalog/catalog-pages';
import { searchPage } from '../../components/catalog/catalog-search';
import { useCatalogControls } from '../../components/catalog/use-catalog-controls';
import {
  compareCount,
  compareTitle,
  findSortOption,
  sortPage,
  type SortOption,
} from '../../components/catalog/catalog-sort';
import { buildPathItemViews, summarizePathProgress } from './[id]/path-view';

type PathRow = inferRouterOutputs<AppRouter>['paths']['list']['items'][number];
type PathDetail = inferRouterOutputs<AppRouter>['paths']['get'];

const SORT_OPTIONS: readonly SortOption<PathRow>[] = [
  { key: 'title', label: t('catalog.sort.title'), compare: compareTitle },
  { key: 'items', label: t('catalog.sort.parts'), compare: compareCount((item) => item.itemCount) },
];

function pathSearchFields(item: PathRow): readonly (string | null)[] {
  return [item.title, item.description];
}

function segmentsOf(detail: PathDetail) {
  return buildPathItemViews(detail.items, detail.nextItemId).map((view) => view.segment);
}

/**
 * Trang danh sách `/paths`: mỗi lộ trình là một dòng, và dưới tên là dải tiến độ của
 * chính người xem, mỗi ô một phần (đã đạt, nên làm tiếp, chưa tới).
 *
 * ## Dải tiến độ đọc `paths.get` cho TỪNG lộ trình đã tải
 *
 * `paths.list` chỉ trả `itemCount`, không trả mắt xích. Trang gọi `paths.get` cho mỗi
 * lộ trình đã tải (một `useQueries`, gộp vào một request nhờ `httpBatchLink`). Lộ
 * trình nào chưa về chi tiết thì dòng vẫn hiện, chỉ chưa có dải.
 *
 * Dải là `role="meter"` có nhãn và số: tiến độ còn được nói bằng chữ ở cột thông tin
 * ("Đã đạt 2/5 phần"). Ô KHÔNG là liên kết: mở một phần phải đi qua cổng
 * `paths.openItem` ở trang chi tiết.
 *
 * Không có bộ lọc: `paths.list` nhận đúng cursor, `.strict()` từ chối mọi field lọc.
 */
export function PathsClient({ canAuthor }: { readonly canAuthor: boolean }): React.ReactElement {
  const controls = useCatalogControls();
  const results = api.useQueries((q) =>
    controls.cursors.map((cursor) => q.paths.list(buildCatalogListInput(controls.filters, cursor))),
  );
  const pages = combineCatalogPages(results);
  const loaded = pages.status === 'success' ? pages.items : [];
  const details = api.useQueries((q) => loaded.map((path) => q.paths.get({ pathId: path.id })));
  const detailById = new Map<string, PathDetail>();
  for (const detail of details) {
    if (detail.data !== undefined) detailById.set(detail.data.id, detail.data);
  }

  const items = sortPage(
    searchPage(loaded, controls.normalizedSearch, pathSearchFields),
    findSortOption(SORT_OPTIONS, controls.sortKey),
  );
  const hasNext = pages.status === 'success' && pages.hasNext;
  const count = pages.status === 'success' && !hasNext ? loaded.length : null;

  return (
    <Page className="pb-14">
      <CatalogHeader kind="paths" count={count} />
      <CatalogToolbar
        kind="paths"
        fields={[]}
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
          kind: 'paths',
          loaded: loaded.length,
          hasNext,
          searching: controls.hasSearch,
          sorting: controls.isSorted,
        })}
        disabled={pages.status === 'pending'}
      />
      <div className="pt-2">
        <CatalogResults
          kind="paths"
          pages={pages}
          shown={items.length}
          controls={controls}
          canAuthor={canAuthor}
          onRetry={(index) => void results[index]?.refetch()}
          isFetching={(index) => results[index]?.isFetching ?? false}
        >
          {items.map((item) => {
            const detail = detailById.get(item.id);
            const progress = detail === undefined ? null : summarizePathProgress(detail);
            const segments = detail === undefined ? [] : segmentsOf(detail);
            return (
              <CatalogRow
                key={item.id}
                href={`/paths/${item.id}`}
                topic={{ id: item.id }}
                title={item.title}
                description={item.description}
                below={
                  segments.length > 0 ? (
                    <Segments
                      states={segments}
                      label={progress?.label ?? t('catalog.path.meter')}
                      className="max-w-sm"
                    />
                  ) : undefined
                }
                meta={
                  <>
                    <RowFact icon="layers" width="w-20">
                      {t('catalog.meta.parts', { n: item.itemCount })}
                    </RowFact>
                    <RowFact icon="success" width="w-36">
                      {progress?.label ?? null}
                    </RowFact>
                  </>
                }
                state={
                  item.sequential ? (
                    <Pill icon="lock">{t('catalog.flag.sequential')}</Pill>
                  ) : undefined
                }
              />
            );
          })}
        </CatalogResults>
      </div>
    </Page>
  );
}
