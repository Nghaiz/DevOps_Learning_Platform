'use client';

import type { ReactElement } from 'react';
import Link from 'next/link';
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
    <CatalogPage
      title="Bài tập"
      description="Mỗi bài là một cluster hỏng hoặc một yêu cầu cần dựng. Không có phần giảng — bạn tự biết hoặc tự tra, rồi thao tác cho tới khi mọi mục tiêu xanh."
    >
      <ProblemsToolbar controls={controls} />

      {query.isPending && <ProblemsTableSkeleton />}

      {query.isError && (
        <ErrorState
          title="Không tải được danh sách bài"
          message={describeTrpcError(query.error)}
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      )}

      {query.isSuccess && items.length === 0 && (
        <EmptyState
          title={controls.hasActiveFilter ? 'Không bài nào khớp bộ lọc' : 'Chưa có bài tập nào được đăng'}
          description={
            controls.hasActiveFilter
              ? 'Nhiều tag phải khớp ĐỦ, còn nhiều chủ đề chỉ cần khớp một — thu hẹp tag trước khi bỏ chủ đề.'
              : 'Trong lúc chờ, các level của Kubernetes Game dạy đúng những thao tác mà bài tập ở đây sẽ hỏi.'
          }
          action={
            controls.hasActiveFilter ? (
              <Button variant="outline" size="sm" onClick={controls.clearFilters}>
                Xoá bộ lọc
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/games/k8s">Mở Kubernetes Game</Link>
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
            Đang xem {items.length} bài của trang {controls.page}
            {hasNext ? ' — còn trang sau.' : ' — đã hết danh sách.'}
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
    <div className="flex flex-col gap-2" aria-busy="true" aria-live="polite" aria-label="Đang tải danh sách bài">
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
