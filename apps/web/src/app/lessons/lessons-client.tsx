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
import { TIER_LABEL } from '../../components/catalog/catalog-labels';
import type { CatalogMetaItem } from '../../components/catalog/catalog-grid';
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

type LessonRow = inferRouterOutputs<AppRouter>['lessons']['list']['items'][number];

const SORT_OPTIONS: readonly SortOption<LessonRow>[] = [
  { key: 'title', label: 'Tên A→Z', compare: compareTitle },
  { key: 'difficulty', label: 'Dễ đến khó', compare: compareDifficulty },
  { key: 'duration', label: 'Ngắn đến dài', compare: compareMinutes },
  { key: 'steps', label: 'Ít bước đến nhiều', compare: compareCount((item) => item.stepCount) },
];

/**
 * Ba ô thông tin của thẻ bài học: số bước, thời lượng, loại sandbox.
 *
 * Là một HÀM chứ không phải mảng dựng thẳng trong JSX vì `estimatedMinutes` có
 * thể `null` — nội suy `~null phút` vào chuỗi thì TypeScript không kêu (template
 * literal nuốt mọi thứ) và người dùng nhận đúng chữ đó trên màn hình. Bỏ hẳn ô
 * ấy là cách duy nhất đúng; một ô "chưa rõ" cũng chỉ là rác chiếm chỗ.
 */
function lessonMeta(item: LessonRow): readonly CatalogMetaItem[] {
  const meta: CatalogMetaItem[] = [{ icon: 'steps', label: `${item.stepCount} bước` }];
  if (item.estimatedMinutes !== null) {
    meta.push({ icon: 'duration', label: `~${item.estimatedMinutes} phút` });
  }
  meta.push({ icon: 'sandbox', label: TIER_LABEL[item.tier] });
  return meta;
}

/**
 * Trang danh sách `/lessons` (13.C).
 *
 * ## ⛔ `useQuery`, KHÔNG `useInfiniteQuery` — ràng buộc cứng, không phải phong cách
 *
 * `useInfiniteQuery` của `@trpc/react-query` nhét `direction` vào INPUT gửi lên
 * server. Đo trên cụm 2026-08-13, request thật của trang này:
 *
 *     GET /api/trpc/lessons.list?batch=1&input={"0":{"direction":"forward"}}  → 400
 *     [{"code":"unrecognized_keys","keys":["direction"], ...}]
 *
 * `listLessonsInput` là `.strict()` (luật 3), nên nó từ chối — ĐÚNG như thiết
 * kế. Hai thứ này không tương thích với nhau, và cách sửa SAI là thêm
 * `direction` vào schema: server không đọc field đó, nên đó là nới lỏng một
 * cổng bảo mật để chứa một field vô nghĩa.
 *
 * ⚠ Bug này KHÔNG bị e2e mức API bắt: harness gọi thẳng
 * `lessons.list({limit:100})` và xanh 14/14, trong khi đường người dùng thật đỏ
 * 400 và trang trắng. Chỉ trình duyệt mới đi qua đúng đoạn mã sinh input. Phép
 * kiểm giữ lại điều này nằm ở `components/catalog/catalog-input.test.ts` — nó
 * safeParse bằng chính schema đang chạy trong router.
 *
 * Phân trang vì vậy là **cursor thủ công**: `useCatalogControls` giữ ngăn xếp
 * cursor, `CursorPager` chỉ đi tới (không có "Trước" — cursor server không có
 * phép toán lùi).
 *
 * ## Lọc ở SERVER, không ở client (đóng nợ P2)
 *
 * Bản trước lọc độ khó bằng `items.filter(...)` sau khi đã nhận trang, kèm ghi
 * chú rằng khi catalog đủ lớn để phân trang thật thì bộ lọc phải đi xuống
 * server "cùng lúc". Đó chính là lúc này: D9 đã đưa phân trang xuống tầng nguồn
 * và `listLessonsInput` nhận `difficulty`/`tier`. Lọc ở client trên một trang
 * đã cắt sẽ cho ra những trang vơi bất định — chọn "Nâng cao" có thể ra một
 * trang trống trong khi kho đầy bài nâng cao ở trang sau.
 *
 * KHÔNG gửi `limit`: server đã có mặc định + trần (luật 4) và TRẢ VỀ `limit` nó
 * thực sự dùng. Nhập lại hằng số đó ở client sẽ phải import từ
 * `server/trpc/init` — kéo mã server vào bundle trình duyệt.
 */
export function LessonsClient({ canAuthor }: { readonly canAuthor: boolean }): React.ReactElement {
  const controls = useCatalogControls();
  const query = api.lessons.list.useQuery(buildCatalogListInput(controls.filters, controls.cursor));

  const sortOption = findSortOption(SORT_OPTIONS, controls.sortKey);
  const items = useMemo(
    () => sortPage(query.data?.items ?? [], sortOption),
    [query.data, sortOption],
  );
  const hasNext = query.data?.nextCursor != null;

  return (
    <CatalogPage
      title="Bài học"
      description="Mỗi bài mở một sandbox riêng. Tiến độ chỉ mình bạn thấy."
    >
      <CatalogToolbar
        kind="lessons"
        fields={['difficulty', 'tier']}
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
          title="Không tải được danh sách bài học"
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
          kind="lessons"
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
                href={`/lessons/${item.id}`}
                title={item.title}
                description={item.description}
                difficulty={item.difficulty}
                status={item.progress.status}
                meta={lessonMeta(item)}
                tags={item.capabilities}
              />
            ))}
          </CatalogGrid>

          <CatalogScopeNotes
            kind="lessons"
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
