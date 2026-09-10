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
import { catalogErrorTitle, catalogLead, catalogTitle, tierLabel } from '../../components/catalog/catalog-labels';
import type { CatalogMetaItem } from '../../components/catalog/catalog-grid';
import { buildCatalogListInput } from '../../components/catalog/catalog-input';
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

type LessonRow = inferRouterOutputs<AppRouter>['lessons']['list']['items'][number];

const SORT_OPTIONS: readonly SortOption<LessonRow>[] = [
  { key: 'title', label: t('catalog.sort.title'), compare: compareTitle },
  { key: 'difficulty', label: t('catalog.sort.difficulty'), compare: compareDifficulty },
  { key: 'duration', label: t('catalog.sort.duration'), compare: compareMinutes },
  { key: 'steps', label: t('catalog.sort.steps'), compare: compareCount((item) => item.stepCount) },
];

/**
 * Trường mà ô tìm được phép soi.
 *
 * Chỉ những thứ NGƯỜI DÙNG NHÌN THẤY trên thẻ: tiêu đề, mô tả, và các nhãn năng
 * lực hiện dưới đáy. Tìm trúng một trường không hiện ra đâu cả thì kết quả trả
 * về đọc như một lỗi, vì người đọc không có cách nào thấy vì sao mục đó khớp.
 */
function lessonSearchFields(item: LessonRow): readonly (string | null)[] {
  return [item.title, item.description, ...item.capabilities];
}

/**
 * Ba ô thông tin của thẻ bài học: số bước, thời lượng, loại sandbox.
 *
 * Là một HÀM chứ không phải mảng dựng thẳng trong JSX vì `estimatedMinutes` có
 * thể `null`. Bỏ hẳn ô ấy là cách duy nhất đúng; một ô "chưa rõ" cũng chỉ là rác
 * chiếm chỗ.
 */
function lessonMeta(item: LessonRow): readonly CatalogMetaItem[] {
  const meta: CatalogMetaItem[] = [{ icon: 'steps', label: t('unit.step', { n: item.stepCount }) }];
  if (item.estimatedMinutes !== null) {
    meta.push({ icon: 'duration', label: t('catalog.meta.duration', { minutes: item.estimatedMinutes }) });
  }
  meta.push({ icon: 'sandbox', label: tierLabel(item.tier) });
  return meta;
}

/**
 * Trang danh sách `/lessons`.
 *
 * ## ⛔ `useQuery`, KHÔNG `useInfiniteQuery` — ràng buộc cứng, không phải phong cách
 *
 * `useInfiniteQuery` của `@trpc/react-query` nhét `direction` vào INPUT gửi lên
 * server. Đo trên cụm 2026-08-13, request thật của trang này:
 *
 *     GET /api/trpc/lessons.list?batch=1&input={"0":{"direction":"forward"}}  → 400
 *     [{"code":"unrecognized_keys","keys":["direction"], ...}]
 *
 * `listLessonsInput` là `.strict()`, nên nó từ chối, ĐÚNG như thiết kế. Cách sửa
 * SAI là thêm `direction` vào schema: server không đọc field đó, nên đó là nới
 * lỏng một cổng bảo mật để chứa một field vô nghĩa.
 *
 * ⚠ Bug này KHÔNG bị e2e mức API bắt: harness gọi thẳng
 * `lessons.list({limit:100})` và xanh 14/14, trong khi đường người dùng thật đỏ
 * 400 và trang trắng. Chỉ trình duyệt mới đi qua đúng đoạn mã sinh input. Phép
 * kiểm giữ lại điều này nằm ở `components/catalog/catalog-input.test.ts`.
 *
 * ## Ba tầng thu hẹp, và chúng KHÔNG cùng phạm vi
 *
 * | Tầng | Chạy ở | Phạm vi | Reset cursor |
 * |---|---|---|---|
 * | bộ lọc độ khó / sandbox | server | cả kho | có |
 * | ô tìm | client | trang đang tải | không |
 * | sắp xếp | client | trang đang tải | không |
 *
 * Lọc ở SERVER đóng nợ P2: lọc ở client trên một trang đã cắt sẽ cho ra những
 * trang vơi bất định, chọn "Nâng cao" có thể ra một trang trống trong khi kho
 * đầy bài nâng cao ở trang sau. Ô tìm thì ngược lại KHÔNG xuống server được, vì
 * `listLessonsInput` không có khoá nào cho từ khoá và `.strict()` sẽ trả 400.
 * `CatalogScopeNotes` nói ra chênh lệch đó thay vì để người dùng tự đoán.
 */
export function LessonsClient({ canAuthor }: { readonly canAuthor: boolean }): React.ReactElement {
  const controls = useCatalogControls();
  const query = api.lessons.list.useQuery(buildCatalogListInput(controls.filters, controls.cursor));

  const sortOption = findSortOption(SORT_OPTIONS, controls.sortKey);
  const loaded = query.data?.items ?? [];
  const items = useMemo(
    () => sortPage(searchPage(query.data?.items ?? [], controls.normalizedSearch, lessonSearchFields), sortOption),
    [query.data, controls.normalizedSearch, sortOption],
  );
  const hasNext = query.data?.nextCursor != null;

  return (
    <CatalogPage title={catalogTitle('lessons')} description={catalogLead('lessons')}>
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
        search={controls.search}
        onSearch={controls.setSearch}
        shown={query.isSuccess ? items.length : null}
        hasNext={hasNext}
        disabled={query.isPending}
      />

      {query.isPending && <CatalogGridSkeleton />}

      {query.isError && (
        <CatalogError
          title={catalogErrorTitle('lessons')}
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
