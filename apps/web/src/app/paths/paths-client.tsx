'use client';

import type { inferRouterOutputs } from '@trpc/server';
import { t } from '@devops-platform/copy';
import type { AppRouter } from '../../server/trpc/routers/app-router';
import { api } from '../../lib/trpc-react';
import { BoardMeta, BoardRow, PageContainer, RouteLine, lineForTopic, type RouteStation } from '../../components/kit';
import { CatalogPoster } from '../../components/catalog/catalog-poster';
import { CatalogToolbar } from '../../components/catalog/catalog-toolbar';
import { CatalogResults } from '../../components/catalog/catalog-results';
import { SequentialFlag } from '../../components/catalog/catalog-row';
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
import { buildPathItemViews, stationStateLabel, summarizePathProgress } from './[id]/path-view';

type PathRow = inferRouterOutputs<AppRouter>['paths']['list']['items'][number];
type PathDetail = inferRouterOutputs<AppRouter>['paths']['get'];

const SORT_OPTIONS: readonly SortOption<PathRow>[] = [
  { key: 'title', label: t('catalog.sort.title'), compare: compareTitle },
  { key: 'items', label: t('catalog.sort.parts'), compare: compareCount((item) => item.itemCount) },
];

function pathSearchFields(item: PathRow): readonly (string | null)[] {
  return [item.title, item.description];
}

function stationsOf(detail: PathDetail): RouteStation[] {
  return buildPathItemViews(detail.items, detail.nextItemId).map((view) => ({
    id: view.key,
    label: view.title,
    line: view.line,
    state: view.marker,
  }));
}

/**
 * Trang danh sách `/paths`: mỗi lộ trình là một dòng, và dưới tên là sơ đồ tuyến
 * của nó, ga tô theo chủ đề và theo tiến độ của chính người xem.
 *
 * ## Sơ đồ tuyến đọc `paths.get` cho TỪNG lộ trình đã tải
 *
 * `paths.list` chỉ trả `itemCount`, không trả mắt xích. Máy chủ của lane khác,
 * nên trang gọi `paths.get` cho mỗi lộ trình đã tải (một `useQueries`, gộp vào
 * một request nhờ `httpBatchLink`). Lộ trình nào chưa về chi tiết thì dòng vẫn
 * hiện, chỉ chưa có sơ đồ.
 *
 * Sơ đồ nằm TRONG liên kết của dòng nên nó `aria-hidden`: tên liên kết đã có tên
 * lộ trình, và tiến độ đi bằng chữ ở khe thông tin ("Đã đạt 2/5 phần"). Ga KHÔNG
 * là liên kết: mở một phần phải đi qua cổng `paths.openItem` ở trang chi tiết.
 *
 * Không có bộ lọc: `paths.list` nhận đúng cursor, `.strict()` từ chối mọi field
 * lọc.
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
    <>
      <CatalogPoster kind="paths" count={count} />
      <PageContainer className="py-10 md:py-12">
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
        <div className="mt-8">
          <CatalogResults
            kind="paths"
            pages={pages}
            shown={items.length}
            controls={controls}
            canAuthor={canAuthor}
            onRetry={(index) => void results[index]?.refetch()}
            isFetching={(index) => results[index]?.isFetching ?? false}
          >
            {items.map((item, index) => {
              const detail = detailById.get(item.id);
              const progress = detail === undefined ? null : summarizePathProgress(detail);
              const stations = detail === undefined ? [] : stationsOf(detail);
              return (
                <BoardRow
                  key={item.id}
                  href={`/paths/${item.id}`}
                  index={index + 1}
                  order={index}
                  line={lineForTopic({ id: item.id })}
                  lineState={progress?.finished ? 'done' : 'todo'}
                  title={item.title}
                  sub={
                    <>
                      {item.description}
                      {stations.length > 0 && (
                        <span aria-hidden="true" className="mt-4 block">
                          <RouteLine
                            orientation="horizontal"
                            stations={stations}
                            label={t('catalog.path.stations')}
                            stateLabel={stationStateLabel}
                          />
                        </span>
                      )}
                    </>
                  }
                  meta={
                    <>
                      <BoardMeta>{t('catalog.meta.parts', { n: item.itemCount })}</BoardMeta>
                      {progress !== null && <BoardMeta>{progress.label}</BoardMeta>}
                    </>
                  }
                  state={item.sequential ? <SequentialFlag /> : undefined}
                />
              );
            })}
          </CatalogResults>
        </div>
      </PageContainer>
    </>
  );
}
