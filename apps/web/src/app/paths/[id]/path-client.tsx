'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@devops-platform/ui';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import {
  buildPathItemViews,
  summarizePathProgress,
  type PathItemViewModel,
} from './path-view';

/**
 * Chi tiết lộ trình (13.C / 13.D) — ổ khoá, và nút mở đi QUA `paths.openItem`.
 *
 * ⚠ Ổ khoá vẽ ở đây là HÌNH ẢNH của một luật chạy ở SERVER, không phải chính
 * luật đó. `state` tới từ `paths.get` (server tính lại từ tiến độ thật mỗi lượt
 * đọc) và cổng thi hành là `paths.openItem` — bỏ qua giao diện mà gọi thẳng API
 * vẫn bị từ chối `FORBIDDEN` (AC #3). Không nhánh nào ở file này quyết định mở
 * hay khoá.
 *
 * Vì sao nút "Mở" gọi `openItem` rồi mới điều hướng, thay vì dựng thẳng một
 * `<Link>`: `state` là ảnh chụp lúc `paths.get` chạy. Người học mở hai tab, làm
 * xong một phần ở tab kia, rồi bấm ở tab này — hoặc ngược lại, tiến độ chưa kịp
 * như họ tưởng. Đi qua cổng nghĩa là câu trả lời luôn là câu trả lời HÔM NAY của
 * server, và khi nó là "không" thì người học đọc được lý do thay vì rơi vào một
 * trang trống.
 */

export function PathClient({ pathId }: { pathId: string }): React.ReactElement {
  const query = api.paths.get.useQuery({ pathId });
  const router = useRouter();

  /** Item đang chờ server trả lời — để chỉ nút ĐÓ hiện spinner. */
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  /** Lỗi mở, gắn theo từng item: một lỗi chung ở đầu trang không nói được item nào. */
  const [openError, setOpenError] = useState<{ key: string; message: string } | null>(null);

  const openItem = api.paths.openItem.useMutation();

  if (query.isPending) {
    return (
      <PageShell title="Đang tải…">
        <div role="status" aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">Đang tải lộ trình…</span>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </PageShell>
    );
  }

  if (query.isError) {
    return (
      <PageShell title="Lộ trình">
        <ErrorState
          title="Không mở được lộ trình này"
          message={describeTrpcError(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </PageShell>
    );
  }

  const path = query.data;
  const progress = summarizePathProgress(path);
  const views = buildPathItemViews(path.items);

  const onOpen = (view: PathItemViewModel): void => {
    if (view.href === null) {
      return;
    }
    const href = view.href;
    setOpenError(null);
    setOpeningKey(view.key);
    openItem.mutate(
      { pathId, kind: view.item.kind, itemId: view.item.itemId },
      {
        onSuccess: () => {
          router.push(href);
        },
        onError: (error) => {
          setOpeningKey(null);
          // Server đã nói cả "chuyện gì" lẫn "làm gì tiếp" ("Item còn khoá —
          // hoàn thành item trước đó đã"); thêm một câu về việc tải lại vì
          // trạng thái trên màn hình lúc này đã CŨ so với server.
          setOpenError({
            key: view.key,
            message: `${describeTrpcError(error)} Bấm "Tải lại" để xem trạng thái mới nhất.`,
          });
        },
      },
    );
  };

  // ⛔ KHÔNG `<main>` ở đây (C6bis): vỏ ứng dụng sở hữu landmark đó.
  return (
    <PageShell title={path.title}>
      {path.description !== null && (
        <p className="text-sm text-muted-foreground">{path.description}</p>
      )}

      {/*
        Task 15 — nhãn nói ĐÚNG thứ hệ thống biết. Nó biết "đã đạt bao nhiêu
        phần trên bao nhiêu" và "phần nào nên làm tiếp"; nó KHÔNG biết người học
        đã bỏ ra bao lâu, nên không có nhãn thời lượng nào ở đây. Bẫy đã trả giá
        ở P2: một nhãn từng nói "4/4 bước" từ đúng một lượt chấm.
      */}
      <div role="status" className="flex flex-wrap items-center gap-3">
        <Badge variant={progress.finished ? 'success' : 'secondary'}>{progress.label}</Badge>
        {path.sequential && (
          <Badge variant="outline">Học tuần tự — phần sau mở khi phần trước đạt</Badge>
        )}
        {progress.nextLabel !== null && (
          <span className="text-sm text-muted-foreground">{progress.nextLabel}</span>
        )}
      </div>

      {views.length === 0 ? (
        <EmptyState
          title="Lộ trình này chưa có phần nào"
          description="Người soạn chưa xếp nội dung vào đây. Bạn có thể học tự do ở danh mục bài học."
          action={
            <Button variant="outline" asChild>
              <Link href="/lessons">Xem danh mục bài học</Link>
            </Button>
          }
        />
      ) : (
        <ol className="flex flex-col gap-3">
          {views.map((view) => (
            <li key={view.key}>
              <PathItemCard
                view={view}
                opening={openingKey === view.key}
                error={openError?.key === view.key ? openError.message : null}
                onOpen={() => {
                  onOpen(view);
                }}
                onReload={() => {
                  setOpenError(null);
                  void query.refetch();
                }}
              />
            </li>
          ))}
        </ol>
      )}
    </PageShell>
  );
}

function PathItemCard({
  view,
  opening,
  error,
  onOpen,
  onReload,
}: {
  view: PathItemViewModel;
  opening: boolean;
  error: string | null;
  onOpen: () => void;
  onReload: () => void;
}): React.ReactElement {
  const openable = view.openability === 'open';

  return (
    <Card className={`flex flex-col gap-3 p-4 ${openable ? '' : 'opacity-80'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{view.ordinalLabel}</span>
          <span className="font-medium text-foreground">{view.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={view.stateVariant}>{view.stateLabel}</Badge>
          {openable && (
            <Button size="sm" onClick={onOpen} loading={opening}>
              Mở
            </Button>
          )}
        </div>
      </div>

      {/*
        `title === null` = mắt xích trỏ tới nội dung không còn nạp được (đã lưu
        trữ, hoặc mã sai). Hiện ra thay vì lọc đi — một lộ trình thủng là chuyện
        người soạn phải thấy (`docs/learning-path.md`). Câu này ĐỘC LẬP với ổ
        khoá: một item vừa khoá vừa thủng vẫn phải hiện cả hai.
      */}
      {view.missingContent && (
        <p className="text-xs text-destructive">
          Không nạp được nội dung này (đã lưu trữ hoặc sai mã) — hãy báo người soạn lộ trình.
        </p>
      )}

      {!openable && !view.missingContent && view.note !== null && (
        <p className="text-xs text-muted-foreground">{view.note}</p>
      )}

      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-3 text-foreground">
            <span>{error}</span>
            <Button size="sm" variant="secondary" onClick={onReload}>
              Tải lại
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </Card>
  );
}

function PageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Link href="/paths" className="text-sm text-muted-foreground hover:text-foreground">
          ← Lộ trình
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      </header>
      {children}
    </div>
  );
}
