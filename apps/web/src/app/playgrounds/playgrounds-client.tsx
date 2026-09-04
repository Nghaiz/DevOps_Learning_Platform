'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Button, Card, CardDescription, CardTitle } from '@devops-platform/ui';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';

/**
 * Trang danh sách `/playgrounds` — cùng khuôn `lessons-client.tsx`/`labs-client.tsx`:
 * `useQuery` (không `useInfiniteQuery`, lý lẽ đầy đủ ở bản gốc), KHÔNG gửi
 * `limit` (luật 4). Playground không có độ khó/tiến độ nên không có bộ lọc.
 *
 * TTL hiện NGAY ở đây (đơn vị phút) — AC 8.E đòi người học biết môi trường tự
 * đóng sau bao lâu TRƯỚC KHI bấm vào, không chỉ trước khi bấm "Bắt đầu" bên
 * trong `/playgrounds/[id]`.
 */
export function PlaygroundsClient(): React.ReactElement {
  const query = api.playgrounds.list.useQuery({});
  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  if (query.isPending) {
    return <PageShell>{<p className="text-sm text-slate-500">Đang tải danh sách sân chơi…</p>}</PageShell>;
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

  return (
    <PageShell>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có sân chơi nào.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/playgrounds/${item.id}`}
                className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <Card className="flex h-full flex-col gap-3">
                  <CardTitle>{item.title}</CardTitle>
                  {item.description !== null && <CardDescription>{item.description}</CardDescription>}
                  <div className="mt-auto flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded bg-slate-100 px-2 py-0.5">
                      Tự đóng sau {Math.round(item.ttlSeconds / 60)} phút
                    </span>
                    {item.capabilities.map((capability) => (
                      <span key={capability} className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">
                        {capability}
                      </span>
                    ))}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {query.data?.nextCursor != null && (
        <p role="status" className="text-sm text-amber-700">
          Kho sân chơi đã vượt {query.data.limit} mục — trang này mới hiện {items.length} mục
          đầu. Giao diện phân trang chưa được dựng.
        </p>
      )}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-bold">Sân chơi</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sandbox trống, không bài, không chấm điểm — thử lệnh trước khi vào một bài học hoặc
          lab thật.
        </p>
      </div>
      {children}
    </main>
  );
}
