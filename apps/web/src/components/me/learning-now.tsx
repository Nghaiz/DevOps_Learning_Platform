'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  ProgressBar,
  Skeleton,
} from '@devops-platform/ui';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { summarizePathProgress } from './path-progress';

/**
 * "Đang học" — lộ trình còn dở, đọc từ `paths.mine`.
 *
 * ⚠ `paths.mine` KHÔNG trả mọi lộ trình của tôi: nó lọc `passedCount > 0 &&
 * passedCount < itemCount`, tức chỉ những lộ trình ĐÃ BẮT ĐẦU và CHƯA XONG.
 * Tiêu đề và trạng thái rỗng phải nói đúng tập đó — gọi nó là "lộ trình của
 * tôi" sẽ làm người vừa đăng ký (chưa đạt phần nào) tưởng hệ thống mất dữ liệu
 * của họ.
 *
 * Nó cũng KHÔNG có cursor (`noCursorListInputSchema`) — lọc diễn ra SAU khi DB
 * đã cắt `limit`, nên một keyset ở tầng SQL sẽ sinh những trang vơi bất định
 * (chú thích ở `server/trpc/init.ts`). Vì vậy không có `CursorPager` ở đây, và
 * đó là quyết định của server chứ không phải một thiếu sót của trang này.
 */
export function LearningNow(): ReactElement {
  const paths = api.paths.mine.useQuery({});

  return (
    <section aria-labelledby="dang-hoc" className="flex flex-col gap-3">
      <h2 id="dang-hoc" className="text-lg font-medium text-foreground">
        Lộ trình đang dở
      </h2>

      {paths.isPending && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {paths.isError && (
        <ErrorState
          title="Không tải được lộ trình đang dở"
          message={describeTrpcError(paths.error)}
          onRetry={() => void paths.refetch()}
          retrying={paths.isFetching}
        />
      )}

      {paths.isSuccess &&
        (paths.data.items.length === 0 ? (
          <EmptyState
            title="Chưa có lộ trình nào đang dở"
            description="Mục này chỉ hiện lộ trình bạn đã đạt ít nhất một phần và chưa đạt hết."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/paths">Xem lộ trình</Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {paths.data.items.map((item) => (
              <li key={item.id}>
                <PathCard
                  id={item.id}
                  title={item.title}
                  passedCount={item.passedCount}
                  itemCount={item.itemCount}
                  nextItemId={item.nextItemId}
                />
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

function PathCard(props: {
  readonly id: string;
  readonly title: string;
  readonly passedCount: number;
  readonly itemCount: number;
  readonly nextItemId: string | null;
}): ReactElement {
  // TÍNH lúc render từ payload của lượt đọc hiện tại — không `useState`, không
  // `useMemo` giữ một bản sao rồi khẳng định từ nó (13.E mục 19).
  const summary = summarizePathProgress({
    passedCount: props.passedCount,
    itemCount: props.itemCount,
    nextItemId: props.nextItemId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link
            href={`/paths/${props.id}`}
            className="rounded-md outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {props.title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ProgressBar value={summary.value} max={summary.max} label={summary.label} />
        {summary.nextLabel !== null && (
          <p className={summary.nextIsItemId ? 'font-mono text-xs text-muted-foreground' : 'text-xs text-muted-foreground'}>
            {summary.nextLabel}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
