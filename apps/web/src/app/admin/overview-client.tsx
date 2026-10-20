'use client';

import type { ReactElement } from 'react';
import Link from 'next/link';
import { err, t } from '@devops-platform/copy';
import { Button, ErrorBlock, ProgressLine, RowsSkeleton, Section, Skeleton, Table, TBody, TD, TH, THead, TR } from '@devops-platform/ds';
import { AdminPage } from '../../components/admin/admin-page';
import { HealthPanel } from '../../components/admin/health-panel';
import { numSlot, WithNums } from '../../components/admin/with-nums';
import { InlineNum as Num } from '../../components/admin/inline-num';
import { describeAuditAction, describeAuditActor, describeAuditTarget } from '../../components/admin/audit-row';
import { AuditActor } from '../../components/admin/audit-actor';
import { DEFAULT_PROFILE, LOW_CAPACITY_RATIO, formatFetchedAt, readProfileCapacity } from '../../components/shell/capacity';
import { useCapacity } from '../../components/shell/use-capacity';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { formatMoment } from '../../lib/format-moment';

/** Số dòng nhật ký ở trang tổng quan. Đủ để thấy "vừa có ai làm gì", không thành bảng thứ hai. */
const RECENT_AUDIT_LIMIT = 5;

/**
 * `/admin`: bảng trạng thái.
 *
 * ⛔ Không có hàng ô số liệu. Số nằm TRONG câu ("12 phiên đang chạy, còn 18/30 chỗ"),
 * trên một thước, và trong bảng nhật ký.
 *
 * ## Sức chứa đọc từ vỏ ứng dụng, KHÔNG gọi `capacity.get` lần nữa
 *
 * `CapacityProvider` của vỏ đã poll 15s một lần và mọi chỗ hiện "còn N chỗ" đều đọc
 * chung state đó. Thêm một `useQuery('capacity.get')` ở đây là hai con số khác nhau trên
 * CÙNG một màn hình. `admin.health` cũng trả `capacity`, và nó cố ý chỉ được dùng cho
 * nội tình pool (`poolFree` / `poolQuarantine`).
 */
export function AdminOverviewClient(): ReactElement {
  return (
    <AdminPage title={t('admin.overview.title')} lead={t('admin.overview.lead')}>
      <div className="flex flex-col gap-14">
        <Section title={t('admin.capacity.title')} icon="server">
          <CapacityBoard />
        </Section>
        <Section title={t('admin.health.title')} icon="activity">
          <HealthPanel />
        </Section>
        <Section title={t('admin.overview.recent-title')} description={t('admin.overview.recent-lead')} icon="history">
          <RecentAudit />
        </Section>
      </div>
    </AdminPage>
  );
}

function CapacityBoard(): ReactElement {
  const { data, error, loading, refetch } = useCapacity();

  if (data === null) {
    // `loading` và `error` là hai chuyện khác nhau: "đang đọc" là tạm thời, "đọc hỏng"
    // đòi người trực làm gì đó.
    return (
      <div className="flex flex-col gap-3">
        {loading ? <Skeleton className="h-9 w-3/4" /> : null}
        <p className="max-w-prose text-sm text-ink-2" role="status">
          {loading ? t('admin.capacity.loading') : (error ?? t('admin.capacity.unreadable'))}
        </p>
        <div>
          <Button variant="secondary" size="sm" icon="refresh" onClick={refetch} loading={loading}>
            {t('admin.capacity.retry')}
          </Button>
        </div>
      </div>
    );
  }

  /*
    Đọc `profile_capacity` (trần TÍNH TỪ ResourceQuota lúc gọi) cho profile MẶC ĐỊNH:
    người trực hỏi "cụm còn chỗ cho bài thường không". Câu ghi rõ "cho bài thường" và nhắc
    bài IDE/K8s có trần riêng, nên số không hứa rộng hơn thứ nó biết.

    `level === null` = CHƯA BIẾT (quota đọc lỗi), khác hẳn 0. ⛔ Không lấp bằng
    `softCapacity`: một con số sai ở trang quản trị là một quyết định vận hành sai.
  */
  const level = readProfileCapacity(data);
  const slots = data.profileCapacity[DEFAULT_PROFILE];
  const total = slots === undefined ? 0 : Math.max(0, Math.trunc(slots.slotsTotal));
  const at = formatFetchedAt(data.fetchedAt);
  const running = (
    <Num key="running" tone="acc">
      {data.activeSessions}
    </Num>
  );

  return (
    <div className="flex flex-col gap-5">
      {level === null ? (
        <>
          <p className="text-2xl leading-snug text-balance text-ink md:text-3xl">
            <WithNums text={t('admin.overview.board-running', { running: numSlot(0) })} nums={[running]} />
          </p>
          <p className="max-w-prose text-sm text-ink-2">
            {data.quotaError === ''
              ? t('admin.capacity.quota-unreadable')
              : t('admin.capacity.quota-unreadable-reason', { reason: data.quotaError })}
          </p>
        </>
      ) : (
        <>
          <p className="text-2xl leading-snug text-balance text-ink md:text-3xl">
            <WithNums
              text={t('admin.overview.board-load', { running: numSlot(0), free: numSlot(1), total: numSlot(2) })}
              nums={[
                running,
                <Num key="free" tone={level.tone === 'full' ? 'bad' : level.tone === 'low' ? 'warn' : 'ok'}>
                  {level.remaining}
                </Num>,
                <Num key="total">{total}</Num>,
              ]}
            />
          </p>
          <ProgressLine
            value={total === 0 ? 0 : (total - level.remaining) / total}
            role="meter"
            size="md"
            label={t('admin.capacity.meter-label')}
            tone={level.tone === 'full' ? 'bad' : level.tone === 'low' ? 'warn' : 'acc'}
            className="max-w-xl"
          />
          {level.tone === 'full' ? (
            <p className="max-w-prose text-sm font-medium text-bad-ink">{t('admin.capacity.full')}</p>
          ) : level.tone === 'low' ? (
            <p className="max-w-prose text-sm font-medium text-warn-ink">
              {t('admin.capacity.low', { percent: Math.round(LOW_CAPACITY_RATIO * 100) })}
            </p>
          ) : null}
          <p className="max-w-prose text-sm text-ink-2">{t('admin.capacity.profiles-note')}</p>
        </>
      )}

      <p className="text-xs tabular-nums text-ink-3">
        {at === null ? t('admin.capacity.fetched-unknown') : t('admin.capacity.fetched-at', { at })}
      </p>
      {/*
        Lỗi ở lượt đọc GẦN NHẤT khi vẫn còn số cũ: `use-capacity.tsx` cố ý giữ `data` qua
        một lượt hỏng để số không nhấp nháy. Số cũ mà không nói là số cũ thì đúng là thứ
        `green-that-proves-nothing` cảnh báo.
      */}
      {error === null ? null : (
        <p role="status" className="text-sm text-warn-ink">
          {t('admin.capacity.stale', { reason: error })}
        </p>
      )}
    </div>
  );
}

function RecentAudit(): ReactElement {
  const query = api.admin.audit.list.useQuery({ limit: RECENT_AUDIT_LIMIT });

  const footer = (
    <div>
      <Button asChild variant="secondary" size="sm" iconRight="arrow-right">
        <Link href="/admin/audit">{t('admin.overview.recent-link')}</Link>
      </Button>
    </div>
  );

  if (query.isPending) {
    return <RowsSkeleton rows={RECENT_AUDIT_LIMIT} label={t('admin.loading')} />;
  }

  if (query.isError) {
    const failure = err('admin.error.audit-list', { reason: describeTrpcError(query.error) });
    return (
      <ErrorBlock title={failure.what} onRetry={() => void query.refetch()} retrying={query.isFetching} retryLabel={t('admin.reload')}>
        {failure.next}
      </ErrorBlock>
    );
  }

  if (query.data.items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">{t('admin.overview.recent-empty')}</p>
        {footer}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Table label={t('admin.audit.caption')}>
        <THead>
          <tr>
            <TH>{t('admin.audit.col-when')}</TH>
            <TH>{t('admin.audit.col-action')}</TH>
            <TH>{t('admin.audit.col-target')}</TH>
            <TH>{t('admin.audit.col-actor')}</TH>
          </tr>
        </THead>
        <TBody>
          {query.data.items.map((row) => {
            const actor = describeAuditActor(row.actorId);
            return (
              <TR key={row.id}>
                <TD className="whitespace-nowrap text-xs tabular-nums text-ink-2">{formatMoment(row.occurredAt)}</TD>
                <TD className="font-medium">{describeAuditAction(row.action)}</TD>
                <TD className="font-mono text-xs">{describeAuditTarget(row.targetType, row.targetId)}</TD>
                <TD className="text-xs">
                  <AuditActor actor={actor} />
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      {footer}
    </div>
  );
}
