'use client';

import { useEffect, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge, Button, CursorPager, Difficulty, EmptyState, ErrorState } from '@devops-platform/ui';
import type { inferRouterOutputs } from '@trpc/server';
import { t } from '@devops-platform/copy';
import { PROBLEM_DIFFICULTY_LABELS, type ProblemDifficulty } from '@devops-platform/games';
import type { AppRouter } from '../../../server/trpc/routers/app-router';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { Board, BoardRow, BoardSkeleton, PageContainer, PosterHeader, lineForTopic } from '../../../components/kit';
import { StateChip, StudioListBody, type StudioFilter } from '../../../components/author/studio';
import { GAME_NAME } from './game-plugin-view';
import { STATE_FILTERS, STATE_KEYS, filterLabelKey, joinTopicLabels, type StateFilter } from './problem-labels';

/**
 * Một hàng ĐÚNG NHƯ NÓ TỚI QUA DÂY. Suy từ router, nên hợp đồng đổi thì chỗ này
 * đi theo mà không ai phải nhớ (`problems.mine` trả DTO game-neutral).
 */
type AuthorProblemRow = inferRouterOutputs<AppRouter>['problems']['mine']['items'][number];

/** Độ khó của đề sang bậc của glyph 4 vạch. Nhãn chữ vẫn là nhãn của đề. */
const DIFFICULTY_LEVEL = {
  easy: 'basic',
  medium: 'intermediate',
  hard: 'advanced',
  expert: 'expert',
} as const satisfies Record<ProblemDifficulty, 'basic' | 'intermediate' | 'advanced' | 'expert'>;

/** Gõ xong mới hỏi máy chủ: mỗi phím một request là phí, và con trỏ trang phải về đầu. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * `/author/problems`: đề do người soạn viết.
 *
 * ## Lọc và tìm ở MÁY CHỦ, không đếm
 *
 * `problems.mine` phân trang bằng cursor, nên lọc ở client chỉ lọc trong PHẠM VI
 * MỘT TRANG: tab "Nháp" hiện 3 đề trong khi người soạn có 40. Trạng thái và ô tìm
 * đi thẳng vào `filter.state` / `filter.query`. Không có số đếm trên tab, vì máy
 * chủ không trả số đếm theo trạng thái và một con số đếm trên một trang là sai.
 *
 * `mine` chứ không `list`: `ProblemFilter` không có field chủ sở hữu; `mine` lọc
 * theo người gọi ở máy chủ (admin thấy mọi đề).
 *
 * ⛔ KHÔNG `useInfiniteQuery` (input `.strict()`, `direction` bị chèn, 400).
 */
export function ProblemListClient(): ReactElement {
  const [filter, setFilter] = useState<StateFilter>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const next = search.trim();
    if (next === query) return undefined;
    const timer = window.setTimeout(() => {
      setQuery(next);
      // Đổi điều kiện tìm phải VỀ ĐẦU: con trỏ keyset được cấp cho tập kết quả cũ.
      setCursor(null);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [search, query]);

  const listQuery = api.problems.mine.useQuery({
    ...(filter === 'all' && query === ''
      ? {}
      : {
          filter: {
            ...(filter === 'all' ? {} : { state: [filter] }),
            ...(query === '' ? {} : { query }),
          },
        }),
    ...(cursor === null ? {} : { cursor }),
  });

  const items = listQuery.data?.items ?? [];

  const changeFilter = (next: StateFilter): void => {
    setFilter(next);
    setCursor(null);
    setPage(1);
  };

  const filters: readonly StudioFilter<StateFilter>[] = STATE_FILTERS.map((value) => ({
    value,
    label: t(filterLabelKey(value)),
  }));

  return (
    <>
      <PosterHeader
        section="studio"
        kicker={t('author.problem.list.kicker')}
        title={t('author.problem.list.title')}
        lead={t('author.problem.list.lead')}
        aside={
          <Button asChild variant="ink" size="lg" iconLeft={<Plus aria-hidden className="size-4" />}>
            <Link href="/author/problems/new">{t('author.problem.list.new-cta')}</Link>
          </Button>
        }
      />
      <PageContainer>
        <div className="flex flex-col gap-6 py-10">
          <StudioListBody
            filterLabel={t('author.studio.list.filter-label')}
            filters={filters}
            filter={filter}
            onFilterChange={changeFilter}
            searchLabel={t('author.studio.list.search-label')}
            searchPlaceholder={t('author.studio.list.search-placeholder')}
            search={search}
            onSearchChange={setSearch}
          >
            {listQuery.isPending && <BoardSkeleton rows={4} label={t('author.studio.list.loading')} />}

            {listQuery.isError && (
              <ErrorState
                title={t('author.problem.list.error-title')}
                message={describeTrpcError(listQuery.error)}
                onRetry={() => void listQuery.refetch()}
                retrying={listQuery.isFetching}
              />
            )}

            {listQuery.isSuccess && (
              <div className="flex flex-col gap-6">
                {items.length === 0 ? (
                  <EmptyState
                    title={
                      query !== ''
                        ? t('author.studio.list.no-match', { query })
                        : filter === 'all'
                          ? t('author.problem.list.empty-title')
                          : t('author.problem.list.empty-filtered', { state: t(filterLabelKey(filter)) })
                    }
                    {...(query === ''
                      ? {
                          description: t('author.problem.list.empty-body'),
                          action: (
                            <Button asChild>
                              <Link href="/author/problems/new">{t('author.problem.list.empty-cta')}</Link>
                            </Button>
                          ),
                        }
                      : {})}
                  />
                ) : (
                  <Board label={t('author.problem.list.board-label')}>
                    {items.map((row, index) => (
                      <ProblemRow key={row.problem.code} row={row} index={index + 1} />
                    ))}
                  </Board>
                )}

                <CursorPager
                  page={page}
                  loading={listQuery.isFetching}
                  hasNext={(listQuery.data.nextCursor ?? null) !== null}
                  onNext={() => {
                    setCursor(listQuery.data.nextCursor ?? null);
                    setPage((value) => value + 1);
                  }}
                  onReset={() => {
                    setCursor(null);
                    setPage(1);
                  }}
                />
              </div>
            )}
          </StudioListBody>
        </div>
      </PageContainer>
    </>
  );
}

function ProblemRow(props: { readonly row: AuthorProblemRow; readonly index: number }): ReactElement {
  const { problem, stats } = props.row;
  const line = lineForTopic({ gameId: problem.gameId });

  return (
    <BoardRow
      href={`/author/problems/${encodeURIComponent(problem.code)}`}
      index={props.index}
      order={props.index - 1}
      line={line}
      title={problem.title}
      sub={
        <span>
          <code className="font-mono text-xs">{problem.code}</code>
          {/*
            `joinTopicLabels` chứ không tra thẳng bảng: `topics` là chuỗi mờ theo
            game, và một phép tra hụt đi qua `join` sẽ in chữ "undefined".
          */}
          {problem.topics.length > 0 &&
            t('author.problem.list.row-topics', { topics: joinTopicLabels(problem.topics) })}
          {' · '}
          {stats.attemptCount === 0
            ? t('author.problem.list.row-untried')
            : t('author.problem.list.row-solved', {
                solvers: stats.solverCount,
                attempts: stats.attemptCount,
              })}
        </span>
      }
      meta={
        <>
          <Badge variant="outline">{GAME_NAME[problem.gameId]}</Badge>
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <Difficulty level={DIFFICULTY_LEVEL[problem.difficulty]} />
            {PROBLEM_DIFFICULTY_LABELS[problem.difficulty]}
          </span>
        </>
      }
      state={<StateChip state={problem.state} label={t(STATE_KEYS[problem.state])} />}
    />
  );
}
