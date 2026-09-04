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

/**
 * Trang danh sách `/labs` — cùng khuôn `lessons-client.tsx` (P2/2.D): `useQuery`
 * KHÔNG `useInfiniteQuery` (lý lẽ đầy đủ ở bản gốc: `direction` không lọt qua
 * `listInputSchema.strict()`), lọc độ khó phía CLIENT vì `labs.list` không nhận
 * tham số lọc, KHÔNG gửi `limit` (server tự có mặc định + trần, luật 4).
 *
 * Khác lessons ở một điểm: `labs.list` KHÔNG trả `unsupportedCapabilities` cho
 * từng mục (chỉ `labs.get` mới trả — đúng bất đối xứng của
 * `lessons.list`/`lessons.get`). Cảnh báo năng lực thật sự — thứ chặn một lượt
 * chạy trước khi nó hỏng — nằm ở `/labs/[id]`, TRƯỚC nút "Bắt đầu" (nghĩa là
 * trước khi `startAttempt` mở sandbox, tức trước khi hỏng, không phải sau).
 * Trang này chỉ hiện các nhãn năng lực lab yêu cầu, không tự phán "hỗ trợ hay
 * không" — phán đoán đó là logic phía server (`unsupportedCapabilities` trong
 * `server/lessons/catalog.ts`, ngoài quyền sở hữu file của lane này) và dựng
 * lại nó ở đây sẽ là một nguồn sự thật thứ hai, dễ trôi khỏi bản gốc.
 */
export function LabsClient(): React.ReactElement {
  const [difficulty, setDifficulty] = useState<ScenarioDifficulty | 'all'>('all');

  const query = api.labs.list.useQuery({});

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const visible =
    difficulty === 'all' ? items : items.filter((item) => item.difficulty === difficulty);

  if (query.isPending) {
    return <PageShell>{<p className="text-sm text-slate-500">Đang tải danh sách lab…</p>}</PageShell>;
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
        <p className="text-sm text-slate-500">Không có lab nào ở mức độ khó này.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <li key={item.id}>
              <Link
                href={`/labs/${item.id}`}
                className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <Card className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle>{item.title}</CardTitle>
                    {item.leaderboard && (
                      <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800">
                        Có xếp hạng
                      </span>
                    )}
                  </div>

                  {item.description !== null && (
                    <CardDescription>{item.description}</CardDescription>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded bg-slate-100 px-2 py-0.5">
                      {DIFFICULTY_LABEL[item.difficulty]}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5">
                      {item.taskCount} nhiệm vụ
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5">
                      Đạt từ {item.passThresholdPercent}%
                    </span>
                    {item.estimatedMinutes !== null && (
                      <span className="rounded bg-slate-100 px-2 py-0.5">
                        ~{item.estimatedMinutes} phút
                      </span>
                    )}
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
          Kho lab đã vượt {query.data.limit} mục — trang này mới hiện {items.length} lab đầu.
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
        <h1 className="text-2xl font-bold">Lab</h1>
        <p className="mt-1 text-sm text-slate-500">
          Mỗi lab giao một tập nhiệm vụ độc lập — làm theo thứ tự bất kỳ, tự chấm từng
          nhiệm vụ rồi nộp bài khi sẵn sàng.
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
