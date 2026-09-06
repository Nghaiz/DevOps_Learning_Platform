'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@devops-platform/ui';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import {
  countByFilter,
  describeItem,
  filterByState,
  filterLabel,
  formatUpdatedAt,
  lastPublishFailure,
  sortByRecent,
  STATE_BADGE,
  STATE_FILTERS,
  STATE_LABELS,
  type AuthoredItem,
  type StateFilter,
} from '../../components/author/content-state';

/**
 * `/author` — bài của tôi, theo trạng thái (13.F task 20).
 *
 * ## Vì sao không có phân trang ở đây
 *
 * `authoring.list` là procedure **zero-arg và không phân trang**: nó trả về mọi
 * bài của người gọi trong một lượt (admin: mọi bài của mọi người). Không có
 * tham số `state`, `limit` hay `cursor` nào để truyền. Nên bộ lọc dưới đây chạy
 * ở client, và điều đó được NÓI RA trong câu ghi chú thay vì để người soạn tự
 * suy — con số ở mỗi tab là toàn bộ, không phải "trang này".
 *
 * ⛔ KHÔNG `useInfiniteQuery` ở bất cứ đâu trong lane này: `@trpc/react-query`
 * tự chèn `direction` vào input, mọi input schema của dự án là `.strict()`, và
 * hậu quả là request thật 400 trong khi test ở tầng API vẫn xanh.
 *
 * ⛔ KHÔNG dựng `<main>` (C6bis) — vỏ ứng dụng sở hữu landmark đó.
 */
export function AuthorListClient() {
  const [filter, setFilter] = useState<StateFilter>('all');
  const query = api.authoring.list.useQuery();

  const items: readonly AuthoredItem[] = query.data ?? [];
  const counts = useMemo(() => countByFilter(items), [items]);
  const shown = useMemo(() => sortByRecent(filterByState(items, filter)), [items, filter]);
  // MỘT mốc thời gian cho cả lượt render: gọi `new Date()` trong từng hàng sẽ
  // cho hai hàng cạnh nhau hai mốc khác nhau, và nhãn "vừa xong" nhảy giữa các
  // hàng mà không có gì đổi.
  const now = new Date();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Soạn bài</h1>
          <p className="text-sm text-muted-foreground">
            Bài học, lab và playground do bạn tạo. Danh sách hiển thị đầy đủ, không chia trang.
          </p>
        </div>
        <Button asChild>
          <Link href="/author/new">Tạo bài mới</Link>
        </Button>
      </header>

      {query.isPending && <ListSkeleton />}

      {query.isError && (
        <ErrorState
          title="Không tải được danh sách bài"
          message={describeTrpcError(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}

      {query.isSuccess && items.length === 0 && (
        <EmptyState
          title="Bạn chưa có bài nào"
          description="Tạo bài học có từng bước, lab giao việc rồi chấm, hoặc playground là một sandbox trống. Bài mới luôn ở trạng thái Nháp — người học không thấy cho tới khi bạn xuất bản."
          action={
            <Button asChild>
              <Link href="/author/new">Tạo bài đầu tiên</Link>
            </Button>
          }
        />
      )}

      {query.isSuccess && items.length > 0 && (
        <>
          <Tabs
            value={filter}
            onValueChange={(value) => {
              setFilter(value as StateFilter);
            }}
          >
            <TabsList>
              {STATE_FILTERS.map((value) => (
                <TabsTrigger key={value} value={value}>
                  {filterLabel(value)} ({counts[value]})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {shown.length === 0 ? (
            <EmptyState
              title={`Không có bài nào ở trạng thái "${filterLabel(filter)}"`}
              description="Đổi bộ lọc phía trên để xem các bài khác."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {shown.map((item) => (
                <li key={item.id}>
                  <ItemCard item={item} now={now} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function ItemCard({ item, now }: { readonly item: AuthoredItem; readonly now: Date }) {
  const failure = lastPublishFailure(item);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/author/${encodeURIComponent(item.id)}`}
                className="text-base font-medium text-foreground underline-offset-4 hover:underline"
              >
                {item.title}
              </Link>
              <Badge variant={STATE_BADGE[item.state]}>{STATE_LABELS[item.state]}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {describeItem(item)} · <code className="font-mono">{item.id}</code>
            </p>
            <p className="text-xs text-muted-foreground">Sửa {formatUpdatedAt(item.updatedAt, now)}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/author/${encodeURIComponent(item.id)}`}>Mở</Link>
          </Button>
        </div>

        {failure !== null && (
          <Alert variant="destructive">
            <AlertTitle>Lượt xuất bản gần nhất trượt</AlertTitle>
            <AlertDescription>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs">{failure}</pre>
              <p className="mt-2">Mở bài, sửa chỗ được nêu, rồi xuất bản lại.</p>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-24 w-full" />
      ))}
    </div>
  );
}
