'use client';

import type { ReactElement } from 'react';
import Link from 'next/link';
import { t } from '@devops-platform/copy';
import { Button, CursorPager, EmptyState, ErrorState, Skeleton } from '@devops-platform/ui';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { CatalogNote, CatalogPage } from '../../../components/catalog/catalog-page';
import { useProblemControls } from './use-problem-controls';
import { buildProblemListInput } from './problem-query';
import { ProblemsToolbar } from './problems-toolbar';
import { ProblemsTable } from './problems-table';

/**
 * `/problems` — danh sách bài tập kiểu OJ.
 *
 * ⛔ `useQuery` + tự giữ con trỏ, KHÔNG `useInfiniteQuery`. Lý do đã có giá:
 * `@trpc/react-query` tự chèn một khoá `direction` vào input của mỗi lượt gọi
 * infinite, mọi input danh sách của repo khai `.strict()`, nên trình duyệt nhận
 * `400 unrecognized_keys` và trang trắng — trong khi e2e mức API vẫn xanh vì nó
 * gọi thẳng procedure. Ở đây `direction` là khoá THẬT của hợp đồng, nên va chạm
 * còn tệ hơn: nó sẽ ghi đè chiều sắp xếp người dùng chọn. Xem `lib/trpc-react.tsx`.
 */
export function ProblemsClient(): ReactElement {
  const controls = useProblemControls();
  const query = api.problems.list.useQuery(buildProblemListInput(controls.query, controls.cursor));
  const items = query.data?.items ?? [];
  const hasNext = query.data?.nextCursor != null;

  return (
    <CatalogPage title={t('catalog.title.problems')} description={t('catalog.lead.problems')}>
      <ProblemsToolbar controls={controls} />

      {query.isPending && <ProblemsTableSkeleton />}

      {query.isError && (
        <ErrorState
          title={t('catalog.error-title.problems')}
          message={describeTrpcError(query.error)}
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      )}

      {query.isSuccess && items.length === 0 && (
        <EmptyState
          title={t(
            controls.hasActiveFilter
              ? 'catalog.problems.empty-filter-title'
              : 'catalog.problems.empty-blank-title',
          )}
          description={t(
            controls.hasActiveFilter
              ? 'catalog.problems.empty-filter-body'
              : 'catalog.problems.empty-blank-body',
          )}
          action={
            controls.hasActiveFilter ? (
              <Button variant="outline" size="sm" onClick={controls.clearFilters}>
                {t('catalog.action.clear-filter')}
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/games/k8s">{t('catalog.problems.empty-cta')}</Link>
              </Button>
            )
          }
        />
      )}

      {query.isSuccess && items.length > 0 && (
        <>
          <ProblemsTable items={items} />
          {/*
            Câu tự đính chính phạm vi: bộ lọc + thứ tự chạy trên TOÀN BỘ tập bài
            ở máy chủ, nhưng người dùng chỉ nhìn thấy một trang. Không nói ra thì
            "bài khó nhất" đọc thành "bài khó nhất trong 25 dòng này".
          */}
          <CatalogNote>
            {t(hasNext ? 'catalog.problems.scope-more' : 'catalog.problems.scope-last', {
              shown: items.length,
              page: controls.page,
            })}
          </CatalogNote>
          <CursorPager
            hasNext={hasNext}
            page={controls.page}
            loading={query.isFetching}
            onNext={() => {
              controls.goNext(query.data.nextCursor);
            }}
            onReset={controls.goFirst}
          />
        </>
      )}
    </CatalogPage>
  );
}

/**
 * Khung xương lúc chờ.
 *
 * Đủ chín cột và năm hàng chứ không phải một khối xám: bảng thật cao bao nhiêu
 * thì khung xương cao bấy nhiêu, nếu không thì nội dung nhảy một đoạn lúc dữ
 * liệu về — và cú nhảy đó rơi đúng vào lúc người dùng vừa định bấm.
 */
function ProblemsTableSkeleton(): ReactElement {
  return (
    <div
      className="flex flex-col gap-2"
      aria-busy="true"
      aria-live="polite"
      aria-label={t('problem.problems-client-dang-tai-danh-sach-bai')}
    >
      {Array.from({ length: 5 }, (_, row) => (
        <div key={row} className="flex gap-3">
          {Array.from({ length: 9 }, (_, column) => (
            <Skeleton key={column} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
