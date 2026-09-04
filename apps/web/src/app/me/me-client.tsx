'use client';

import Link from 'next/link';
import { Button, Card, CardTitle } from '@devops-platform/ui';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';

/**
 * Trang "của tôi" — GIÀN GIÁO (P10 10.E task 14). Bản đầy đủ ở P13 (13.E #17).
 *
 * ## Task 15 — nhãn chỉ được nói thứ nó biết
 *
 * ⚠ Bẫy đã trả giá ở P2: một nhãn tiến độ từng nói "4/4 bước" dựa trên đúng một
 * lượt chấm. Ở đây hệ thống biết đúng ba điều, và trang này không nói gì hơn:
 *
 * · lộ trình nào đang dở (đã đạt ≥1 phần, chưa đạt hết);
 * · đã đạt bao nhiêu phần trên bao nhiêu;
 * · phần nào nên làm tiếp.
 *
 * Nó KHÔNG biết người học đã bỏ ra bao lâu, ngày nào học gần nhất, hay còn bao
 * nhiêu phút nữa — nên không nhãn nào ở đây khẳng định những điều đó. Mọi con
 * số đều TÍNH lúc đọc từ `paths.mine`; không cột nào lưu chúng.
 */
export function MeClient(): React.ReactElement {
  const paths = api.paths.mine.useQuery({});
  const progress = api.me.listProgress.useQuery({});

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">Của tôi</h1>
        <p className="text-sm text-slate-500">Lộ trình đang học và lịch sử bài học.</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-slate-900">Lộ trình đang học</h2>

        {paths.isPending && <p className="text-sm text-slate-500">Đang tải…</p>}

        {paths.isError && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-red-700" role="alert">
              {describeTrpcError(paths.error)}
            </p>
            <Button variant="secondary" onClick={() => void paths.refetch()}>
              Thử lại
            </Button>
          </div>
        )}

        {paths.isSuccess &&
          (paths.data.items.length === 0 ? (
            <p className="text-sm text-slate-500">
              Chưa có lộ trình nào đang dở. <Link href="/paths" className="underline">Xem lộ trình</Link>
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {paths.data.items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/paths/${item.id}`}
                    className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    <Card className="flex flex-col gap-2">
                      <CardTitle>{item.title}</CardTitle>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="rounded bg-slate-100 px-2 py-0.5">
                          Đã đạt {item.passedCount}/{item.itemCount} phần
                        </span>
                        {item.nextItemId !== null && (
                          <span className="rounded bg-sky-100 px-2 py-0.5 text-sky-800">
                            Tiếp theo: {item.nextItemId}
                          </span>
                        )}
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-slate-900">Bài học gần đây</h2>

        {progress.isPending && <p className="text-sm text-slate-500">Đang tải…</p>}

        {progress.isError && (
          <p className="text-sm text-red-700" role="alert">
            {describeTrpcError(progress.error)}
          </p>
        )}

        {progress.isSuccess &&
          (progress.data.items.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có bài học nào.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {progress.data.items.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm"
                >
                  <Link href={`/lessons/${row.lessonId}`} className="hover:underline">
                    {row.lessonId}
                  </Link>
                  {/*
                    "Đã xong" đọc từ `completedAt` — một mốc CÓ THẬT trong DB.
                    Không hiện phần trăm ở đây: `progress` lưu `stepIndex`, và
                    một tỉ lệ cần `stepCount` của bài, thứ hàng này không mang.
                  */}
                  <span className="text-xs text-slate-500">
                    {row.completedAt === null ? 'Đang học' : 'Đã xong'}
                  </span>
                </li>
              ))}
            </ul>
          ))}
      </section>
    </main>
  );
}
