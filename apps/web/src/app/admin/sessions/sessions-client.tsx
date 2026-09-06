'use client';

import { useState, type ReactElement } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
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
 * `me.endSession` gửi `actor.user_id` và `reap.lua` kiểm chủ sở hữu — đúng cho
 * đường tự phục vụ. Đường admin gửi `actor.admin_user_id` (D15), tức CỐ Ý bỏ
 * qua phép kiểm ấy, và đổi lại orchestrator ghi `sessions_audit` dưới tên ADMIN
 * thay vì dưới tên chủ phiên. Trước D15, admin bấm chỉ nhận `NOT_FOUND` — một
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
    <AdminSection
      title="Phiên đang chạy"
      description="Mọi phiên còn sống trên nền tảng, của mọi người dùng. Kết thúc một phiên sẽ thu hồi pod ngay."
    >
      <Alert>
        <AlertTitle>Danh sách này chỉ có phiên CÒN SỐNG</AlertTitle>
        <AlertDescription>
          Orchestrator lọc bỏ phiên đã hết hạn, đã thu hồi hoặc lỗi trước khi trả về. Một phiên biến
          mất khỏi bảng nghĩa là nó đã kết thúc, không phải nó bị ẩn.
        </AlertDescription>
      </Alert>

      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <ErrorState
          title="Không tải được danh sách phiên"
          message={`${describeTrpcError(query.error)} Bấm Thử lại; nếu vẫn lỗi, kiểm xem BFF có gọi được orchestrator qua gRPC không.`}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          title="Không có phiên nào đang chạy"
          description="Chưa ai mở sandbox lúc này. Con số này khớp với sức chứa ở trang Tổng quan."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phiên</TableHead>
                <TableHead>Chủ phiên</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Hạn</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((session) => (
                <SessionRow key={session.id} session={session} viewerId={viewerId} />
              ))}
            </TableBody>
          </Table>

          <AdminNote>
            Đang xem {query.data.items.length} phiên ở trang {pageNumber(stack)}
            {query.data.nextCursor != null
              ? ' — còn trang sau, nên đây KHÔNG phải tổng số phiên đang chạy. Số tổng nằm ở trang Tổng quan.'
              : '.'}
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
        title: 'Đã kết thúc phiên',
        description: `Pod đã được thu hồi. Nhật ký ghi việc này dưới tên bạn, kèm chủ phiên ${session.userId}.`,
      });
      void utils.admin.sessions.list.invalidate();
      void utils.admin.audit.list.invalidate();
      // Sức chứa vừa đổi (một phiên rời khỏi `pool:claimed`) — badge "còn N chỗ"
      // của vỏ tự đọc lại sau tối đa 15s; không ép nó ở đây để tránh hai nguồn
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
            pod {session.podName === '' ? 'chưa cấp' : session.podName} · tạo{' '}
            {formatMoment(session.createdAt)}
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
          Kết thúc
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
