'use client';

import { useMemo } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { Badge, CursorPager } from '@devops-platform/ui';
import type { AppRouter } from '../../server/trpc/routers/app-router';
import { api } from '../../lib/trpc-react';
import { describeTrpcError, trpcErrorCode } from '../../lib/trpc';
import { CatalogPage, CatalogScopeNotes } from '../../components/catalog/catalog-page';
import { CatalogCard, CatalogGrid, CatalogGridSkeleton } from '../../components/catalog/catalog-grid';
import { CatalogToolbar } from '../../components/catalog/catalog-toolbar';
import { CatalogEmptyState } from '../../components/catalog/catalog-empty';
import { CatalogError } from '../../components/catalog/catalog-error';
import { buildCatalogListInput } from '../../components/catalog/catalog-input';
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
import { DIFFICULTY_LABEL } from '../../components/catalog/catalog-labels';

type LabRow = inferRouterOutputs<AppRouter>['labs']['list']['items'][number];

const SORT_OPTIONS: readonly SortOption<LabRow>[] = [
  { key: 'title', label: 'Tên A→Z', compare: compareTitle },
  { key: 'difficulty', label: 'Dễ đến khó', compare: compareDifficulty },
  { key: 'duration', label: 'Ngắn đến dài', compare: compareMinutes },
  { key: 'tasks', label: 'Ít nhiệm vụ đến nhiều', compare: compareCount((item) => item.taskCount) },
];

/**
 * Trang danh sách `/labs` (13.C) — cùng khuôn `lessons-client.tsx`, gồm cả ràng
 * buộc `useQuery` (không `useInfiniteQuery`) và lọc ở SERVER; lý lẽ đầy đủ nằm
 * ở bản gốc, không chép lại ở đây.
 *
 * Khác lessons ở một điểm đáng giữ: `labs.list` KHÔNG trả
 * `unsupportedCapabilities` cho từng mục (chỉ `labs.get` mới trả — đúng bất đối
 * xứng của `lessons.list`/`lessons.get`). Cảnh báo năng lực thật sự — thứ chặn
 * một lượt chạy TRƯỚC khi nó hỏng — nằm ở `/labs/[id]`, trước nút "Bắt đầu".
 * Trang này chỉ hiện các nhãn năng lực lab YÊU CẦU, không tự phán "hỗ trợ hay
 * không": phán đoán đó là logic phía server (`unsupportedCapabilities` trong
 * `server/lessons/catalog.ts`) và dựng lại nó ở đây sẽ là một nguồn sự thật thứ
 * hai, trôi khỏi bản gốc ở lần đầu tiên ai đó đổi danh sách năng lực đã đo.
 */
export function LabsClient({ canAuthor }: { readonly canAuthor: boolean }): React.ReactElement {
  const controls = useCatalogControls();
  const query = api.labs.list.useQuery(buildCatalogListInput(controls.filters, controls.cursor));

  const sortOption = findSortOption(SORT_OPTIONS, controls.sortKey);
  const items = useMemo(() => sortPage(query.data?.items ?? [], sortOption), [query.data, sortOption]);
  const hasNext = query.data?.nextCursor != null;

  return (
    <CatalogPage
      title="Lab"
      description="Mỗi lab giao một tập nhiệm vụ độc lập — làm theo thứ tự bất kỳ, tự chấm từng nhiệm vụ rồi nộp bài khi sẵn sàng."
    >
      <CatalogToolbar
        fields={['difficulty', 'tier']}
        filters={controls.filters}
        onDifficulty={controls.setDifficulty}
        onTier={controls.setTier}
        sortKey={controls.sortKey}
        sortOptions={SORT_OPTIONS}
        onSort={controls.setSortKey}
        disabled={query.isPending}
      />

      {query.isPending && <CatalogGridSkeleton />}

      {query.isError && (
        <CatalogError
          title="Không tải được danh sách lab"
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
                href={`/labs/${item.id}`}
                title={item.title}
                description={item.description}
                badge={item.leaderboard ? <Badge variant="default">Có xếp hạng</Badge> : undefined}
                meta={
                  <>
                    <Badge variant="secondary">{DIFFICULTY_LABEL[item.difficulty]}</Badge>
                    <Badge variant="secondary">{item.taskCount} nhiệm vụ</Badge>
                    <Badge variant="secondary">Đạt từ {item.passThresholdPercent}%</Badge>
                    {item.estimatedMinutes !== null && (
                      <Badge variant="secondary">~{item.estimatedMinutes} phút</Badge>
                    )}
                    {item.capabilities.map((capability) => (
                      <Badge key={capability} variant="outline">
                        {capability}
                      </Badge>
                    ))}
                  </>
                }
              />
            ))}
          </CatalogGrid>

          <CatalogScopeNotes
            kind="labs"
            page={controls.page}
            shown={items.length}
            hasNext={hasNext}
            sortKey={controls.sortKey}
          />

          <CursorPager
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
