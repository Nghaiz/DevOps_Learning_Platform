'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  SCENARIO_DIFFICULTIES,
  type ScenarioDifficulty,
} from '@devops-platform/shared-types/scenario';
import { Button, Card, CardDescription, CardTitle } from '@devops-platform/ui';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';

const DIFFICULTY_LABEL: Record<ScenarioDifficulty, string> = {
  beginner: 'Cơ bản',
  intermediate: 'Trung cấp',
  advanced: 'Nâng cao',
};

const STATUS_LABEL: Record<string, string> = {
  'not-started': 'Chưa bắt đầu',
  'in-progress': 'Đang học',
  completed: 'Đã xong',
};

const STATUS_CLASS: Record<string, string> = {
  'not-started': 'bg-slate-100 text-slate-600',
  'in-progress': 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
};

export function LessonsClient(): React.ReactElement {
  const [difficulty, setDifficulty] = useState<ScenarioDifficulty | 'all'>('all');

  /**
   * ⛔ `useQuery`, KHÔNG `useInfiniteQuery` — và đây là ràng buộc cứng, không
   * phải lựa chọn phong cách.
   *
   * `useInfiniteQuery` của @trpc/react-query nhét `direction` vào INPUT gửi lên
   * server. Đo trên cụm 2026-08-13, request thật của trang này:
   *     GET /api/trpc/lessons.list?batch=1&input={"0":{"direction":"forward"}}  → 400
   *     [{"code":"unrecognized_keys","keys":["direction"], ...}]
   * `listInputSchema` là `.strict()` (luật 3), nên nó từ chối — ĐÚNG như thiết
   * kế. Hai thứ này không tương thích với nhau.
   *
   * Cách sửa SAI là thêm `direction` vào schema: server không đọc field đó, nên
   * đó là nới lỏng một cổng bảo mật để chứa một field vô nghĩa.
   *
   * ⚠ Bug này KHÔNG bị e2e API bắt: harness gọi thẳng `lessons.list({limit:100})`
   * và xanh, trong khi đường người dùng thật đỏ 400. Chỉ có trình duyệt mới đi
   * qua đúng đoạn mã sinh input.
   *
   * KHÔNG gửi `limit`: server đã có mặc định + trần (luật 4) và TRẢ VỀ `limit`
   * nó thực sự dùng. Nhập lại hằng số đó ở client sẽ phải import từ
   * `server/trpc/init` — kéo mã server vào bundle trình duyệt, đúng hạng lỗi
   * `node:fs` vừa làm đổ build ở chặng này.
   */
  const query = api.lessons.list.useQuery({});

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  // Lọc phía CLIENT có chủ ý: `lessons.list` không nhận tham số lọc, và thêm một
  // tham số vào API để lọc 5 bài là dựng phân trang phía server cho một tập vừa
  // trong một trang. Khi catalog đủ lớn để phân trang thật, bộ lọc phải đi xuống
  // server cùng lúc — ghi ở đây để hai thứ đó không trôi khỏi nhau.
  const visible =
    difficulty === 'all' ? items : items.filter((item) => item.difficulty === difficulty);

  if (query.isPending) {
    return <PageShell>{<p className="text-sm text-slate-500">Đang tải danh sách bài…</p>}</PageShell>;
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Độ khó:</span>
        <FilterButton active={difficulty === 'all'} onClick={() => setDifficulty('all')}>
          Tất cả
        </FilterButton>
        {SCENARIO_DIFFICULTIES.map((level) => (
          <FilterButton
            key={level}
            active={difficulty === level}
            onClick={() => setDifficulty(level)}
          >
            {DIFFICULTY_LABEL[level]}
          </FilterButton>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-slate-500">Không có bài nào ở mức độ khó này.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <li key={item.id}>
              <Link
                href={`/lessons/${item.id}`}
                className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <Card className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle>{item.title}</CardTitle>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[item.progress.status] ?? ''}`}
                    >
                      {STATUS_LABEL[item.progress.status] ?? item.progress.status}
                    </span>
                  </div>

                  {item.description !== null && (
                    <CardDescription>{item.description}</CardDescription>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded bg-slate-100 px-2 py-0.5">
                      {DIFFICULTY_LABEL[item.difficulty]}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5">
                      {item.stepCount} bước
                    </span>
                    {item.estimatedMinutes !== null && (
                      <span className="rounded bg-slate-100 px-2 py-0.5">
                        ~{item.estimatedMinutes} phút
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/*
        Kho nội dung vượt một trang thì NÓI RA, không cắt im lặng.
        Hôm nay `MAX_LIST_LIMIT` = 100 và catalog có 5 bài, nên nhánh này không
        chạy. Nó tồn tại để ngày catalog vượt 100, người dùng thấy "còn bài chưa
        hiện" thay vì một danh sách trông đầy đủ mà thiếu — cùng kỷ luật với món
        nợ đã ghi ở `lessons.list` (nạp cả catalog vào bộ nhớ rồi mới cắt trang).
      */}
      {query.data?.nextCursor != null && (
        <p role="status" className="text-sm text-amber-700">
          Kho bài đã vượt {query.data.limit} mục — trang này mới hiện {items.length} bài đầu.
          Giao diện phân trang chưa được dựng.
        </p>
      )}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-bold">Bài học</h1>
        <p className="mt-1 text-sm text-slate-500">
          Mỗi bài mở một sandbox riêng. Tiến độ chỉ mình bạn thấy.
        </p>
      </div>
      {children}
    </main>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
        active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  );
}
