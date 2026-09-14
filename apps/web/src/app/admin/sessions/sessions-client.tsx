'use client';

import { useState, type ReactElement } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { err, t } from '@devops-platform/copy';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  CursorPager,
  EmptyState,
  ErrorState,
  Skeleton,
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
import { describeTrpcError, trpcErrorCode } from '../../../lib/trpc';
import { AdminNote, AdminSection } from '../../../components/admin/admin-section';
import { ConfirmDialog } from '../../../components/admin/confirm-dialog';
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
  pushCursor,
  type CursorStack,
} from '../../../lib/cursor-stack';

type AdminSession = inferRouterOutputs<AppRouter>['admin']['sessions']['list']['items'][number];

/**
 * `/admin/sessions` (13.G) — mọi phiên đang sống, của mọi người, kết thúc được.
 *
 * ## Nút "Kết thúc" ở đây KHÔNG dùng chung đường với `/me`
 *
 * `me.endSession` gửi `actor.user_id` và `reap.lua` kiểm chủ sở hữu, đúng cho
 * đường tự phục vụ. Đường admin gửi `actor.admin_user_id` (D15), tức CỐ Ý bỏ
 * qua phép kiểm ấy, và đổi lại orchestrator ghi `sessions_audit` dưới tên ADMIN
 * thay vì dưới tên chủ phiên. Trước D15, admin bấm chỉ nhận `NOT_FOUND`, một
 * no-op đội lốt "không tìm thấy".
 *
 * Vì đó là quyền cao nhất trong cả trang quản trị, hộp xác nhận phải nói ra ba
 * điều: phiên của AI, mất gì, và nhật ký ghi dưới tên AI. Toàn bộ câu chữ đó
 * nằm ở `planTerminate` (hàm thuần, có test).
 */
export function AdminSessionsClient({ viewerId }: { readonly viewerId: string }): ReactElement {
  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);
  const cursor = currentCursor(stack);
  const query = api.admin.sessions.list.useQuery(cursor === undefined ? {} : { cursor });

  return (
    <AdminSection title={t('admin.sessions.title')} description={t('admin.sessions.description')}>
      <Alert>
        <AlertTitle as="h2">{t('admin.sessions.alert-title')}</AlertTitle>
        <AlertDescription>{t('admin.sessions.alert-body')}</AlertDescription>
      </Alert>

      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <SessionsError
          reason={describeTrpcError(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          title={t('admin.sessions.empty-title')}
          description={t('admin.sessions.empty-body')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {/* Năm cột, hai trong đó là id đầy đủ: cuộn cục bộ thay vì để cả trang trôi ngang. */}
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.sessions.col-session')}</TableHead>
                  <TableHead>{t('admin.sessions.col-owner')}</TableHead>
                  <TableHead>{t('admin.sessions.col-status')}</TableHead>
                  <TableHead>{t('admin.sessions.col-expiry')}</TableHead>
                  <TableHead className="text-right">{t('admin.sessions.col-actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((session) => (
                  <SessionRow key={session.id} session={session} viewerId={viewerId} />
                ))}
              </TableBody>
            </Table>
          </div>

          <AdminNote>
            {t('admin.sessions.note', {
              count: query.data.items.length,
              page: pageNumber(stack),
            })}
            {query.data.nextCursor != null ? t('admin.sessions.note-more') : '.'}
          </AdminNote>

          <CursorPager
            hasNext={query.data.nextCursor != null}
            onNext={() => setStack((prev) => pushCursor(prev, query.data.nextCursor))}
            onReset={() => setStack(FIRST_PAGE)}
            page={pageNumber(stack)}
            loading={query.isFetching}
          />
        </div>
      )}
    </AdminSection>
  );
}

/** Hai nửa của `ErrorEntry` vào hai khe của `ErrorState`. */
function SessionsError({
  reason,
  onRetry,
  retrying,
}: {
  readonly reason: string;
  readonly onRetry: () => void;
  readonly retrying: boolean;
}): ReactElement {
  const failure = err('admin.error.sessions-list', { reason });
  return (
    <ErrorState title={failure.what} message={failure.next} onRetry={onRetry} retrying={retrying} />
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
  const { toast } = useToast();
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
      toast({
        variant: 'success',
        title: t('admin.sessions.toast-title'),
        description: t('admin.sessions.toast-body', { owner: session.userId }),
      });
      void utils.admin.sessions.list.invalidate();
      void utils.admin.audit.list.invalidate();
      // Sức chứa vừa đổi (một phiên rời khỏi `pool:claimed`); badge "còn N chỗ"
      // của vỏ tự đọc lại sau tối đa 15s. Không ép nó ở đây để tránh hai nguồn
      // cùng quyết định khi nào con số đó được làm mới.
    },
    onError: (error) => {
      setServerError(describeTerminateError(trpcErrorCode(error), describeTrpcError(error)));
    },
  });

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-mono text-xs">{session.id}</span>
          <span className="text-xs text-muted-foreground">
            {t('admin.sessions.pod-line', {
              pod: session.podName === '' ? t('admin.sessions.pod-unassigned') : session.podName,
              at: formatMoment(session.createdAt),
            })}
          </span>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs">
        {describeSessionOwner(session.userId, viewerId)}
      </TableCell>
      <TableCell>
        <Badge variant={status.variant}>{status.label}</Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {/*
          `Date.now()` đọc ở CHỖ GỌI, không trong hàm nhãn: một hàm phụ thuộc
          đồng hồ là một test không xác định (cùng kỷ luật `summarizeProgress`).
        */}
        {describeExpiry(session.expiresAt, Date.now())}
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
          blockedReason={null}
          error={serverError}
          confirmLabel={plan.confirmLabel}
          confirming={terminate.isPending}
          onConfirm={() => terminate.mutate({ sessionId: session.id })}
        />
      </TableCell>
    </TableRow>
  );
}
