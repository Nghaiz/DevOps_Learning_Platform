'use client';

import { useState, type ReactElement } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CursorPager,
  EmptyState,
  ErrorState,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@devops-platform/ui';
import { t } from '@devops-platform/copy';
import {
  PROBLEM_DIFFICULTY_LABELS,
  PROBLEM_TOPIC_LABELS,
  type ProblemWithStats,
} from '@devops-platform/games';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { DIFFICULTY_BADGE, STATE_BADGE, STATE_FILTERS, STATE_KEYS, filterLabelKey, type StateFilter } from './problem-labels';

/**
 * `/author/problems` — bài OJ của tôi.
 *
 * ## `problems.mine`, KHÔNG phải `problems.list`
 *
 * `ProblemFilter` trong hợp đồng không có field chủ sở hữu, nên "bài của tôi"
 * không diễn đạt được qua `list` — và lane D cố ý không thêm field vào hợp đồng
 * của lead để lách chuyện đó. `mine` lọc theo người gọi ở máy chủ (admin thấy
 * mọi bài, cùng luật `assertContentOwner`).
 *
 * ## Lọc ở MÁY CHỦ, không lọc ở client
 *
 * Khác trang `/author` cũ, thứ nhận cả danh sách trong một lượt và lọc tại chỗ.
 * Ở đây có phân trang cursor thật, nên lọc ở client sẽ lọc trong PHẠM VI MỘT
 * TRANG — tab "Nháp" hiện 3 bài trong khi người soạn có 40, và không có gì nói
 * ra điều đó.
 *
 * ⛔ KHÔNG `useInfiniteQuery`: `@trpc/react-query` tự chèn `direction` vào input,
 * mọi input schema của dự án là `.strict()`, và hậu quả là request thật 400
 * trong khi test ở tầng API vẫn xanh.
 *
 * ## Hai bảng nhãn CÒN LẠI ngoài `packages/copy`, và đó không phải sót
 *
 * `PROBLEM_DIFFICULTY_LABELS` và `PROBLEM_TOPIC_LABELS` tới từ
 * `packages/games`, ngoài bảng sở hữu của lane này. Chúng là chữ người dùng
 * đọc và về lâu dài thuộc về bản đồ, nhưng chuyển chúng là sửa một gói khác
 * cộng mọi nơi gọi của nó, nên việc đó được BÁO chứ không tự làm ở đây.
 */
export function ProblemListClient(): ReactElement {
  const [filter, setFilter] = useState<StateFilter>('all');
  const [cursor, setCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const query = api.problems.mine.useQuery({
    ...(filter === 'all' ? {} : { filter: { state: [filter] } }),
    ...(cursor === null ? {} : { cursor }),
  });

  const items = query.data?.items ?? [];

  const changeFilter = (next: StateFilter): void => {
    // Đổi bộ lọc phải VỀ ĐẦU: con trỏ keyset được cấp cho tập kết quả cũ, và
    // dùng lại nó trên tập mới cho ra một trang bắt đầu từ giữa hư không.
    setFilter(next);
    setCursor(null);
    setPage(1);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('author.problem.list.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('author.problem.list.lead')}</p>
        </div>
        <Button asChild>
          <Link href="/author/problems/new">{t('author.problem.list.new-cta')}</Link>
        </Button>
      </header>

      {query.isPending && (
        <div className="flex flex-col gap-3" aria-hidden>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-24 w-full" />
          ))}
        </div>
      )}

      {query.isError && (
        <ErrorState
          title={t('author.problem.list.error-title')}
          message={describeTrpcError(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}

      {query.isSuccess && (
        <Tabs
          value={filter}
          onValueChange={(value) => {
            changeFilter(value as StateFilter);
          }}
        >
          <TabsList>
            {STATE_FILTERS.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(filterLabelKey(value))}
              </TabsTrigger>
            ))}
          </TabsList>
          {/*
            Danh sách PHẢI nằm trong `TabsContent`. Radix đặt `aria-controls` lên
            mọi trigger; không có panel nào thì trigger đang active trỏ vào hư
            không và axe báo mức critical `aria-valid-attr-value` — đúng lỗi
            `/author` đã trả giá ngày 2026-09-07.
          */}
          <TabsContent value={filter}>
            <div className="flex flex-col gap-4 pt-2">
              {items.length === 0 ? (
                <EmptyState
                  title={
                    filter === 'all'
                      ? t('author.problem.list.empty-title')
                      : t('author.problem.list.empty-filtered', { state: t(filterLabelKey(filter)) })
                  }
                  description={t('author.problem.list.empty-body')}
                  action={
                    <Button asChild>
                      <Link href="/author/problems/new">{t('author.problem.list.empty-cta')}</Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  {items.map((row) => (
                    <li key={row.problem.code}>
                      <ProblemRow row={row} />
                    </li>
                  ))}
                </ul>
              )}

              <CursorPager
                page={page}
                loading={query.isFetching}
                hasNext={(query.data?.nextCursor ?? null) !== null}
                onNext={() => {
                  setCursor(query.data?.nextCursor ?? null);
                  setPage((value) => value + 1);
                }}
                onReset={() => {
                  setCursor(null);
                  setPage(1);
                }}
              />
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ProblemRow({ row }: { readonly row: ProblemWithStats }): ReactElement {
  const { problem, stats } = row;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/author/problems/${encodeURIComponent(problem.code)}`}
              className="text-base font-medium text-foreground underline-offset-4 hover:underline"
            >
              {problem.title}
            </Link>
            <Badge variant={STATE_BADGE[problem.state]}>{t(STATE_KEYS[problem.state])}</Badge>
            <Badge variant={DIFFICULTY_BADGE[problem.difficulty]}>
              {PROBLEM_DIFFICULTY_LABELS[problem.difficulty]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            <code className="font-mono">{problem.code}</code>
            {problem.topics.length > 0 &&
              t('author.problem.list.row-topics', {
                topics: problem.topics.map((topic) => PROBLEM_TOPIC_LABELS[topic]).join(', '),
              })}
          </p>
          <p className="text-xs text-muted-foreground">
            {stats.attemptCount === 0
              ? t('author.problem.list.row-untried')
              : t('author.problem.list.row-solved', { solvers: stats.solverCount, attempts: stats.attemptCount })}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/author/problems/${encodeURIComponent(problem.code)}`}>{t('common.action.open')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
