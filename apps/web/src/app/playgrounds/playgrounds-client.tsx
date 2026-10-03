'use client';

import type { inferRouterOutputs } from '@trpc/server';
import { t } from '@devops-platform/copy';
import type { AppRouter } from '../../server/trpc/routers/app-router';
import { api } from '../../lib/trpc-react';
import { BoardMeta, BoardRow, PageContainer } from '../../components/kit';
import { CatalogPoster } from '../../components/catalog/catalog-poster';
import { CatalogToolbar } from '../../components/catalog/catalog-toolbar';
import { CatalogResults } from '../../components/catalog/catalog-results';
import { contentLine } from '../../components/catalog/catalog-row';
import { describeLoadedScope, tierLabel } from '../../components/catalog/catalog-labels';
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

type PlaygroundRow = inferRouterOutputs<AppRouter>['playgrounds']['list']['items'][number];

const SORT_OPTIONS: readonly SortOption<PlaygroundRow>[] = [
  { key: 'title', label: t('catalog.sort.title'), compare: compareTitle },
  { key: 'ttl', label: t('catalog.sort.ttl'), compare: compareCount((item) => item.ttlSeconds) },
];

function playgroundSearchFields(item: PlaygroundRow): readonly (string | null)[] {
  return [item.title, item.description, ...item.capabilities];
}

/**
 * Trang danh sách `/playgrounds`. Cùng khuôn với `/lessons`.
 *
 * ⚠ KHÔNG có hàng chip độ khó: `playgrounds.list` từ chối `difficulty`
 * (`PlaygroundSummary` không có độ khó, một máy trống không có bài để khó dễ).
 * Một chip ở đây sẽ là điều khiển nói dối.
 */
export function PlaygroundsClient({
  canAuthor,
  total,
}: {
  readonly canAuthor: boolean;
  readonly total: number | null;
}): React.ReactElement {
  const controls = useCatalogControls();
  const results = api.useQueries((q) =>
    controls.cursors.map((cursor) => q.playgrounds.list(buildCatalogListInput(controls.filters, cursor))),
  );
  const pages = combineCatalogPages(results);
  const loaded = pages.status === 'success' ? pages.items : [];
  const items = sortPage(
    searchPage(loaded, controls.normalizedSearch, playgroundSearchFields),
    findSortOption(SORT_OPTIONS, controls.sortKey),
  );
  const hasNext = pages.status === 'success' && pages.hasNext;

  return (
    <>
      <CatalogPoster kind="playgrounds" count={total} />
      <PageContainer className="py-10 md:py-12">
        <CatalogToolbar
          kind="playgrounds"
          fields={['topic', 'tier']}
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
            kind: 'playgrounds',
            loaded: loaded.length,
            hasNext,
            searching: controls.hasSearch,
            sorting: controls.isSorted,
          })}
          disabled={pages.status === 'pending'}
        />
        <div className="mt-8">
          <CatalogResults
            kind="playgrounds"
            pages={pages}
            shown={items.length}
            controls={controls}
            canAuthor={canAuthor}
            onRetry={(index) => void results[index]?.refetch()}
            isFetching={(index) => results[index]?.isFetching ?? false}
          >
            {items.map((item, index) => (
              <BoardRow
                key={item.id}
                href={`/playgrounds/${item.id}`}
                index={index + 1}
                order={index}
                line={contentLine(item)}
                title={item.title}
                sub={item.description ?? undefined}
                meta={
                  <>
                    <BoardMeta>{t('catalog.meta.ttl', { minutes: Math.round(item.ttlSeconds / 60) })}</BoardMeta>
                    <BoardMeta>{tierLabel(item.tier)}</BoardMeta>
                  </>
                }
              />
            ))}
          </CatalogResults>
        </div>
      </PageContainer>
    </>
  );
}
