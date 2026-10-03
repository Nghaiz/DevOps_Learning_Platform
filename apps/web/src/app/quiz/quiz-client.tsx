'use client';

import type { inferRouterOutputs } from '@trpc/server';
import { t } from '@devops-platform/copy';
import type { AppRouter } from '../../server/trpc/routers/app-router';
import { api } from '../../lib/trpc-react';
import { BoardMeta, BoardRow, PageContainer, lineForTopic } from '../../components/kit';
import { CatalogPoster } from '../../components/catalog/catalog-poster';
import { CatalogToolbar } from '../../components/catalog/catalog-toolbar';
import { CatalogResults } from '../../components/catalog/catalog-results';
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

type QuizRow = inferRouterOutputs<AppRouter>['quiz']['list']['items'][number];

const SORT_OPTIONS: readonly SortOption<QuizRow>[] = [
  { key: 'title', label: t('catalog.sort.title'), compare: compareTitle },
  {
    key: 'questions',
    label: t('catalog.sort.questions'),
    compare: compareCount((item) => item.questionCount),
  },
];

function quizSearchFields(item: QuizRow): readonly (string | null)[] {
  return [item.title, item.description];
}

/**
 * Trang danh sách `/quiz`. Cùng khuôn với `/lessons`, không có bộ lọc:
 * `quiz.list` nhận đúng cursor và `.strict()` từ chối mọi field lọc.
 *
 * Tuyến màu suy từ mã bộ câu hỏi (`dlp-quiz-docker-co-ban` ⇒ docker): payload
 * danh sách không có trường chủ đề.
 */
export function QuizClient({
  canAuthor,
  total,
}: {
  readonly canAuthor: boolean;
  readonly total: number | null;
}): React.ReactElement {
  const controls = useCatalogControls();
  const results = api.useQueries((q) =>
    controls.cursors.map((cursor) => q.quiz.list(buildCatalogListInput(controls.filters, cursor))),
  );
  const pages = combineCatalogPages(results);
  const loaded = pages.status === 'success' ? pages.items : [];
  const items = sortPage(
    searchPage(loaded, controls.normalizedSearch, quizSearchFields),
    findSortOption(SORT_OPTIONS, controls.sortKey),
  );
  const hasNext = pages.status === 'success' && pages.hasNext;

  return (
    <>
      <CatalogPoster kind="quiz" count={total} />
      <PageContainer className="py-10 md:py-12">
        <CatalogToolbar
          kind="quiz"
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
            kind: 'quiz',
            loaded: loaded.length,
            hasNext,
            searching: controls.hasSearch,
            sorting: controls.isSorted,
          })}
          disabled={pages.status === 'pending'}
        />
        <div className="mt-8">
          <CatalogResults
            kind="quiz"
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
                href={`/quiz/${item.id}`}
                index={index + 1}
                order={index}
                line={lineForTopic({ id: item.id })}
                title={item.title}
                sub={item.description ?? undefined}
                meta={
                  <>
                    <BoardMeta>{t('catalog.meta.questions', { n: item.questionCount })}</BoardMeta>
                    <BoardMeta>{t('catalog.meta.threshold', { percent: item.passThresholdPercent })}</BoardMeta>
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
