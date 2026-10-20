'use client';

import { useEffect, useState, type ReactElement } from 'react';
import Link from 'next/link';
import type { inferRouterOutputs } from '@trpc/server';
import { t } from '@devops-platform/copy';
import {
  Button,
  Empty,
  EmptyArt,
  ErrorBlock,
  Page,
  PageHeader,
  Pager,
  Row,
  RowList,
  RowsSkeleton,
  TopicGlyph,
} from '@devops-platform/ds';
import type { AppRouter } from '../../../server/trpc/routers/app-router';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { topicLook } from '../../../lib/topic-look';
import { StateChip, StudioListBody, type StudioFilter } from '../../../components/author/studio';
import { ProblemDifficultyMark } from '../../(session)/problems/problem-badges';
import { GAME_NAME } from './game-plugin-view';
import { STATE_FILTERS, STATE_KEYS, filterLabelKey, joinTopicLabels, type StateFilter } from './problem-labels';

/**
 * Một hàng ĐÚNG NHƯ NÓ TỚI QUA DÂY. Suy từ router, nên hợp đồng đổi thì chỗ này đi
 * theo mà không ai phải nhớ (`problems.mine` trả DTO game-neutral).
 */
type AuthorProblemRow = inferRouterOutputs<AppRouter>['problems']['mine']['items'][number];

/** Gõ xong mới hỏi máy chủ: mỗi phím một request là phí, và con trỏ trang phải về đầu. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * `/author/problems`: đề do người soạn viết.
 *
 * ## Lọc và tìm ở MÁY CHỦ, không đếm
 *
 * `problems.mine` phân trang bằng cursor, nên lọc ở client chỉ lọc trong PHẠM VI MỘT
 * TRANG: tab "Nháp" hiện 3 đề trong khi người soạn có 40. Trạng thái và ô tìm đi thẳng
 * vào `filter.state` / `filter.query`. Không có số đếm trên tab, vì máy chủ không trả số
 * đếm theo trạng thái và một con số đếm trên một trang là sai.
 *
 * `mine` chứ không `list`: `ProblemFilter` không có field chủ sở hữu; `mine` lọc theo
 * người gọi ở máy chủ (admin thấy mọi đề).
 *
 * ⛔ KHÔNG `useInfiniteQuery` (input `.strict()`, `direction` bị chèn, 400).
 */
export function ProblemListClient(): ReactElement {
  const [filter, setFilter] = useState<StateFilter>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  // Ngăn xếp con trỏ: phần tử cuối là con trỏ của trang đang xem, `null` là trang đầu.
  const [cursors, setCursors] = useState<readonly (string | null)[]>([null]);
  const cursor = cursors[cursors.length - 1] ?? null;
  const page = cursors.length;

  useEffect(() => {
    const next = search.trim();
    if (next === query) return undefined;
    const timer = window.setTimeout(() => {
      setQuery(next);
      // Đổi điều kiện tìm phải VỀ ĐẦU: con trỏ keyset được cấp cho tập kết quả cũ.
      setCursors([null]);
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
  const nextCursor = listQuery.data?.nextCursor ?? null;

  const changeFilter = (next: StateFilter): void => {
    setFilter(next);
    setCursors([null]);
  };

  const filters: readonly StudioFilter<StateFilter>[] = STATE_FILTERS.map((value) => ({
    value,
    label: t(filterLabelKey(value)),
  }));

  return (
    <Page className="pb-16">
      <PageHeader
        title={t('author.problem.list.title')}
        lead={t('author.problem.list.lead')}
        actions={
          <Button asChild variant="primary" size="lg" icon="plus">
            <Link href="/author/problems/new">{t('author.problem.list.new-cta')}</Link>
          </Button>
        }
      />
      <StudioListBody
        filterLabel={t('author.studio.list.filter-label')}
        filters={filters}
        filter={filter}
        onFilterChange={changeFilter}
        searchLabel={t('author.studio.list.search-label')}
        searchPlaceholder={t('author.studio.problems.search-placeholder')}
        search={search}
        onSearchChange={setSearch}
      >
        {listQuery.isPending ? <RowsSkeleton rows={4} label={t('author.studio.list.loading')} /> : null}

        {listQuery.isError ? (
          <ErrorBlock
            className="mt-4"
            title={t('author.problem.list.error-title')}
            retryLabel={t('common.action.retry')}
            onRetry={() => void listQuery.refetch()}
            retrying={listQuery.isFetching}
          >
            {describeTrpcError(listQuery.error)}
          </ErrorBlock>
        ) : null}

        {listQuery.isSuccess ? (
          <div className="flex flex-col gap-6">
            {items.length === 0 ? (
              <Empty
                className="mt-4"
                art={<EmptyArt kind={query === '' ? 'nothing' : 'search'} />}
                title={
                  query !== ''
                    ? t('author.studio.list.no-match', { query })
                    : filter === 'all'
                      ? t('author.problem.list.empty-title')
                      : t('author.problem.list.empty-filtered', { state: t(filterLabelKey(filter)) })
                }
                {...(query === ''
                  ? {
                      action: (
                        <Button variant="primary" icon="plus" asChild>
                          <Link href="/author/problems/new">{t('author.problem.list.empty-cta')}</Link>
                        </Button>
                      ),
                    }
                  : {})}
              >
                {query === '' ? t('author.problem.list.empty-body') : undefined}
              </Empty>
            ) : (
              <RowList label={t('author.problem.list.board-label')}>
                {items.map((row) => (
                  <ProblemRow key={row.problem.code} row={row} />
                ))}
              </RowList>
            )}

            <Pager
              status={t('common.pager.page', { page })}
              previousLabel={t('common.pager.prev')}
              nextLabel={t('common.pager.next')}
              firstLabel={t('common.pager.first')}
              loading={listQuery.isFetching}
              onPrevious={page > 1 ? () => setCursors((stack) => stack.slice(0, -1)) : undefined}
              onFirst={page > 1 ? () => setCursors([null]) : undefined}
              onNext={nextCursor === null ? undefined : () => setCursors((stack) => [...stack, nextCursor])}
            />
          </div>
        ) : null}
      </StudioListBody>
    </Page>
  );
}

function ProblemRow(props: { readonly row: AuthorProblemRow }): ReactElement {
  const { problem, stats } = props.row;
  const look = topicLook({ gameId: problem.gameId });

  return (
    <Row
      topic={look.topic}
      leading={<TopicGlyph topic={look.topic} icon={look.icon} size={24} />}
      title={problem.title}
      link={<Link href={`/author/problems/${encodeURIComponent(problem.code)}`}>{problem.title}</Link>}
      description={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <code className="font-mono text-xs text-ink-3">{problem.code}</code>
          {/*
            `joinTopicLabels` chứ không tra thẳng bảng: `topics` là chuỗi mờ theo game, và
            một phép tra hụt đi qua `join` sẽ in chữ "undefined".
          */}
          {problem.topics.length > 0 ? <span>{joinTopicLabels(problem.topics, problem.gameId)}</span> : null}
          <span>
            {stats.attemptCount === 0
              ? t('author.problem.list.row-untried')
              : t('author.problem.list.row-solved', { solvers: stats.solverCount, attempts: stats.attemptCount })}
          </span>
        </span>
      }
      meta={
        <>
          <span className="w-24 text-xs text-ink-2">{GAME_NAME[problem.gameId]}</span>
          <span className="w-28">
            <ProblemDifficultyMark value={problem.difficulty} className="text-xs text-ink-2" />
          </span>
        </>
      }
      trailing={<StateChip state={problem.state} label={t(STATE_KEYS[problem.state])} />}
    />
  );
}
