'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Lock } from 'lucide-react';
import { Alert, AlertDescription, Button, EmptyState, ErrorState, Meter, cn } from '@devops-platform/ui';
import { t } from '@devops-platform/copy';
import {
  BoardSkeleton,
  PageContainer,
  PosterHeader,
  StationMarker,
  lineFillClass,
  lineForTopic,
  lineTint,
  staggerStyle,
} from '../../../components/kit';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { buildPathItemViews, summarizePathProgress, type PathItemViewModel } from './path-view';

/**
 * Chi tiết lộ trình: sơ đồ tuyến dọc, mỗi ga là một phần (bài học, lab, trắc
 * nghiệm) với trạng thái, nút Mở và lý do khoá ngay tại ga.
 *
 * ⚠ Ổ khoá vẽ ở đây là HÌNH ẢNH của một luật chạy ở SERVER. `state` tới từ
 * `paths.get` và cổng thi hành là `paths.openItem`: bỏ qua giao diện mà gọi thẳng
 * API vẫn bị từ chối `FORBIDDEN`. Không nhánh nào ở file này quyết định mở hay
 * khoá.
 *
 * Nút Mở gọi `openItem` rồi mới điều hướng, không dựng thẳng một `<Link>`: `state`
 * là ảnh chụp lúc `paths.get` chạy, và người học có thể đã làm xong một phần ở tab
 * khác. Đi qua cổng nghĩa là câu trả lời luôn là câu của server HÔM NAY, và khi nó
 * là "không" thì người học đọc được lý do ngay tại ga đó.
 *
 * ⛔ KHÔNG `<main>` ở đây: vỏ ứng dụng sở hữu landmark đó.
 */
export function PathClient({ pathId }: { pathId: string }): React.ReactElement {
  const query = api.paths.get.useQuery({ pathId });
  const router = useRouter();
  /** Phần đang chờ server trả lời, để chỉ nút ĐÓ hiện vòng quay. */
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  /** Lỗi mở, gắn theo từng phần: một lỗi chung ở đầu trang không nói được phần nào. */
  const [openError, setOpenError] = useState<{ key: string; message: string } | null>(null);
  const openItem = api.paths.openItem.useMutation();

  if (query.isPending) {
    return (
      <>
        <PosterHeader section="learn" switcher={false} title={t('catalog.path.loading')} />
        <PageContainer className="py-10">
          <BoardSkeleton rows={4} label={t('catalog.path.loading')} />
        </PageContainer>
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        <PosterHeader section="learn" switcher={false} title={t('catalog.title.paths')} />
        <PageContainer className="py-10">
          <ErrorState
            title={t('catalog.path.error-title')}
            message={describeTrpcError(query.error)}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        </PageContainer>
      </>
    );
  }

  const path = query.data;
  const progress = summarizePathProgress(path);
  const views = buildPathItemViews(path.items, path.nextItemId);
  const next = views.find((view) => view.isNext) ?? null;
  const line = lineForTopic({ id: path.id });

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
          // Server đã nói chuyện gì xảy ra; thêm một câu về việc tải lại vì
          // trạng thái trên màn hình lúc này đã CŨ so với server.
          setOpenError({
            key: view.key,
            message: t('catalog.path.open-failed', { reason: describeTrpcError(error) }),
          });
        },
      },
    );
  };

  const kicker = [
    t('catalog.title.paths'),
    t('catalog.meta.parts', { n: path.itemCount }),
    ...(path.sequential ? [t('catalog.flag.sequential')] : []),
  ].join(' · ');

  return (
    <>
      <PosterHeader
        section="learn"
        switcher={false}
        kicker={kicker}
        title={path.title}
        {...(path.description === null ? {} : { lead: path.description })}
        aside={
          <div className="flex flex-col gap-3">
            <p role="status" className="type-title">
              {progress.label}
            </p>
            {path.itemCount > 0 && (
              <Meter
                value={path.passedCount}
                max={path.itemCount}
                segments={Math.min(path.itemCount, 24)}
                tone={line === 'ink' ? 'success' : line}
                label={t('catalog.path.meter')}
                className="h-3"
              />
            )}
            <Link href="/paths" className="inline-flex items-center gap-1.5 type-label underline-offset-4 hover:underline">
              <ArrowLeft aria-hidden="true" className="size-3.5" />
              {t('catalog.path.back')}
            </Link>
          </div>
        }
      />

      <PageContainer className="py-10 md:py-14">
        {views.length === 0 ? (
          <EmptyState
            title={t('catalog.path.empty-title')}
            description={t('catalog.path.empty-body')}
            action={
              <Button variant="outline" asChild>
                <Link href="/lessons">{t('catalog.path.empty-cta')}</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
            <ol aria-label={t('catalog.path.stations')} className="flex flex-col">
              {views.map((view, index) => (
                <Station
                  key={view.key}
                  view={view}
                  order={index}
                  last={index === views.length - 1}
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
              ))}
            </ol>

            <div className="lg:sticky lg:top-24 lg:self-start">
              {next !== null && progress.nextLabel !== null && (
                <div className="border-t-4 bg-muted p-6" style={{ borderTopColor: lineTint(next.line) }}>
                  <p className="type-label text-muted-foreground">{next.kindLabel}</p>
                  <p className="mt-2 type-title">{progress.nextLabel}</p>
                  {next.openability === 'open' && (
                    <Button
                      className="mt-5"
                      onClick={() => {
                        onOpen(next);
                      }}
                      loading={openingKey === next.key}
                      iconRight={<ArrowRight aria-hidden="true" className="size-4" />}
                    >
                      {t('catalog.path.next-action')}
                    </Button>
                  )}
                </div>
              )}
              {progress.finished && progress.nextLabel !== null && (
                <p className="inline-flex items-start gap-2 bg-muted p-6 type-title">
                  <Check aria-hidden="true" className="mt-1 size-5 shrink-0 text-success" strokeWidth={3} />
                  {progress.nextLabel}
                </p>
              )}
              {path.sequential && (
                <p className="mt-4 text-sm text-muted-foreground">{t('catalog.path.sequential')}</p>
              )}
            </div>
          </div>
        )}
      </PageContainer>
    </>
  );
}

function Station({
  view,
  order,
  last,
  opening,
  error,
  onOpen,
  onReload,
}: {
  view: PathItemViewModel;
  order: number;
  last: boolean;
  opening: boolean;
  error: string | null;
  onOpen: () => void;
  onReload: () => void;
}): React.ReactElement {
  const openable = view.openability === 'open';
  return (
    <li className="stagger animate-rise relative flex gap-5" style={staggerStyle(order)}>
      <span aria-hidden="true" className="relative flex w-5 shrink-0 flex-col items-center pt-1.5">
        <StationMarker line={view.line} state={view.marker} className="size-4" />
        {!last && <span className={cn('mt-1.5 w-1 flex-1', lineFillClass(view.line))} />}
      </span>

      {/*
        KHÔNG làm mờ cả ga khi phần chưa mở: `opacity` nhân xuống mọi con, kể cả
        chữ phụ vốn đã sát sàn tương phản (axe từng đo SERIOUS ở đây). Trạng thái
        "khoá" đi bằng chữ + icon, không bằng lớp mờ.
      */}
      <div className={cn('min-w-0 flex-1', !last && 'mb-6 border-b border-border pb-6')}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-3 type-label text-muted-foreground">
              <span className="font-mono tabular-nums">{String(view.number).padStart(2, '0')}</span>
              <span>{view.kindLabel}</span>
            </p>
            <h2 className="mt-1 type-title text-balance">{view.title}</h2>
            <p
              className={cn(
                'mt-2 inline-flex items-center gap-1.5 type-label',
                view.item.state === 'passed' ? 'text-success' : 'text-muted-foreground',
              )}
            >
              {view.item.state === 'passed' && <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />}
              {view.item.state === 'locked' && <Lock aria-hidden="true" className="size-3.5" />}
              {view.stateLabel}
            </p>
          </div>
          {openable && (
            <Button variant={view.isNext ? 'primary' : 'outline'} onClick={onOpen} loading={opening}>
              {t('catalog.path.open')}
            </Button>
          )}
        </div>

        {/*
          `title === null` = mắt xích trỏ tới nội dung không còn nạp được. Hiện ra
          thay vì lọc đi: một lộ trình thủng là chuyện người soạn phải thấy. Câu
          này ĐỘC LẬP với ổ khoá: phần vừa khoá vừa thủng hiện cả hai.
        */}
        {view.missingContent && (
          <p className="mt-3 inline-flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t('catalog.path.note-missing')}
          </p>
        )}

        {!openable && !view.missingContent && view.note !== null && (
          <p className="mt-3 text-sm text-muted-foreground">{view.note}</p>
        )}

        {error !== null && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription className="flex flex-wrap items-center gap-3 text-foreground">
              <span>{error}</span>
              <Button size="sm" variant="secondary" onClick={onReload}>
                {t('catalog.path.reload')}
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </li>
  );
}
