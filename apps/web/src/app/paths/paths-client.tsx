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
  compareTitle,
  findSortOption,
  sortPage,
  type SortOption,
} from '../../components/catalog/catalog-sort';

type PathRow = inferRouterOutputs<AppRouter>['paths']['list']['items'][number];

const SORT_OPTIONS: readonly SortOption<PathRow>[] = [
  { key: 'title', label: 'Tên A→Z', compare: compareTitle },
  { key: 'items', label: 'Ít phần đến nhiều', compare: compareCount((item) => item.itemCount) },
];

/**
 * Trang danh sách `/paths` (13.C) — cùng khuôn `lessons-client.tsx` (`useQuery`,
 * không `useInfiniteQuery`; không gửi `limit`).
 *
 * ⚠ **Không có ô lọc nào ở đây, và đó là ràng buộc của API chứ không phải một
 * bước làm dở.** `paths.list` nhận đúng `listInputSchema` (`limit` + `cursor`)
 * và `.strict()` TỪ CHỐI `difficulty`/`tier` bằng 400 — thứ mà
 * `catalog-input.test.ts` khẳng định lại. Điều đó cũng hợp lý về dữ liệu: một
 * lộ trình gom nhiều bài có độ khó khác nhau, nên "độ khó của lộ trình" không
 * phải một field bị quên mà là một khái niệm chưa được định nghĩa.
 *
 * `CatalogToolbar` vì vậy chỉ còn phần sắp xếp — vẫn dùng chung component để
 * năm trang danh mục không trôi khỏi nhau về bố cục và về nhãn.
 */
export function PathsClient({ canAuthor }: { readonly canAuthor: boolean }): React.ReactElement {
  const controls = useCatalogControls();
  const query = api.paths.list.useQuery(buildCatalogListInput(controls.filters, controls.cursor));

  const sortOption = findSortOption(SORT_OPTIONS, controls.sortKey);
  const items = useMemo(() => sortPage(query.data?.items ?? [], sortOption), [query.data, sortOption]);
  const hasNext = query.data?.nextCursor != null;

  return (
    <CatalogPage
      title="Lộ trình"
      description="Nhiều bài gom theo thứ tự. Mở lộ trình để thấy phần nào đã mở khoá và phần nào còn chờ."
    >
      <CatalogToolbar
        fields={[]}
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
          title="Không tải được danh sách lộ trình"
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
                href={`/paths/${item.id}`}
                title={item.title}
                description={item.description}
                badge={item.sequential ? <Badge variant="outline">Học tuần tự</Badge> : undefined}
                meta={<Badge variant="secondary">{item.itemCount} phần</Badge>}
              />
            ))}
          </CatalogGrid>

          <CatalogScopeNotes
            kind="paths"
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
