'use client';

import { useState, type ReactElement } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  CursorPager,
  EmptyState,
  ErrorState,
  Skeleton,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@devops-platform/ui';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { AdminNote, AdminSection } from '../../../components/admin/admin-section';
import {
  describeAuditAction,
  describeAuditActor,
  describeAuditDetail,
  describeAuditTarget,
} from '../../../components/admin/audit-row';
import { formatMoment } from '../../../lib/format-moment';
import {
  FIRST_PAGE,
  currentCursor,
  pageNumber,
  pushCursor,
  type CursorStack,
} from '../../../lib/cursor-stack';

/**
 * `/admin/audit` (13.G mục 24) — nhật ký hành động quản trị, mới nhất trước.
 *
 * ## Bảng này chỉ ghi thêm, không sửa, không xoá
 *
 * Không có nút nào ở đây, và đó là chủ ý: một nhật ký sửa được là một nhật ký
 * không dùng để đối chiếu được. `admin_audit` cũng cố ý KHÔNG có khoá ngoại tới
 * `users` — nhật ký sống lâu hơn tài khoản — nên một dòng có thể nêu một id
 * không còn tra ngược ra người nào. `describeAuditActor` hiện đúng id đó kèm lý
 * do, thay vì để trống.
 *
 * ## Đây KHÔNG phải toàn bộ nhật ký của hệ thống
 *
 * `sessions_audit` (orchestrator ghi) là bảng thứ hai, và hai bảng biết hai
 * chuyện khác nhau: `sessions_audit` không biết tới vai trò, còn `admin_audit`
 * không biết phiên đó có thật sự chết hay không. Dải cảnh báo dưới đây nói ra
 * điều đó, để không ai đọc trang này rồi kết luận về những gì nó không thấy.
 */
export function AdminAuditClient(): ReactElement {
  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);
  const cursor = currentCursor(stack);
  const query = api.admin.audit.list.useQuery(cursor === undefined ? {} : { cursor });

  return (
    <AdminSection
      title="Nhật ký quản trị"
      description="Đổi vai trò và kết thúc phiên — mới nhất trước. Chỉ ghi thêm, không sửa được."
    >
      <Alert>
        <AlertTitle>Đây là một nửa của nhật ký</AlertTitle>
        <AlertDescription>
          Bảng này ghi hành động của quản trị viên phía ứng dụng. Orchestrator ghi riêng
          `sessions_audit` cho mỗi lần thu hồi pod. Hai bảng biết hai chuyện khác nhau: bảng kia
          không biết tới vai trò, bảng này không biết phiên có thật sự chết hay không.
        </AlertDescription>
      </Alert>

      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <ErrorState
          title="Không tải được nhật ký"
          message={`${describeTrpcError(query.error)} Nếu lỗi nói về cursor, bấm "Về đầu" — một dòng nhật ký không biến mất, nhưng cursor cũ có thể đã hết hiệu lực.`}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          title="Chưa có hành động quản trị nào"
          description="Chưa ai đổi vai trò hay kết thúc phiên của người khác. Bảng trống ở đây nghĩa là chưa có việc gì xảy ra, không phải nhật ký hỏng."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thời điểm</TableHead>
                <TableHead>Người thực hiện</TableHead>
                <TableHead>Hành động</TableHead>
                <TableHead>Đối tượng</TableHead>
                <TableHead>Chi tiết</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((row) => {
                const actor = describeAuditActor(row.actorId);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      {formatMoment(row.occurredAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs" title={actor.note}>
                      {actor.text}
                    </TableCell>
                    <TableCell className="text-sm">{describeAuditAction(row.action)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {describeAuditTarget(row.targetType, row.targetId)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {describeAuditDetail(row.action, row.detail)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableCaption>
              Cột &quot;Người thực hiện&quot; chỉ có id: bảng nhật ký cố ý không tham chiếu tới bảng
              người dùng, nên một tài khoản đã xoá vẫn để lại id ở đây.
            </TableCaption>
          </Table>

          <AdminNote>
            Đang xem {query.data.items.length} dòng ở trang {pageNumber(stack)}
            {query.data.nextCursor != null ? ' — còn trang sau.' : ' — đây là trang cuối.'}
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
