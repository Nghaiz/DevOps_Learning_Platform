'use client';

import type { ReactElement } from 'react';
import Link from 'next/link';
import { t } from '@devops-platform/copy';
import { Button, CursorPager, EmptyState, ErrorState } from '@devops-platform/ui';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { BoardSkeleton, PageContainer } from '../../../components/kit';
import { useProblemControls } from './use-problem-controls';
import { buildProblemListInput } from './problem-query';
import { ProblemsToolbar } from './problems-toolbar';
import { ProblemsBoard } from './problems-board';

/**
 * `/problems`, phần sống theo URL: thanh lọc + bảng tuyến bài tập.
 *
 * ⛔ `useQuery` + tự giữ con trỏ, KHÔNG `useInfiniteQuery`. `@trpc/react-query`
 * tự chèn một khoá `direction` vào input của mỗi lượt gọi infinite, mọi input
 * danh sách của repo khai `.strict()`, nên trình duyệt nhận `400
 * unrecognized_keys` và trang trắng, trong khi e2e mức API vẫn xanh vì nó gọi
 * thẳng procedure. Ở đây `direction` là khoá THẬT của hợp đồng, nên va chạm còn
 * tệ hơn: nó ghi đè chiều sắp người dùng chọn. Xem `lib/trpc-react.tsx`.
 */
export function ProblemsClient(): ReactElement {
  const controls = useProblemControls();
  const query = api.problems.list.useQuery(buildProblemListInput(controls.query, controls.cursor));
  const items = query.data?.items ?? [];
  const hasNext = query.data?.nextCursor != null;

  return (
    <PageContainer className="py-10 md:py-14">
      <ProblemsToolbar controls={controls} />

      {query.isPending && <BoardSkeleton rows={8} label={t('problem.oj.loading')} />}

      {query.isError && (
        <ErrorState
          title={t('problem.oj.error-title')}
          message={describeTrpcError(query.error)}
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
          className="mt-8"
        />
      )}

      {query.isSuccess && items.length === 0 && (
        <EmptyState
          className="mt-8"
          title={t(
            controls.hasActiveFilter ? 'problem.oj.empty.filter-title' : 'problem.oj.empty.blank-title',
          )}
          description={t(
            controls.hasActiveFilter ? 'problem.oj.empty.filter-body' : 'problem.oj.empty.blank-body',
          )}
          action={
            controls.hasActiveFilter ? (
              <Button variant="outline" onClick={controls.clearFilters}>
                {t('problem.oj.filter.clear')}
              </Button>
            ) : (
              <Button asChild variant="primary">
                <Link href="/games/k8s">{t('problem.oj.empty.blank-action')}</Link>
              </Button>
            )
          }
        />
      )}

      {query.isSuccess && items.length > 0 && (
        <>
          <ProblemsBoard items={items} />
          <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/*
              Câu tự đính chính phạm vi: bộ lọc + thứ tự chạy trên TOÀN BỘ kho ở
              máy chủ, nhưng người dùng chỉ nhìn thấy một trang. Không nói ra thì
              "bài khó nhất" đọc thành "bài khó nhất trong 25 dòng này".
            */}
            <p className="font-mono text-xs text-muted-foreground">
              {t(hasNext ? 'problem.oj.scope-more' : 'problem.oj.scope-last', {
                shown: items.length,
                page: controls.page,
              })}
            </p>
            <CursorPager
              hasNext={hasNext}
              page={controls.page}
              loading={query.isFetching}
              onNext={() => {
                controls.goNext(query.data.nextCursor);
              }}
              onReset={controls.goFirst}
            />
          </div>
        </>
      )}
    </PageContainer>
  );
}
