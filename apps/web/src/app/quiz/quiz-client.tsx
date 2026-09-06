'use client';

import { useMemo } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../server/trpc/routers/app-router';
import { api } from '../../lib/trpc-react';
import { describeTrpcError, trpcErrorCode } from '../../lib/trpc';
import { CatalogPage, CatalogScopeNotes } from '../../components/catalog/catalog-page';
import { CatalogCard, CatalogGrid, CatalogGridSkeleton } from '../../components/catalog/catalog-grid';
import { CatalogToolbar } from '../../components/catalog/catalog-toolbar';
import { CatalogEmptyState } from '../../components/catalog/catalog-empty';
import { CatalogError } from '../../components/catalog/catalog-error';
import { CatalogPager } from '../../components/catalog/catalog-pager';
import { buildCatalogListInput } from '../../components/catalog/catalog-input';
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
  { key: 'title', label: 'Tên A→Z', compare: compareTitle },
  { key: 'questions', label: 'Ít câu đến nhiều', compare: compareCount((item) => item.questionCount) },
];

/**
 * Trang danh sách `/quiz` (13.C) — **màn hình mới**, trước phase này chỉ có
 * `/quiz/[id]`, tức không có đường nào từ giao diện đi tới một bộ câu hỏi ngoài
 * việc gõ tay id vào thanh địa chỉ.
 *
 * Cùng khuôn `paths-client.tsx`: `quiz.list` nhận đúng `listInputSchema`
 * (`limit` + `cursor`) và `.strict()` từ chối mọi field lọc, nên trang này chỉ
 * có phần sắp xếp. `nextCursor` là cursor THẬT (keyset theo `id` qua
 * `listPublishedQuizzesPage`), không phải một `null` cố định.
 *
 * ⛔ Danh sách chỉ có `QuizSummary` — không câu hỏi, không đáp án. Ranh giới đó
 * do server giữ (`quiz.get` khai tường minh `QuizForLearner`; `quiz.list` bỏ cả
 * `state`), và trang này không được đi vòng qua nó bằng một lời gọi khác.
 */
export function QuizClient({ canAuthor }: { readonly canAuthor: boolean }): React.ReactElement {
  const controls = useCatalogControls();
  const query = api.quiz.list.useQuery(buildCatalogListInput(controls.filters, controls.cursor));

  const sortOption = findSortOption(SORT_OPTIONS, controls.sortKey);
  const items = useMemo(() => sortPage(query.data?.items ?? [], sortOption), [query.data, sortOption]);
  const hasNext = query.data?.nextCursor != null;

  return (
    <CatalogPage
      title="Quiz"
      description="Bộ câu hỏi tự chấm. Nộp xong mới thấy điểm và giải thích — trong lúc làm bài, đáp án không nằm trong dữ liệu trình duyệt nhận."
    >
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
        shown={query.isSuccess ? items.length : null}
        hasNext={hasNext}
        disabled={query.isPending}
      />

      {query.isPending && <CatalogGridSkeleton />}

      {query.isError && (
        <CatalogError
          title="Không tải được danh sách quiz"
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
          onClearFilters={controls.clearFilters}
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
                  { icon: 'questions', label: `${item.questionCount} câu` },
                  { icon: 'threshold', label: `Đạt từ ${item.passThresholdPercent}%` },
                ]}
              />
            ))}
          </CatalogGrid>

          <CatalogScopeNotes
            kind="quiz"
            page={controls.page}
            shown={items.length}
            hasNext={hasNext}
            sortKey={controls.sortKey}
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
