'use client';

import Link from 'next/link';
import type { LearningPathItemView, PathItemKind } from '@devops-platform/shared-types/path';
import { Button, Card } from '@devops-platform/ui';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';

/**
 * Chi tiết lộ trình — GIÀN GIÁO (P10 10.A). Bản đầy đủ ở P13 (13.C).
 *
 * ⚠ Ổ khoá vẽ ở đây là HÌNH ẢNH của một luật chạy ở SERVER, không phải chính
 * luật đó. `state` tới từ `paths.get` (tính lại từ tiến độ thật mỗi lần đọc), và
 * cổng thi hành là `paths.openItem` — bỏ qua giao diện mà gọi thẳng API vẫn bị
 * từ chối (AC #3). Không có nhánh nào ở file này quyết định mở hay khoá.
 */

const KIND_LABEL: Record<PathItemKind, string> = {
  lesson: 'Bài học',
  lab: 'Lab',
  quiz: 'Quiz',
};

const KIND_HREF: Record<PathItemKind, string> = {
  lesson: '/lessons',
  lab: '/labs',
  quiz: '/quiz',
};

export function PathClient({ pathId }: { pathId: string }): React.ReactElement {
  const query = api.paths.get.useQuery({ pathId });

  if (query.isPending) {
    return (
      <PageShell title="Đang tải…">
        <p className="text-sm text-slate-500">Đang tải lộ trình…</p>
      </PageShell>
    );
  }

  if (query.isError) {
    return (
      <PageShell title="Lộ trình">
        <p className="text-sm text-red-700" role="alert">
          {describeTrpcError(query.error)}
        </p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Thử lại
        </Button>
      </PageShell>
    );
  }

  const path = query.data;

  return (
    <PageShell title={path.title}>
      {path.description !== null && <p className="text-sm text-slate-600">{path.description}</p>}

      {/*
        Task 15 — nhãn nói ĐÚNG thứ hệ thống biết. Nó biết "đã đạt bao nhiêu
        phần trên bao nhiêu"; nó KHÔNG biết người học đã bỏ ra bao lâu, nên
        không có nhãn thời lượng nào ở đây. Bẫy đã trả giá ở P2: một nhãn từng
        nói "4/4 bước" từ đúng một lượt chấm.
      */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">
          Đã đạt {path.passedCount}/{path.itemCount} phần
        </span>
        {path.sequential && (
          <span className="rounded bg-amber-100 px-2 py-1 text-amber-800">
            Học tuần tự — phần sau mở khi phần trước đạt
          </span>
        )}
        {path.nextItemId !== null && (
          <span className="text-slate-500">Nên làm tiếp: {path.nextItemId}</span>
        )}
      </div>

      <ol className="flex flex-col gap-3">
        {path.items.map((item) => (
          <li key={`${item.kind}:${item.itemId}`}>
            <PathItemCard item={item} />
          </li>
        ))}
      </ol>
    </PageShell>
  );
}

function PathItemCard({ item }: { item: LearningPathItemView }): React.ReactElement {
  const label = item.title ?? item.itemId;
  const body = (
    <Card className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">
          {item.ordinal + 1}. {KIND_LABEL[item.kind]}
        </span>
        <span className="font-medium text-slate-900">{label}</span>
        {/*
          `title === null` = mắt xích trỏ tới bài không còn nạp được. Hiện ra
          thay vì lọc đi — một lộ trình thủng là chuyện người soạn phải thấy.
        */}
        {item.title === null && (
          <span className="text-xs text-red-700">Không nạp được nội dung này</span>
        )}
      </div>
      <StateBadge state={item.state} />
    </Card>
  );

  if (item.state === 'locked' || item.title === null) {
    return <div className="opacity-60">{body}</div>;
  }

  return (
    <Link
      href={`${KIND_HREF[item.kind]}/${item.itemId}`}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
    >
      {body}
    </Link>
  );
}

function StateBadge({ state }: { state: LearningPathItemView['state'] }): React.ReactElement {
  switch (state) {
    case 'passed':
      return (
        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
          Đã đạt
        </span>
      );
    case 'locked':
      return (
        <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
          Còn khoá
        </span>
      );
    case 'available':
      return (
        <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">
          Mở
        </span>
      );
  }
}

function PageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Link href="/paths" className="text-sm text-slate-500 hover:underline">
          ← Lộ trình
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      </header>
      {children}
    </main>
  );
}
