'use client';

import {
  useState,
  type ReactElement } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { err,
  t } from '@devops-platform/copy';
import type { AppRouter } from '../../../server/trpc/routers/app-router';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError,
  trpcErrorCode } from '../../../lib/trpc';
import {
  AdminNote,
  AdminPage,
  FirstPageButton,
  LedgerError,
  LedgerSkeleton,
  AdminPager,
} from '../../../components/admin/admin-page';
import {
  describeExpiry,
  describeSessionOwner,
  describeSessionStatus,
  describeTerminateError,
  planTerminate,
} from '../../../components/admin/session-row';
import { formatMoment } from '../../../lib/format-moment';
import {
  FIRST_PAGE,
  currentCursor,
  pageNumber,
  popCursor,
  pushCursor,
  type CursorStack,
} from '../../../lib/cursor-stack';
import { Button, ConfirmDialog, Empty, Notice, Pill, Table, TBody, TD, TH, THead, TR, toast } from '@devops-platform/ds';

type AdminSession = inferRouterOutputs<AppRouter>['admin']['sessions']['list']['items'][number];

/**
 * `/admin/sessions`: mọi phiên đang sống, của mọi người, kết thúc được.
 *
 * ## Nút "Kết thúc" ở đây KHÔNG dùng chung đường với `/me`
 *
 * `me.endSession` gửi `actor.user_id` và `reap.lua` kiểm chủ sở hữu. Đường
 * admin gửi `actor.admin_user_id` (D15), tức CỐ Ý bỏ qua phép kiểm ấy, và
 * orchestrator ghi `sessions_audit` dưới tên ADMIN thay vì tên chủ phiên.
 *
 * Vì đó là quyền cao nhất của trang quản trị, hộp xác nhận nói ra ba điều:
 * phiên của AI, mất gì, nhật ký ghi dưới tên AI. Câu chữ nằm ở
 * `planTerminate` (hàm thuần, có test).
 */
export function AdminSessionsClient({ viewerId }: { readonly viewerId: string }): ReactElement {
  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);
  const cursor = currentCursor(stack);
  const query = api.admin.sessions.list.useQuery(cursor === undefined ? {} : { cursor });

  return (
    <AdminPage title={t('admin.sessions.title')} lead={t('admin.sessions.lead')}>
      <div className="flex flex-col gap-6">
        <Notice tone="info" title={t('admin.sessions.alert-title')}>{t('admin.sessions.alert-body')}</Notice>

        {query.isPending ? (
          <LedgerSkeleton />
        ) : query.isError ? (
          <LedgerError
            failure={err('admin.error.sessions-list', { reason: describeTrpcError(query.error) })}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            page={pageNumber(stack)}
            onFirst={() => setStack(FIRST_PAGE)}
          />
        ) : query.data.items.length === 0 ? (
          <Empty title={t('admin.sessions.empty-title')} {...(pageNumber(stack) > 1
              ? { action: <FirstPageButton page={pageNumber(stack)} onFirst={() => setStack(FIRST_PAGE)} /> }
              : {})}>{t('admin.sessions.empty-body')}</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            <Table label={t('admin.sessions.title')}>
              <THead>
                <tr>
                  <TH>{t('admin.sessions.col-session')}</TH>
                  <TH>{t('admin.sessions.col-owner')}</TH>
                  <TH>{t('admin.sessions.col-status')}</TH>
                  <TH>{t('admin.sessions.col-expiry')}</TH>
                  <TH numeric>{t('admin.sessions.col-actions')}</TH>
                </tr>
              </THead>
              <TBody>
                {query.data.items.map((session) => (
                  <SessionRow key={session.id} session={session} viewerId={viewerId} />
                ))}
              </TBody>
            </Table>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <AdminNote>
                {t('admin.sessions.note', {
                  count: query.data.items.length,
                  page: pageNumber(stack),
                })}
                {query.data.nextCursor != null ? t('admin.sessions.note-more') : '.'}
              </AdminNote>
              <AdminPager page={pageNumber(stack)} hasNext={query.data.nextCursor != null} loading={query.isFetching} onNext={() => setStack((prev) => pushCursor(prev, query.data.nextCursor))} onFirst={() => setStack(FIRST_PAGE)} onPrevious={() => setStack(popCursor)} />
            </div>
          </div>
        )}
      </div>
    </AdminPage>
  );
}

function SessionRow({
  session,
  viewerId,
}: {
  readonly session: AdminSession;
  readonly viewerId: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const utils = api.useUtils();

  const status = describeSessionStatus(session.status);
  const plan = planTerminate({
    sessionId: session.id,
    ownerUserId: session.userId,
    viewerId,
  });

  const terminate = api.admin.sessions.terminate.useMutation({
    onSuccess: () => {
      setOpen(false);
      setServerError(null);
      toast.success(t('admin.sessions.toast-title'), { description: t('admin.sessions.toast-body', { owner: session.userId }) });
      void utils.admin.sessions.list.invalidate();
      void utils.admin.audit.list.invalidate();
      // Sức chứa vừa đổi; số "còn N chỗ" của vỏ tự đọc lại sau tối đa 15s.
      // Không ép nó ở đây để chỉ một nguồn quyết định khi nào số được làm mới.
    },
    onError: (error) => {
      setServerError(describeTerminateError(trpcErrorCode(error), describeTrpcError(error)));
    },
  });

  return (
    <TR>
      <TD>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xs text-ink">{session.id}</span>
          <span className="font-mono text-xs text-ink-2">
            {t('admin.sessions.pod-line', {
              pod: session.podName === '' ? t('admin.sessions.pod-unassigned') : session.podName,
              at: formatMoment(session.createdAt),
            })}
          </span>
        </div>
      </TD>
      <TD className="font-mono text-xs">
        {describeSessionOwner(session.userId, viewerId)}
      </TD>
      <TD>
        {/*
          Chấm sống (nhấp nháy) chỉ cho phiên chưa vào trạng thái cuối:
          `describeSessionStatus().live` là phán quyết đã có test, không phải
          một so sánh chép tay ở đây.
        */}
        <Pill tone={status.tone} dot live={status.live}>
          {status.label}
        </Pill>
      </TD>
      <TD className="text-xs tabular-nums text-ink-2">
        {/*
          `Date.now()` đọc ở CHỖ GỌI, không trong hàm nhãn: một hàm phụ thuộc
          đồng hồ là một test không xác định.
        */}
        {describeExpiry(session.expiresAt, Date.now())}
      </TD>
      <TD numeric>
        <Button
          variant="danger"
          size="sm"
          icon="power"
          onClick={() => {
            setServerError(null);
            setOpen(true);
          }}
        >
          {t('admin.sessions.terminate')}
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
          // Phần "mọi thứ chưa lưu trong pod sẽ mất" đã nằm trong `plan.body`
          // và được test ghim nguyên câu; tách ra một khe thứ hai là nói hai lần.
          loss={null}
          blockedReason={null}
          error={serverError}
          confirmLabel={plan.confirmLabel}
          cancelLabel={t('common.action.cancel')}
          confirming={terminate.isPending}
          onConfirm={() => terminate.mutate({ sessionId: session.id })}
        />
      </TD>
    </TR>
  );
}
