'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { err, t } from '@devops-platform/copy';
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
import { MeSection } from './me-section';
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
    <MeSection id="dang-hoc" title={t('me.learning.title')}>
      {paths.isPending && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {paths.isError && <PathsError error={paths.error} onRetry={paths.refetch} retrying={paths.isFetching} />}

      {paths.isSuccess &&
        (paths.data.items.length === 0 ? (
          <EmptyState
            title={t('me.learning.empty-title')}
            description={t('me.learning.empty-description')}
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/paths">{t('me.learning.empty-action')}</Link>
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
    </MeSection>
  );
}

/**
 * Hai nửa của `ErrorEntry` vào hai khe RIÊNG của `ErrorState`, không ghép.
 *
 * Ghép chúng lại thành một chuỗi ở nơi gọi là bỏ đúng sự phân biệt mà tầng kiểu
 * vừa ép ra: `what` là chuyện gì hỏng, `next` là làm gì tiếp, và người đọc quét
 * tiêu đề trước rồi mới đọc câu dưới.
 */
function PathsError(props: {
  readonly error: unknown;
  readonly onRetry: () => unknown;
  readonly retrying: boolean;
}): ReactElement {
  const entry = err('me.error.paths-load', { reason: describeTrpcError(props.error) });
  return (
    <ErrorState
      title={entry.what}
      message={entry.next}
      onRetry={() => void props.onRetry()}
      retrying={props.retrying}
    />
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
          <p
            className={
              summary.nextIsItemId
                ? 'font-mono text-xs break-all text-muted-foreground'
                : 'text-xs text-muted-foreground'
            }
          >
            {summary.nextLabel}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
