'use client';

import type { ReactElement } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { err, t } from '@devops-platform/copy';
import {
  Button,
  ErrorState,
  Meter,
  Num,
  Skeleton,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@devops-platform/ui';
import { Split, numSlot, WithNums } from '../../components/kit';
import { AdminPage } from '../../components/admin/admin-page';
import { HealthPanel } from '../../components/admin/health-panel';
import {
  describeAuditAction,
  describeAuditActor,
  describeAuditTarget,
} from '../../components/admin/audit-row';
import { AuditActor } from '../../components/admin/audit-actor';
import {
  DEFAULT_PROFILE,
  LOW_CAPACITY_RATIO,
  formatFetchedAt,
  readProfileCapacity,
} from '../../components/shell/capacity';
import { useCapacity } from '../../components/shell/use-capacity';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { formatMoment } from '../../lib/format-moment';

/** Số dòng nhật ký ở trang tổng quan. Đủ để thấy "vừa có ai làm gì", không thành bảng thứ hai. */
const RECENT_AUDIT_LIMIT = 5;

/**
 * Thước sức chứa chia ô khi trần nhỏ (đếm được bằng mắt), liền một thanh khi
 * trần lớn: 200 ô 2px ở bề ngang 375px không còn là ô.
 */
const CAPACITY_SEGMENT_MAX = 40;

/**
 * `/admin`, bảng trạng thái (bản dựng lại PTIT).
 *
 * ⛔ Không có hàng thẻ số liệu (design-brief §0 luật 4). Số nằm TRONG câu
 * ("12 phiên đang chạy, còn 18/30 chỗ"), trên một thước chia ô, và trong một
 * ledger nhật ký.
 *
 * ## Sức chứa đọc từ vỏ ứng dụng, KHÔNG gọi `capacity.get` lần nữa
 *
 * `CapacityProvider` của vỏ đã poll 15s một lần và mọi chỗ hiện "còn N chỗ"
 * đều đọc chung state đó. Thêm một `useQuery('capacity.get')` ở đây là hai con
 * số khác nhau trên CÙNG một màn hình. `admin.health` cũng trả `capacity`, và
 * nó cố ý chỉ được dùng cho nội tình pool (`poolFree` / `poolQuarantine`).
 */
export function AdminOverviewClient(): ReactElement {
  return (
    <AdminPage
      kicker={t('admin.overview.kicker')}
      title={t('admin.overview.title')}
      lead={t('admin.overview.lead')}
    >
      <Split index="01" title={t('admin.capacity.title')}>
        <CapacityBoard />
      </Split>
      <Split index="02" title={t('admin.health.title')}>
        <HealthPanel />
      </Split>
      <Split index="03" title={t('admin.overview.recent-title')} aside={t('admin.overview.recent-lead')}>
        <RecentAudit />
      </Split>
    </AdminPage>
  );
}

function CapacityBoard(): ReactElement {
  const { data, error, loading, refetch } = useCapacity();

  if (data === null) {
    // `loading` và `error` là hai chuyện khác nhau: "đang đọc" là tạm thời,
    // "đọc hỏng" đòi người trực làm gì đó.
    return (
      <div className="flex flex-col gap-3">
        {loading ? <Skeleton className="h-9 w-3/4" /> : null}
        <p className="max-w-prose text-sm text-muted-foreground" role="status">
          {loading ? t('admin.capacity.loading') : (error ?? t('admin.capacity.unreadable'))}
        </p>
        <div>
          <Button variant="outline" size="sm" onClick={refetch} loading={loading}>
            {t('admin.capacity.retry')}
          </Button>
        </div>
      </div>
    );
  }

  /*
    Đọc `profile_capacity` (trần TÍNH TỪ ResourceQuota lúc gọi) cho profile MẶC
    ĐỊNH: người trực hỏi "cụm còn chỗ cho bài thường không". Câu ghi rõ "cho bài
    thường" và nhắc bài IDE/K8s có trần riêng, nên số không hứa rộng hơn thứ nó
    biết.

    `level === null` = CHƯA BIẾT (quota đọc lỗi), khác hẳn 0. ⛔ Không lấp bằng
    `softCapacity`: một con số sai ở trang quản trị là một quyết định vận hành
    sai.
  */
  const level = readProfileCapacity(data);
  const slots = data.profileCapacity[DEFAULT_PROFILE];
  const total = slots === undefined ? 0 : Math.max(0, Math.trunc(slots.slotsTotal));
  const at = formatFetchedAt(data.fetchedAt);
  const running = (
    <Num key="running" tone="primary">
      {data.activeSessions}
    </Num>
  );

  return (
    <div className="flex flex-col gap-5">
      {level === null ? (
        <>
          <p className="text-2xl leading-snug text-balance text-foreground md:text-3xl">
            <WithNums
              text={t('admin.overview.board-running', { running: numSlot(0) })}
              nums={[running]}
            />
          </p>
          <p className="max-w-prose text-sm text-muted-foreground">
            {data.quotaError === ''
              ? t('admin.capacity.quota-unreadable')
              : t('admin.capacity.quota-unreadable-reason', { reason: data.quotaError })}
          </p>
        </>
      ) : (
        <>
          <p className="text-2xl leading-snug text-balance text-foreground md:text-3xl">
            <WithNums
              text={t('admin.overview.board-load', {
                running: numSlot(0),
                free: numSlot(1),
                total: numSlot(2),
              })}
              nums={[
                running,
                <Num
                  key="free"
                  tone={level.tone === 'full' ? 'destructive' : level.tone === 'low' ? 'warning' : 'success'}
                >
                  {level.remaining}
                </Num>,
                <Num key="total">{total}</Num>,
              ]}
            />
          </p>
          <Meter
            value={total - level.remaining}
            max={total}
            label={t('admin.capacity.meter-label')}
            tone={level.tone === 'full' ? 'destructive' : level.tone === 'low' ? 'warning' : 'primary'}
            className="h-3"
            {...(total > 0 && total <= CAPACITY_SEGMENT_MAX ? { segments: total } : {})}
          />
          {level.tone === 'full' ? (
            <p className="max-w-prose text-sm font-medium text-destructive">{t('admin.capacity.full')}</p>
          ) : level.tone === 'low' ? (
            <p className="max-w-prose text-sm font-medium text-warning">
              {t('admin.capacity.low', { percent: Math.round(LOW_CAPACITY_RATIO * 100) })}
            </p>
          ) : null}
          <p className="max-w-prose text-sm text-muted-foreground">{t('admin.capacity.profiles-note')}</p>
        </>
      )}

      <p className="font-mono text-xs text-muted-foreground">
        {at === null ? t('admin.capacity.fetched-unknown') : t('admin.capacity.fetched-at', { at })}
      </p>
      {/*
        Lỗi ở lượt đọc GẦN NHẤT khi vẫn còn số cũ: `use-capacity.tsx` cố ý giữ
        `data` qua một lượt hỏng để số không nhấp nháy. Số cũ mà không nói là
        số cũ thì đúng là thứ `green-that-proves-nothing` cảnh báo.
      */}
      {error === null ? null : (
        <p role="status" className="text-sm text-warning">
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
      {/* `asChild` bỏ qua `iconRight` (Radix Slot đòi đúng một con), nên icon nằm trong Link. */}
      <Button asChild variant="outline" size="sm">
        <Link href="/admin/audit">
          {t('admin.overview.recent-link')}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </Button>
    </div>
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {Array.from({ length: RECENT_AUDIT_LIMIT }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    const failure = err('admin.error.audit-list', { reason: describeTrpcError(query.error) });
    return (
      <ErrorState
        title={failure.what}
        message={failure.next}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        retryLabel={t('admin.reload')}
      />
    );
  }

  if (query.data.items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t('admin.overview.recent-empty')}</p>
        {footer}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('admin.audit.col-when')}</TableHead>
            <TableHead>{t('admin.audit.col-action')}</TableHead>
            <TableHead>{t('admin.audit.col-target')}</TableHead>
            <TableHead>{t('admin.audit.col-actor')}</TableHead>
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
                <TableCell className="font-medium">{describeAuditAction(row.action)}</TableCell>
                <TableCell className="font-mono text-xs">
                  {describeAuditTarget(row.targetType, row.targetId)}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  <AuditActor actor={actor} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableCaption>{t('admin.audit.caption')}</TableCaption>
      </Table>
      {footer}
    </div>
  );
}
