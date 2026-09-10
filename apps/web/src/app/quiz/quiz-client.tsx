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

type QuizRow = inferRouterOutputs<AppRouter>['quiz']['list']['items'][number];

const SORT_OPTIONS: readonly SortOption<QuizRow>[] = [
  { key: 'title', label: t('catalog.sort.title'), compare: compareTitle },
  {
    key: 'questions',
    label: t('catalog.sort.questions'),
    compare: compareCount((item) => item.questionCount),
  },
];

/**
 * Ô tìm soi tiêu đề và mô tả của BỘ câu hỏi, không soi câu hỏi bên trong.
 *
 * Đó không phải một giới hạn kỹ thuật mà là một ranh giới cố ý: `quiz.list` chỉ
 * trả `QuizSummary`, không câu hỏi, không đáp án. Kéo nội dung câu hỏi xuống
 * client để tìm được sẽ phá đúng ranh giới mà server đang giữ.
 */
function quizSearchFields(item: QuizRow): readonly (string | null)[] {
  return [item.title, item.description];
}

/**
 * Trang danh sách `/quiz`.
 *
 * Cùng khuôn `paths-client.tsx`: `quiz.list` nhận đúng `listInputSchema`
 * (`limit` + `cursor`) và `.strict()` từ chối mọi field lọc, nên trang này chỉ
 * có ô tìm và ô sắp xếp. `nextCursor` là cursor THẬT (keyset theo `id` qua
 * `listPublishedQuizzesPage`), không phải một `null` cố định.
 *
 * ⛔ Danh sách chỉ có `QuizSummary`. Ranh giới đó do server giữ (`quiz.get` khai
 * tường minh `QuizForLearner`; `quiz.list` bỏ cả `state`), và trang này không
 * được đi vòng qua nó bằng một lời gọi khác.
 */
export function QuizClient({ canAuthor }: { readonly canAuthor: boolean }): React.ReactElement {
  const controls = useCatalogControls();
  const query = api.quiz.list.useQuery(buildCatalogListInput(controls.filters, controls.cursor));

  const sortOption = findSortOption(SORT_OPTIONS, controls.sortKey);
  const loaded = query.data?.items ?? [];
  const items = useMemo(
    () => sortPage(searchPage(query.data?.items ?? [], controls.normalizedSearch, quizSearchFields), sortOption),
    [query.data, controls.normalizedSearch, sortOption],
  );
  const hasNext = query.data?.nextCursor != null;

  return (
    <CatalogPage title={catalogTitle('quiz')} description={catalogLead('quiz')}>
      <CatalogToolbar
        kind="quiz"
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
          title={catalogErrorTitle('quiz')}
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
          kind="quiz"
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
                href={`/quiz/${item.id}`}
                title={item.title}
                description={item.description}
                meta={[
                  { icon: 'questions', label: t('catalog.meta.questions', { n: item.questionCount }) },
                  {
                    icon: 'threshold',
                    label: t('catalog.meta.threshold', { percent: item.passThresholdPercent }),
                  },
                ]}
              />
            ))}
          </CatalogGrid>

          <CatalogScopeNotes
            kind="quiz"
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
