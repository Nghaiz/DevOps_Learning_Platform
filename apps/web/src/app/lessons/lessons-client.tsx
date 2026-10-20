'use client';

import type { inferRouterOutputs } from '@trpc/server';
import { t } from '@devops-platform/copy';
import type { AppRouter } from '../../server/trpc/routers/app-router';
import { api } from '../../lib/trpc-react';
import { Page } from '@devops-platform/ds';
import { CatalogHeader } from '../../components/catalog/catalog-header';
import { CatalogToolbar } from '../../components/catalog/catalog-toolbar';
import { CatalogResults } from '../../components/catalog/catalog-results';
import {
  CatalogRow,
  ProgressState,
  RowDifficulty,
  RowFact,
  contentTopic,
} from '../../components/catalog/catalog-row';
import { describeLoadedScope } from '../../components/catalog/catalog-labels';
import { buildCatalogListInput } from '../../components/catalog/catalog-input';
import { combineCatalogPages } from '../../components/catalog/catalog-pages';
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

/** Ô tìm chỉ soi thứ NGƯỜI DÙNG NHÌN THẤY trên dòng: tên, mô tả, nhãn năng lực. */
function lessonSearchFields(item: LessonRow): readonly (string | null)[] {
  return [item.title, item.description, ...item.capabilities];
}

/**
 * Trang danh sách `/lessons`.
 *
 * ## ⛔ `useQueries`, KHÔNG `useInfiniteQuery`, ràng buộc cứng
 *
 * `useInfiniteQuery` của `@trpc/react-query` nhét `direction` vào INPUT gửi lên,
 * và `listLessonsInput` là `.strict()`, nên trình duyệt nhận 400 và trang trắng
 * (đã xảy ra 2026-08-13). "Xem thêm" ở đây là một query cho MỖI cursor trong
 * ngăn xếp (`use-catalog-controls`), gộp bằng `combineCatalogPages`.
 *
 * ## Ba tầng thu hẹp, KHÔNG cùng phạm vi
 *
 * Chủ đề, độ khó, sandbox lọc ở SERVER trên cả kho (đổi là về lượt đầu). Ô tìm
 * và sắp xếp chạy ở client trên phần ĐÃ TẢI, vì máy chủ không nhận từ khoá lẫn
 * khoá sắp xếp theo tên. Một câu nhắc dưới ô tìm nói ra chênh lệch đó, và chỉ
 * khi danh sách còn phần chưa tải.
 */
export function LessonsClient({
  canAuthor,
  total,
}: {
  readonly canAuthor: boolean;
  readonly total: number | null;
}): React.ReactElement {
  const controls = useCatalogControls();
  const results = api.useQueries((q) =>
    controls.cursors.map((cursor) =>
      q.lessons.list(buildCatalogListInput(controls.filters, cursor)),
    ),
  );
  const pages = combineCatalogPages(results);
  const loaded = pages.status === 'success' ? pages.items : [];
  const items = sortPage(
    searchPage(loaded, controls.normalizedSearch, lessonSearchFields),
    findSortOption(SORT_OPTIONS, controls.sortKey),
  );
  const hasNext = pages.status === 'success' && pages.hasNext;

  return (
    <Page className="pb-14">
      <CatalogHeader kind="lessons" count={total} />
      <CatalogToolbar
        kind="lessons"
        fields={['topic', 'difficulty', 'tier']}
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
          kind: 'lessons',
          loaded: loaded.length,
          hasNext,
          searching: controls.hasSearch,
          sorting: controls.isSorted,
        })}
        disabled={pages.status === 'pending'}
      />
      <div className="pt-2">
        <CatalogResults
          kind="lessons"
          pages={pages}
          shown={items.length}
          controls={controls}
          canAuthor={canAuthor}
          onRetry={(index) => void results[index]?.refetch()}
          isFetching={(index) => results[index]?.isFetching ?? false}
        >
          {items.map((item) => (
            <CatalogRow
              key={item.id}
              href={`/lessons/${item.id}`}
              topic={contentTopic(item)}
              title={item.title}
              description={item.description}
              meta={
                <>
                  <RowDifficulty level={item.difficulty} />
                  <RowFact icon="stairs" width="w-20">
                    {t('unit.step', { n: item.stepCount })}
                  </RowFact>
                  <RowFact icon="clock" width="w-24">
                    {item.estimatedMinutes === null
                      ? null
                      : t('catalog.meta.duration', { minutes: item.estimatedMinutes })}
                  </RowFact>
                </>
              }
              state={<ProgressState status={item.progress.status} />}
            />
          ))}
        </CatalogResults>
      </div>
    </Page>
  );
}
