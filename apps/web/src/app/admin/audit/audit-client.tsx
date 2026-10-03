'use client';

import { useState, type ReactElement } from 'react';
import { err, t } from '@devops-platform/copy';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  CursorPager,
  EmptyState,
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
import {
  AdminNote,
  AdminPage,
  FirstPageButton,
  LedgerError,
  LedgerSkeleton,
} from '../../../components/admin/admin-page';
import {
  describeAuditAction,
  describeAuditActor,
  describeAuditDetail,
  describeAuditTarget,
} from '../../../components/admin/audit-row';
import { AuditActor } from '../../../components/admin/audit-actor';
import { formatMoment } from '../../../lib/format-moment';
import {
  FIRST_PAGE,
  currentCursor,
  pageNumber,
  pushCursor,
  type CursorStack,
} from '../../../lib/cursor-stack';

/**
 * `/admin/audit`: nhật ký hành động quản trị, mới nhất trước.
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
 * chuyện khác nhau. Dải cảnh báo dưới đây nói ra điều đó, để không ai đọc
 * trang này rồi kết luận về những gì nó không thấy.
 */
export function AdminAuditClient(): ReactElement {
  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);
  const cursor = currentCursor(stack);
  const query = api.admin.audit.list.useQuery(cursor === undefined ? {} : { cursor });

  return (
    <AdminPage
      kicker={t('admin.audit.kicker')}
      title={t('admin.audit.title')}
      lead={t('admin.audit.lead')}
    >
      <div className="flex flex-col gap-6 pt-10">
        <Alert>
          <AlertTitle as="h2">{t('admin.audit.alert-title')}</AlertTitle>
          <AlertDescription>{t('admin.audit.alert-body')}</AlertDescription>
        </Alert>

        {query.isPending ? (
          <LedgerSkeleton />
        ) : query.isError ? (
          <LedgerError
            failure={err('admin.error.audit-list', { reason: describeTrpcError(query.error) })}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            page={pageNumber(stack)}
            onFirst={() => setStack(FIRST_PAGE)}
          />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            title={t('admin.audit.empty-title')}
            description={t('admin.audit.empty-body')}
            {...(pageNumber(stack) > 1
              ? { action: <FirstPageButton page={pageNumber(stack)} onFirst={() => setStack(FIRST_PAGE)} /> }
              : {})}
          />
        ) : (
          <div className="flex flex-col gap-4">
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
                      <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                        {formatMoment(row.occurredAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <AuditActor actor={actor} />
                      </TableCell>
                      <TableCell className="font-medium">{describeAuditAction(row.action)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {describeAuditTarget(row.targetType, row.targetId)}
                      </TableCell>
                      <TableCell className="max-w-md text-sm break-words text-muted-foreground">
                        {describeAuditDetail(row.action, row.detail)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableCaption>{t('admin.audit.caption')}</TableCaption>
            </Table>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <AdminNote>
                {t('admin.audit.note', {
                  count: query.data.items.length,
                  page: pageNumber(stack),
                })}
                {query.data.nextCursor != null ? t('admin.audit.note-more') : t('admin.audit.note-last')}
              </AdminNote>
              <CursorPager
                hasNext={query.data.nextCursor != null}
                onNext={() => setStack((prev) => pushCursor(prev, query.data.nextCursor))}
                onReset={() => setStack(FIRST_PAGE)}
                page={pageNumber(stack)}
                loading={query.isFetching}
              />
            </div>
          </div>
        )}
      </div>
    </AdminPage>
  );
}

