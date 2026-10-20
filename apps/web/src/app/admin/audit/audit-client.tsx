'use client';

import {
  useState,
  type ReactElement } from 'react';
import { err,
  t } from '@devops-platform/copy';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import {
  AdminNote,
  AdminPage,
  FirstPageButton,
  LedgerError,
  LedgerSkeleton,
  AdminPager,
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
  popCursor,
  pushCursor,
  type CursorStack,
} from '../../../lib/cursor-stack';
import { Empty, Notice, Table, TBody, TD, TH, THead, TR } from '@devops-platform/ds';

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
    <AdminPage title={t('admin.audit.title')} lead={t('admin.audit.lead')}>
      <div className="flex flex-col gap-6">
        <Notice tone="info" title={t('admin.audit.alert-title')}>{t('admin.audit.alert-body')}</Notice>

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
          <Empty title={t('admin.audit.empty-title')} {...(pageNumber(stack) > 1
              ? { action: <FirstPageButton page={pageNumber(stack)} onFirst={() => setStack(FIRST_PAGE)} /> }
              : {})}>{t('admin.audit.empty-body')}</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            <Table label={t('admin.audit.table-label')}>
              <THead>
                <tr>
                  <TH>{t('admin.audit.col-when')}</TH>
                  <TH>{t('admin.audit.col-actor')}</TH>
                  <TH>{t('admin.audit.col-action')}</TH>
                  <TH>{t('admin.audit.col-target')}</TH>
                  <TH>{t('admin.audit.col-detail')}</TH>
                </tr>
              </THead>
              <TBody>
                {query.data.items.map((row) => {
                  const actor = describeAuditActor(row.actorId);
                  return (
                    <TR key={row.id}>
                      <TD className="whitespace-nowrap text-xs tabular-nums text-ink-2">
                        {formatMoment(row.occurredAt)}
                      </TD>
                      <TD className="font-mono text-xs">
                        <AuditActor actor={actor} />
                      </TD>
                      <TD className="font-medium">{describeAuditAction(row.action)}</TD>
                      <TD className="font-mono text-xs">
                        {describeAuditTarget(row.targetType, row.targetId)}
                      </TD>
                      <TD className="max-w-md text-sm break-words text-ink-2">
                        {describeAuditDetail(row.action, row.detail)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>

            <AdminNote>{t('admin.audit.caption')}</AdminNote>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <AdminNote>
                {t('admin.audit.note', {
                  count: query.data.items.length,
                  page: pageNumber(stack),
                })}
                {query.data.nextCursor != null ? t('admin.audit.note-more') : t('admin.audit.note-last')}
              </AdminNote>
              <AdminPager page={pageNumber(stack)} hasNext={query.data.nextCursor != null} loading={query.isFetching} onNext={() => setStack((prev) => pushCursor(prev, query.data.nextCursor))} onFirst={() => setStack(FIRST_PAGE)} onPrevious={() => setStack(popCursor)} />
            </div>
          </div>
        )}
      </div>
    </AdminPage>
  );
}

