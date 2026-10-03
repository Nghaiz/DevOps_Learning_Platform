'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { err, t } from '@devops-platform/copy';
import { Button, EmptyState, ErrorState, Meter, Num, Skeleton } from '@devops-platform/ui';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { BoardSkeleton, RouteLine, WithNums, lineForTopic, numSlot, staggerStyle, type RouteStation } from '../kit';
import { buildPathItemViews, stationStateLabel } from '../../app/paths/[id]/path-view';
import { summarizePathProgress } from './path-progress';

/**
 * "Đang học": mỗi lộ trình học dở là một sơ đồ tuyến (design-brief §4.5).
 *
 * ⚠ `paths.mine` chỉ trả lộ trình ĐÃ BẮT ĐẦU và CHƯA XONG (`passedCount > 0 &&
 * passedCount < itemCount`), không có cursor và không có danh sách ga. Danh sách
 * ga (tên, trạng thái từng phần) đọc từ `paths.get` của TỪNG lộ trình; tập này
 * nhỏ (chỉ lộ trình đang dở) nên mỗi dòng một lượt đọc là chấp nhận được.
 *
 * Mọi con số TÍNH lúc đọc từ payload hiện tại (13.E mục 19), không giữ bản sao.
 */
export function LearningNow(): ReactElement {
  const paths = api.paths.mine.useQuery({});

  if (paths.isPending) {
    return <BoardSkeleton rows={2} label={t('me.learning.loading')} />;
  }

  if (paths.isError) {
    const entry = err('me.error.paths-load', { reason: describeTrpcError(paths.error) });
    return (
      <ErrorState
        title={entry.what}
        message={entry.next}
        onRetry={() => void paths.refetch()}
        retrying={paths.isFetching}
      />
    );
  }

  if (paths.data.items.length === 0) {
    return (
      <EmptyState
        title={t('me.learning.empty-title')}
        description={t('me.learning.empty-description')}
        action={
          <Button asChild variant="outline">
            <Link href="/paths">{t('me.learning.empty-action')}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ol className="border-y border-border">
      {paths.data.items.map((item, order) => (
        <PathRoute key={item.id} path={item} order={order} />
      ))}
    </ol>
  );
}

function PathRoute(props: {
  readonly order: number;
  readonly path: {
    readonly id: string;
    readonly title: string;
    readonly passedCount: number;
    readonly itemCount: number;
    readonly nextItemId: string | null;
  };
}): ReactElement {
  const { path, order } = props;
  const detail = api.paths.get.useQuery({ pathId: path.id });
  const views = detail.data ? buildPathItemViews(detail.data.items, detail.data.nextItemId) : null;
  const summary = summarizePathProgress({
    passedCount: path.passedCount,
    itemCount: path.itemCount,
    nextItemId: path.nextItemId,
    nextTitle: views?.find((view) => view.isNext)?.title ?? null,
  });
  const line = lineForTopic({ id: path.id });
  const tone = line === 'ink' ? 'default' : line;
  const stations: RouteStation[] =
    views?.map((view) => ({
      id: view.key,
      label: view.title,
      line: view.line,
      state: view.marker,
      ...(view.href === null ? {} : { href: view.href }),
    })) ?? [];

  return (
    <li className="stagger animate-rise border-b border-border py-7 last:border-b-0" style={staggerStyle(order)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <Link
          href={`/paths/${encodeURIComponent(path.id)}`}
          className="type-title underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {path.title}
        </Link>
        <p className="text-sm text-muted-foreground">
          {path.itemCount === 0 ? (
            summary.label
          ) : (
            <WithNums
              text={t('me.path.passed', { passed: numSlot(0), total: numSlot(1) })}
              nums={[
                <Num key="passed" tone={tone} className="text-lg">
                  {path.passedCount}
                </Num>,
                <Num key="total" className="text-lg">
                  {path.itemCount}
                </Num>,
              ]}
            />
          )}
        </p>
      </div>
      <div className="mt-5">
        {stations.length > 0 ? (
          <RouteLine
            stations={stations}
            label={t('me.learning.route-aria', { title: path.title })}
            stateLabel={stationStateLabel}
          />
        ) : detail.isPending ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          // Không đọc được danh sách ga: vẫn còn hai con số thật của `paths.mine`.
          <Meter value={summary.value} max={summary.max} segments={path.itemCount} label={summary.label} />
        )}
      </div>
      {summary.nextLabel !== null && <p className="mt-3 text-sm text-foreground">{summary.nextLabel}</p>}
    </li>
  );
}
