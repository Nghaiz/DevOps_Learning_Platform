'use client';

import { useMemo, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import { err, t } from '@devops-platform/copy';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '@devops-platform/ui';
import type { AppRouter } from '../../../server/trpc/routers/app-router';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { AdminNote, AdminPage, LedgerSkeleton } from '../../../components/admin/admin-page';
import { ConfirmDialog } from '../../../components/kit/confirm-dialog';
import {
  CONTENT_STATE_FILTERS,
  contentStateVariant,
  describeArchiveError,
  describeContentKind,
  describeContentState,
  filterContentByState,
  orderContent,
  planArchive,
} from '../../../components/admin/content-row';
import { formatMoment } from '../../../lib/format-moment';

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
    <AdminPage
      kicker={t('admin.content.kicker')}
      title={t('admin.content.title')}
      lead={t('admin.content.lead')}
    >
      <div className="flex flex-col gap-6 pt-10">
        {/*
          Lưu trữ KHÔNG ghi `admin_audit`, và điều đó phải nói ra chứ không giấu.
          `authoring.archive` là procedure của người soạn; nó không gọi
          `writeAdminAudit`. Một trang quản trị ngụ ý "mọi thứ ở đây đều được
          ghi" trong khi một nút thì không là khẳng định quá tay.
        */}
        <Alert variant="warning">
          <AlertTitle as="h2">{t('admin.content.alert-title')}</AlertTitle>
          <AlertDescription>{t('admin.content.alert-body')}</AlertDescription>
        </Alert>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label={t('admin.content.filter-label')} className="flex flex-wrap gap-2">
            {CONTENT_STATE_FILTERS.map((option) => (
              <Chip
                key={option}
                selected={state === option}
                onClick={() => setState(option)}
                {...(query.data === undefined ? {} : { count: filterContentByState(all, option).length })}
              >
                {option === 'all' ? t('admin.content.state-all') : describeContentState(option)}
              </Chip>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void query.refetch()}
            loading={query.isFetching}
            iconLeft={<RefreshCw aria-hidden="true" />}
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
          <EmptyState
            title={
              state === 'all'
                ? t('admin.content.empty-title-all')
                : t('admin.content.empty-title-filtered')
            }
            description={
              state === 'all'
                ? t('admin.content.empty-body-all')
                : t('admin.content.empty-body-filtered')
            }
            action={
              state === 'all' ? (
                <Button asChild variant="outline">
                  <Link href="/author">{t('admin.content.open-author')}</Link>
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setState('all')}>
                  {t('admin.content.show-all')}
                </Button>
              )
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.content.col-title')}</TableHead>
                  <TableHead>{t('admin.content.col-kind')}</TableHead>
                  <TableHead>{t('admin.content.col-state')}</TableHead>
                  <TableHead>{t('admin.content.col-author')}</TableHead>
                  <TableHead>{t('admin.content.col-updated')}</TableHead>
                  <TableHead className="text-right">{t('admin.content.col-actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <ContentRow key={item.id} item={item} />
                ))}
              </TableBody>
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

/** Hai nửa của `ErrorEntry` vào hai khe của `ErrorState`. */
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
    <ErrorState title={failure.what} message={failure.next} onRetry={onRetry} retrying={retrying} />
  );
}

function ContentRow({ item }: { readonly item: ContentItem }): ReactElement {
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { toast } = useToast();
  const utils = api.useUtils();

  const plan = planArchive({ title: item.title, kind: item.kind, state: item.state });

  const archive = api.authoring.archive.useMutation({
    onSuccess: () => {
      setOpen(false);
      setServerError(null);
      toast({
        variant: 'success',
        title: t('admin.content.toast-title'),
        description: t('admin.content.toast-body', { title: item.title }),
      });
      void utils.authoring.list.invalidate();
    },
    onError: (error) => {
      setServerError(describeArchiveError(describeTrpcError(error)));
    },
  });

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-foreground">{item.title}</span>
          <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
          {/*
            `publishError` là kết quả CHẠY THỬ THẬT của P9 (setup + verify từng
            bước), không phải một cờ. Giấu nó đi là biến trang quản trị thành một
            dấu tích.
          */}
          {item.publishError === null ? null : (
            <span className="text-xs text-destructive">
              {t('admin.content.publish-error', { reason: item.publishError })}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm">{describeContentKind(item.kind)}</TableCell>
      <TableCell>
        <Badge variant={contentStateVariant(item.state)}>{describeContentState(item.state)}</Badge>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{item.authorId}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {formatMoment(item.updatedAt)}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="outline"
          size="sm"
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
          confirming={archive.isPending}
          onConfirm={() => archive.mutate({ id: item.id })}
        />
      </TableCell>
    </TableRow>
  );
}
