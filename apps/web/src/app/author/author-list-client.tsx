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
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@devops-platform/ui';
import { renderCopy, t } from '@devops-platform/copy';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import {
  countByFilter,
  describeItem,
  describeUpdatedAt,
  filterByState,
  filterLabelKey,
  lastPublishFailure,
  sortByRecent,
  STATE_BADGE,
  STATE_FILTERS,
  STATE_KEYS,
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
    <div className="practice-catalog">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('author.list.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('author.list.lead')}</p>
        </div>
        <Button asChild>
          <Link href="/author/new">{t('author.list.new-cta')}</Link>
        </Button>
      </header>

      {query.isPending && <ListSkeleton />}

      {query.isError && (
        <ErrorState
          title={t('author.list.error-title')}
          message={describeTrpcError(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}

      {query.isSuccess && items.length === 0 && (
        <EmptyState
          title={t('author.list.empty-title')}
          description={t('author.list.empty-body')}
          action={
            <Button asChild>
              <Link href="/author/new">{t('author.list.empty-cta')}</Link>
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
            <TabsList className="h-auto max-w-full flex-wrap justify-start [&>[data-slot=tabs-trigger]]:min-h-11">
              {STATE_FILTERS.map((value) => (
                <TabsTrigger key={value} value={value}>
                  {renderCopy({
                    key: 'author.list.filter.tab',
                    params: { label: t(filterLabelKey(value)), n: counts[value] },
                  })}
                </TabsTrigger>
              ))}
            </TabsList>
            {/*
              ⚠ DANH SÁCH PHẢI NẰM TRONG `TabsContent`, không phải ngoài `Tabs`.

              Radix đặt `aria-controls={contentId}` lên MỌI `TabsTrigger`, kể cả
              khi panel tương ứng chưa mount. axe miễn trừ một `aria-controls`
              treo khi trigger mang `aria-selected="false"` — nên các tab KHÔNG
              active không bao giờ bị bắt, và một trang dùng `Tabs` đúng cách chỉ
              cần panel của tab đang chọn có thật.

              Bản trước đóng `</Tabs>` ngay sau `TabsList` rồi render danh sách
              BÊN NGOÀI, tức không có một panel nào. Trigger ĐANG active vì thế
              trỏ vào hư không, và axe báo mức **critical**:

                [critical] aria-valid-attr-value — #radix-_r_0_-trigger-all

              (đo trên cụm 2026-09-07, `/author`; các trang `Tabs` khác — `/me`,
              `/labs/:id` — xanh đúng vì chúng CÓ khai `TabsContent`.)

              Bọc bằng đúng MỘT `TabsContent` mang `value={filter}`: nó luôn khớp
              tab đang chọn nên luôn mount, và giao diện không đổi một pixel —
              `Tabs` không tự vẽ gì quanh panel.
            */}
            <TabsContent value={filter}>
              {shown.length === 0 ? (
                <EmptyState
                  title={renderCopy({
                    key: 'author.list.filter.empty.title',
                    params: { filter: t(filterLabelKey(filter)) },
                  })}
                  description={t('author.list.filter.empty.body')}
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
            </TabsContent>
          </Tabs>
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
              <Badge variant={STATE_BADGE[item.state]}>{t(STATE_KEYS[item.state])}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {renderCopy(describeItem(item))} · <code className="font-mono">{item.id}</code>
            </p>
            <p className="text-xs text-muted-foreground">
              {renderCopy(describeUpdatedAt(item.updatedAt, now))}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/author/${encodeURIComponent(item.id)}`}>{t('common.action.open')}</Link>
          </Button>
        </div>

        {failure !== null && (
          <Alert variant="destructive">
            <AlertTitle>{t('author.list.publish-failed.title')}</AlertTitle>
            <AlertDescription>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs">
                {failure}
              </pre>
              <p className="mt-2">{t('author.list.publish-failed.next')}</p>
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
