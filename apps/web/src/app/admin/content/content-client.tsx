'use client';

import { useMemo, useState, type ReactElement } from 'react';
import Link from 'next/link';
import type { inferRouterOutputs } from '@trpc/server';
import { err, t } from '@devops-platform/copy';
import type { AppRouter } from '../../../server/trpc/routers/app-router';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { AdminNote, AdminPage, LedgerSkeleton } from '../../../components/admin/admin-page';
import {
  CONTENT_STATE_FILTERS,
  contentStateTone,
  describeArchiveError,
  describeContentKind,
  describeContentState,
  filterContentByState,
  orderContent,
  planArchive,
} from '../../../components/admin/content-row';
import { formatMoment } from '../../../lib/format-moment';
import { Button, Chip, ConfirmDialog, Empty, ErrorBlock, Notice, Pill, Table, TBody, TD, TH, THead, TR, toast } from '@devops-platform/ds';

type ContentItem = inferRouterOutputs<AppRouter>['authoring']['list'][number];

/**
 * `/admin/content`: nội dung của MỌI người soạn, xem và lưu trữ được.
 *
 * ## Dùng lại `authoring.*`, không có procedure quản trị riêng
 *
 * `authorProcedure` cho `admin` qua; `listAuthoredBy(db, null)` với vai trò
 * admin trả bài của mọi người ở mọi trạng thái; `assertContentOwner` bỏ qua
 * phép kiểm chủ sở hữu khi vai trò là `admin`. Một cặp `admin.content.*` song
 * song chỉ để đổi tên là thêm một đường ghi thứ hai lên cùng một bảng.
 *
 * ## Lọc bằng chip ở client, và số trên chip là tổng THẬT
 *
 * `authoring.list` không nhận tham số và trả CẢ danh sách (không cursor), nên
 * lọc ở client không phải "trang vơi" như bẫy của các bảng có cursor, và con số
 * trên mỗi chip là số bài thật ở trạng thái đó. Nếu về sau `authoring.list` có
 * phân trang thì bộ lọc PHẢI đi xuống server và số trên chip phải bỏ đi.
 */
export function AdminContentClient(): ReactElement {
  const [state, setState] = useState<string>('all');
  const query = api.authoring.list.useQuery();
  const all = useMemo(() => query.data ?? [], [query.data]);

  const rows = useMemo(() => orderContent(filterContentByState(all, state)), [all, state]);

  return (
    <AdminPage title={t('admin.content.title')} lead={t('admin.content.lead')}>
      <div className="flex flex-col gap-6">
        {/*
          Lưu trữ KHÔNG ghi `admin_audit`, và điều đó phải nói ra chứ không giấu.
          `authoring.archive` là procedure của người soạn; nó không gọi
          `writeAdminAudit`. Một trang quản trị ngụ ý "mọi thứ ở đây đều được
          ghi" trong khi một nút thì không là khẳng định quá tay.
        */}
        <Notice tone="warn" title={t('admin.content.alert-title')}>{t('admin.content.alert-body')}</Notice>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label={t('admin.content.filter-label')} className="flex flex-wrap gap-2">
            {CONTENT_STATE_FILTERS.map((option) => (
              <Chip key={option} pressed={state === option} onPressedChange={() => setState(option)} {...(query.data === undefined ? {} : { count: filterContentByState(all, option).length })}>
                {option === 'all' ? t('admin.content.state-all') : describeContentState(option)}
              </Chip>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void query.refetch()}
            loading={query.isFetching}
            icon="refresh"
          >
            {t('admin.content.refetch')}
          </Button>
        </div>

        {query.isPending ? (
          <LedgerSkeleton />
        ) : query.isError ? (
          <ContentError
            reason={describeTrpcError(query.error)}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : rows.length === 0 ? (
          <Empty title={
              state === 'all'
                ? t('admin.content.empty-title-all')
                : t('admin.content.empty-title-filtered')
            } action={
              state === 'all' ? (
                <Button asChild variant="secondary">
                  <Link href="/author">{t('admin.content.open-author')}</Link>
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setState('all')}>
                  {t('admin.content.show-all')}
                </Button>
              )
            }>{
              state === 'all'
                ? t('admin.content.empty-body-all')
                : t('admin.content.empty-body-filtered')
            }</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            <Table label={t('admin.content.title')}>
              <THead>
                <tr>
                  <TH>{t('admin.content.col-title')}</TH>
                  <TH>{t('admin.content.col-kind')}</TH>
                  <TH>{t('admin.content.col-state')}</TH>
                  <TH>{t('admin.content.col-author')}</TH>
                  <TH>{t('admin.content.col-updated')}</TH>
                  <TH numeric>{t('admin.content.col-actions')}</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((item) => (
                  <ContentRow key={item.id} item={item} />
                ))}
              </TBody>
            </Table>

            <AdminNote>
              {state === 'all'
                ? t('admin.content.note-all', { count: rows.length })
                : t('admin.content.note-filtered', { count: rows.length, total: all.length })}
            </AdminNote>
          </div>
        )}
      </div>
    </AdminPage>
  );
}

/** Hai nửa của `ErrorEntry` vào hai khe của `ErrorBlock`. */
function ContentError({
  reason,
  onRetry,
  retrying,
}: {
  readonly reason: string;
  readonly onRetry: () => void;
  readonly retrying: boolean;
}): ReactElement {
  const failure = err('admin.error.content-list', { reason });
  return (
    <ErrorBlock title={failure.what} onRetry={onRetry} retrying={retrying} retryLabel={t('admin.reload')}>{failure.next}</ErrorBlock>
  );
}

function ContentRow({ item }: { readonly item: ContentItem }): ReactElement {
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const utils = api.useUtils();

  const plan = planArchive({ title: item.title, kind: item.kind, state: item.state });

  const archive = api.authoring.archive.useMutation({
    onSuccess: () => {
      setOpen(false);
      setServerError(null);
      toast.success(t('admin.content.toast-title'), { description: t('admin.content.toast-body', { title: item.title }) });
      void utils.authoring.list.invalidate();
    },
    onError: (error) => {
      setServerError(describeArchiveError(describeTrpcError(error)));
    },
  });

  return (
    <TR>
      <TD>
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-ink">{item.title}</span>
          <span className="font-mono text-xs text-ink-2">{item.id}</span>
          {/*
            `publishError` là kết quả CHẠY THỬ THẬT của P9 (setup + verify từng
            bước), không phải một cờ. Giấu nó đi là biến trang quản trị thành một
            dấu tích.
          */}
          {item.publishError === null ? null : (
            <span className="text-xs text-bad-ink">
              {t('admin.content.publish-error', { reason: item.publishError })}
            </span>
          )}
        </div>
      </TD>
      <TD className="text-sm">{describeContentKind(item.kind)}</TD>
      <TD>
        <Pill tone={contentStateTone(item.state)}>{describeContentState(item.state)}</Pill>
      </TD>
      <TD className="font-mono text-xs text-ink-2">{item.authorId}</TD>
      <TD className="whitespace-nowrap text-xs tabular-nums text-ink-2">{formatMoment(item.updatedAt)}</TD>
      <TD numeric>
        <Button
          variant="secondary"
          size="sm"
          icon="archive"
          onClick={() => {
            setServerError(null);
            setOpen(true);
          }}
        >
          {t('admin.content.archive-button')}
        </Button>

        <ConfirmDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              setServerError(null);
            }
          }}
          title={plan.title}
          body={plan.body}
          // Lưu trữ KHÔNG xoá gì (`plan.body` nói rõ, test ghim câu đó).
          loss={null}
          blockedReason={plan.blockedReason}
          error={serverError}
          confirmLabel={plan.confirmLabel}
          cancelLabel={t('common.action.cancel')}
          confirming={archive.isPending}
          onConfirm={() => archive.mutate({ id: item.id })}
        />
      </TD>
    </TR>
  );
}
