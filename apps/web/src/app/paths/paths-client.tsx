'use client';

import Link from 'next/link';
import { Button, Card, CardDescription, CardTitle } from '@devops-platform/ui';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';

/**
 * Danh sách `/paths` — GIÀN GIÁO của kỹ sư backend (P10), không phải màn hình
 * cuối. Hệ thiết kế thật và bản đầy đủ thuộc P13 (13.C/13.D).
 *
 * Cùng khuôn `labs-client.tsx`: `useQuery` chứ không `useInfiniteQuery`
 * (`direction` không lọt qua `listInputSchema.strict()` — bẫy đã trả giá ở P2),
 * và KHÔNG gửi `limit` (server tự có mặc định + trần 100, luật 4).
 */
export function PathsClient(): React.ReactElement {
  const query = api.paths.list.useQuery({});

  if (query.isPending) {
    return (
      <PageShell>
        <p className="text-sm text-slate-500">Đang tải lộ trình…</p>
      </PageShell>
    );
  }

  if (query.isError) {
    return (
      <PageShell>
        <p className="text-sm text-red-700" role="alert">
          {describeTrpcError(query.error)}
        </p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Thử lại
        </Button>
      </PageShell>
    );
  }

  const items = query.data.items;

  return (
    <PageShell>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có lộ trình nào được xuất bản.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/paths/${item.id}`}
                className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <Card className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle>{item.title}</CardTitle>
                    {item.sequential && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                        Học tuần tự
                      </span>
                    )}
                  </div>

                  {item.description !== null && (
                    <CardDescription>{item.description}</CardDescription>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded bg-slate-100 px-2 py-0.5">
                      {item.itemCount} phần
                    </span>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">Lộ trình</h1>
        <p className="text-sm text-slate-500">
          Nhiều bài gom theo thứ tự. Truy cập chỉ cần đăng nhập.
        </p>
      </header>
      {children}
    </main>
  );
}
