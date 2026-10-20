'use client';

import type { ReactElement } from 'react';
import Link from 'next/link';
import { t } from '@devops-platform/copy';
import { Button, Empty, EmptyArt, ErrorBlock, Pager, RowsSkeleton } from '@devops-platform/ds';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { useProblemControls } from './use-problem-controls';
import { buildProblemListInput } from './problem-query';
import { ProblemsToolbar } from './problems-toolbar';
import { ProblemsBoard } from './problems-board';
import { ALL_GAMES } from './problem-game';

/**
 * `/problems`, phần sống theo URL: thanh lọc + bảng đề.
 *
 * ⛔ `useQuery` + tự giữ con trỏ, KHÔNG `useInfiniteQuery`. `@trpc/react-query` tự chèn
 * khoá `direction` vào input của mỗi lượt gọi infinite, mọi input danh sách của repo
 * khai `.strict()`, nên trình duyệt nhận `400 unrecognized_keys` và trang trắng. Ở đây
 * `direction` là khoá THẬT của hợp đồng, nên va chạm còn tệ hơn: nó ghi đè chiều sắp
 * người dùng chọn. Xem `lib/trpc-react.tsx`.
 */
export function ProblemsClient(): ReactElement {
  const controls = useProblemControls();
  const query = api.problems.list.useQuery(buildProblemListInput(controls.query, controls.cursor));
  const items = query.data?.items ?? [];
  const hasNext = query.data?.nextCursor != null;

  return (
    <div className="flex flex-col gap-6 pb-14">
      <ProblemsToolbar controls={controls} />

      {query.isPending ? <RowsSkeleton rows={8} label={t('problem.oj.loading')} /> : null}

      {query.isError ? (
        <ErrorBlock
          title={t('problem.oj.error-title')}
          retryLabel={t('common.action.retry')}
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        >
          {describeTrpcError(query.error)}
        </ErrorBlock>
      ) : null}

      {query.isSuccess && items.length === 0 ? (
        <Empty
          art={<EmptyArt kind={controls.hasActiveFilter ? 'search' : 'nothing'} width={110} />}
          title={t(controls.hasActiveFilter ? 'problem.oj.empty.filter-title' : 'problem.oj.empty.blank-title')}
          action={
            controls.hasActiveFilter ? (
              <Button variant="secondary" icon="close" onClick={controls.clearFilters}>
                {t('problem.oj.filter.clear')}
              </Button>
            ) : (
              <Button asChild variant="primary" icon="gamepad">
                <Link href="/games">{t('problem.oj.empty.blank-action')}</Link>
              </Button>
            )
          }
        >
          {t(controls.hasActiveFilter ? 'problem.oj.empty.filter-body' : 'problem.oj.empty.blank-body')}
        </Empty>
      ) : null}

      {query.isSuccess && items.length > 0 ? (
        <div>
          <ProblemsBoard items={items} showGame={controls.query.game === ALL_GAMES} />
          {/*
            Câu tự đính chính phạm vi: bộ lọc + thứ tự chạy trên TOÀN BỘ kho ở máy chủ, nhưng
            người dùng chỉ nhìn thấy một trang.
          */}
          <Pager
            status={t(hasNext ? 'problem.oj.scope-more' : 'problem.oj.scope-last', { shown: items.length, page: controls.page })}
            previousLabel={t('common.pager.prev')}
            nextLabel={t('common.pager.next')}
            firstLabel={t('common.pager.first')}
            onFirst={controls.page > 1 ? controls.goFirst : undefined}
            onPrevious={controls.page > 1 ? controls.goPrevious : undefined}
            onNext={hasNext ? () => controls.goNext(query.data.nextCursor) : undefined}
            loading={query.isFetching}
          />
        </div>
      ) : null}
    </div>
  );
}
