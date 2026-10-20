'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BackLink,
  Button,
  Empty,
  EmptyArt,
  ErrorBlock,
  Icon,
  InlineText,
  Notice,
  Page,
  PageHeader,
  Pill,
  RowsSkeleton,
  Segments,
  Skeleton,
  cn,
} from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { buildPathItemViews, summarizePathProgress, type PathItemViewModel } from './path-view';

const KIND_ICON = { lesson: 'book', lab: 'flask', quiz: 'quiz' } as const;

/**
 * Chi tiết lộ trình: danh sách các phần (bài học, lab, trắc nghiệm) theo thứ tự, mỗi
 * phần có trạng thái, nút Mở và lý do khoá ngay tại dòng của nó.
 *
 * ⚠ Ổ khoá vẽ ở đây là HÌNH ẢNH của một luật chạy ở SERVER. `state` tới từ
 * `paths.get` và cổng thi hành là `paths.openItem`: bỏ qua giao diện mà gọi thẳng
 * API vẫn bị từ chối `FORBIDDEN`. Không nhánh nào ở file này quyết định mở hay khoá.
 *
 * Nút Mở gọi `openItem` rồi mới điều hướng, không dựng thẳng một `<Link>`: `state` là
 * ảnh chụp lúc `paths.get` chạy, và người học có thể đã làm xong một phần ở tab khác.
 * Đi qua cổng nghĩa là câu trả lời luôn là câu của server HÔM NAY, và khi nó là
 * "không" thì người học đọc được lý do ngay tại dòng đó.
 *
 * ⛔ KHÔNG `<main>` ở đây: vỏ ứng dụng sở hữu landmark đó.
 */
export function PathClient({ pathId }: { pathId: string }): React.ReactElement {
  const query = api.paths.get.useQuery({ pathId });
  const router = useRouter();
  /** Phần đang chờ server trả lời, để chỉ nút ĐÓ hiện trạng thái chờ. */
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  /** Lỗi mở, gắn theo từng phần: một lỗi chung ở đầu trang không nói được phần nào. */
  const [openError, setOpenError] = useState<{ key: string; message: string } | null>(null);
  const openItem = api.paths.openItem.useMutation();

  const back = (
    <BackLink asChild>
      <Link href="/paths">{t('catalog.path.back')}</Link>
    </BackLink>
  );

  if (query.isPending) {
    return (
      <Page className="pb-14">
        <PageHeader back={back} title={<Skeleton className="h-9 w-[24ch] max-w-full" />} />
        <RowsSkeleton rows={4} label={t('catalog.path.loading')} />
      </Page>
    );
  }

  if (query.isError) {
    return (
      <Page className="pb-14">
        <PageHeader back={back} title={t('catalog.title.paths')} />
        <ErrorBlock
          title={t('catalog.path.error-title')}
          retryLabel={t('common.action.retry')}
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        >
          {describeTrpcError(query.error)}
        </ErrorBlock>
      </Page>
    );
  }

  const path = query.data;
  const progress = summarizePathProgress(path);
  const views = buildPathItemViews(path.items, path.nextItemId);
  const next = views.find((view) => view.isNext) ?? null;

  const onOpen = (view: PathItemViewModel): void => {
    if (view.href === null) return;
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
          // Server đã nói chuyện gì xảy ra; thêm một câu về việc tải lại vì trạng
          // thái trên màn hình lúc này đã CŨ so với server.
          setOpenError({
            key: view.key,
            message: t('catalog.path.open-failed', { reason: describeTrpcError(error) }),
          });
        },
      },
    );
  };

  return (
    <Page className="pb-14">
      <PageHeader
        back={back}
        title={path.title}
        {...(path.description === null ? {} : { lead: <InlineText text={path.description} /> })}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Pill icon="layers">{t('catalog.meta.parts', { n: path.itemCount })}</Pill>
          {path.sequential ? <Pill icon="lock">{t('catalog.flag.sequential')}</Pill> : null}
        </div>
        {path.itemCount > 0 ? (
          <div className="flex max-w-xl flex-col gap-2 pt-2">
            <p role="status" className="text-sm font-medium text-ink">
              {progress.label}
            </p>
            <Segments states={views.map((view) => view.segment)} label={t('catalog.path.meter')} />
          </div>
        ) : null}
      </PageHeader>

      {views.length === 0 ? (
        <Empty
          art={<EmptyArt kind="nothing" width={110} />}
          title={t('catalog.path.empty-title')}
          action={
            <Button variant="secondary" asChild>
              <Link href="/lessons">{t('catalog.path.empty-cta')}</Link>
            </Button>
          }
        >
          {t('catalog.path.empty-body')}
        </Empty>
      ) : (
        <div className="grid gap-10 border-t border-rule pt-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
          <ol aria-label={t('catalog.path.stations')} className="flex flex-col">
            {views.map((view) => (
              <PathItem
                key={view.key}
                view={view}
                opening={openingKey === view.key}
                error={openError?.key === view.key ? openError.message : null}
                onOpen={() => onOpen(view)}
                onReload={() => {
                  setOpenError(null);
                  void query.refetch();
                }}
              />
            ))}
          </ol>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
            {next !== null && progress.nextLabel !== null ? (
              <section data-topic={next.topic} className="flex flex-col gap-3 border border-t-2 border-rule border-t-acc-solid bg-paper p-5">
                <p className="flex items-center gap-2 text-sm text-tp-ink">
                  <Icon name={next.icon} size={18} tint="topic" />
                  {next.kindLabel}
                </p>
                <p className="font-display text-lg font-semibold text-ink">{progress.nextLabel}</p>
                {next.openability === 'open' ? (
                  <Button
                    variant="primary"
                    iconRight="arrow-right"
                    className="self-start"
                    onClick={() => onOpen(next)}
                    loading={openingKey === next.key}
                  >
                    {t('catalog.path.next-action')}
                  </Button>
                ) : null}
              </section>
            ) : null}
            {progress.finished && progress.nextLabel !== null ? (
              <Notice tone="ok" title={progress.nextLabel} />
            ) : null}
            {path.sequential ? <p className="text-sm text-ink-3">{t('catalog.path.sequential')}</p> : null}
          </aside>
        </div>
      )}
    </Page>
  );
}

function PathItem({
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
  const passed = view.item.state === 'passed';
  const locked = view.item.state === 'locked';
  return (
    <li data-topic={view.topic} className="border-b border-rule py-5 first:pt-0">
      <div className="flex items-start gap-4">
        <span aria-hidden="true" className="relative mt-0.5 grid size-11 shrink-0 place-items-center text-tp-ink">
          <Icon name={KIND_ICON[view.item.kind]} size={30} tint="topic" />
          {passed || locked ? (
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full ring-2 ring-canvas',
                passed ? 'bg-ok-solid text-on-solid' : 'bg-well-2 text-ink-2',
              )}
            >
              <Icon name={passed ? 'check' : 'lock'} size={12} />
            </span>
          ) : null}
        </span>

        {/*
          KHÔNG làm mờ cả dòng khi phần chưa mở: `opacity` nhân xuống mọi con, kể cả
          chữ phụ vốn đã sát sàn tương phản. Trạng thái "khoá" đi bằng chữ + biểu tượng.
        */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="flex items-center gap-2 text-sm text-ink-3">
                <span className="tabular-nums">{view.number}.</span>
                <span>{view.kindLabel}</span>
              </p>
              <h2 className="text-balance font-display text-lg font-semibold text-ink">{view.title}</h2>
              <div>
                <Pill tone={passed ? 'ok' : locked ? 'neutral' : view.isNext ? 'acc' : 'info'}>{view.stateLabel}</Pill>
              </div>
            </div>
            {openable ? (
              <Button variant={view.isNext ? 'primary' : 'secondary'} onClick={onOpen} loading={opening}>
                {t('catalog.path.open')}
              </Button>
            ) : null}
          </div>

          {/*
            `title === null` = mắt xích trỏ tới nội dung không còn nạp được. Hiện ra thay
            vì lọc đi: một lộ trình thủng là chuyện người soạn phải thấy. Câu này ĐỘC LẬP
            với ổ khoá: phần vừa khoá vừa thủng hiện cả hai.
          */}
          {view.missingContent ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-bad-ink">
              <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
              {t('catalog.path.note-missing')}
            </p>
          ) : null}

          {!openable && !view.missingContent && view.note !== null ? (
            <p className="mt-3 text-sm text-ink-3">{view.note}</p>
          ) : null}

          {error === null ? null : (
            <Notice
              tone="bad"
              role="alert"
              className="mt-4"
              action={
                <Button size="sm" variant="secondary" icon="refresh" onClick={onReload}>
                  {t('catalog.path.reload')}
                </Button>
              }
            >
              {error}
            </Notice>
          )}
        </div>
      </div>
    </li>
  );
}
