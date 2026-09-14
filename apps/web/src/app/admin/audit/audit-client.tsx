'use client';

import { useState, type ReactElement } from 'react';
import { err, t } from '@devops-platform/copy';
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
 * `users` (nhật ký sống lâu hơn tài khoản), nên một dòng có thể nêu một id
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
    <AdminSection title={t('admin.audit.title')} description={t('admin.audit.description')}>
      <Alert>
        <AlertTitle as="h2">{t('admin.audit.alert-title')}</AlertTitle>
        <AlertDescription>{t('admin.audit.alert-body')}</AlertDescription>
      </Alert>

      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <AuditError
          reason={describeTrpcError(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          title={t('admin.audit.empty-title')}
          description={t('admin.audit.empty-body')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {/*
            Năm cột id dài trên một màn 390px: cuộn ngang cục bộ giữ bảng đọc
            được mà không để cả trang trôi ngang (ô nghiệm thu §7 mục 1).
          */}
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.audit.col-when')}</TableHead>
                  <TableHead>{t('admin.audit.col-actor')}</TableHead>
                  <TableHead>{t('admin.audit.col-action')}</TableHead>
                  <TableHead>{t('admin.audit.col-target')}</TableHead>
                  <TableHead>{t('admin.audit.col-detail')}</TableHead>
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
              <TableCaption>{t('admin.audit.caption')}</TableCaption>
            </Table>
          </div>

          <AdminNote>
            {t('admin.audit.note', {
              count: query.data.items.length,
              page: pageNumber(stack),
            })}
            {query.data.nextCursor != null
              ? t('admin.audit.note-more')
              : t('admin.audit.note-last')}
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

/**
 * Hai nửa của `ErrorEntry` vào hai khe của `ErrorState`.
 *
 * Tách thành component riêng chứ không gọi `err()` giữa một biểu thức ba ngôi
 * ba tầng: một lời gọi hàm nhét vào giữa nhánh `isError` sẽ chạy ở MỌI lượt
 * render, kể cả lượt `isPending`, và `query.error` lúc đó là `null`.
 */
function AuditError({
  reason,
  onRetry,
  retrying,
}: {
  readonly reason: string;
  readonly onRetry: () => void;
  readonly retrying: boolean;
}): ReactElement {
  const failure = err('admin.error.audit-list', { reason });
  return (
    <ErrorState title={failure.what} message={failure.next} onRetry={onRetry} retrying={retrying} />
  );
}
