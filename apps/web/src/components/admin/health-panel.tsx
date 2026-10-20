'use client';

import type { ReactElement } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { err, t } from '@devops-platform/copy';
import { Button, ErrorBlock, Notice, Skeleton, Table, TBody, TD, TH, THead, TR, cn } from '@devops-platform/ds';
import type { AppRouter } from '../../server/trpc/routers/app-router';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { formatFetchedAt } from '../shell/capacity';
import {
  describeHealthSource,
  describePool,
  describeSourceName,
  formatLabels,
  formatMetricValue,
  orderSeries,
  summarizeHealth,
  type HealthSourceView,
  type HealthTone,
} from './health-reading';
import { InlineNum } from './inline-num';
import { numSlot, WithNums } from './with-nums';

type HealthOutput = inferRouterOutputs<AppRouter>['admin']['health'];

/**
 * Phần "Sức khoẻ nền tảng" của `/admin`: pool pod ấm thành một thước chia đoạn (sẵn sàng /
 * cách ly), rồi từng nguồn metric với chấm trạng thái, số liệu thô gập trong một khối mở
 * được.
 *
 * ## Không tự động đọc lại
 *
 * Mỗi lượt `admin.health` là HAI lượt HTTP tới hai dịch vụ nội bộ, mỗi lượt timeout 10s.
 * `refetchInterval` ở đây biến một tab quản trị để quên thành một máy nện `/metrics` suốt
 * ngày. Người trực bấm "Đọc lại", và thời điểm đọc luôn hiện cạnh số liệu để không ai nhầm
 * số cũ với số mới.
 *
 * ## Nguồn hỏng KHÔNG được vẽ như nguồn khoẻ
 *
 * Trên cụm hôm nay `gateway` **được dự kiến** là không với tới được (cổng admin 8083 không
 * lên Service, netpol chỉ mở cho ns monitoring). Đó là thiết kế, nhưng nó vẫn phải hiện ra
 * là "chưa đọc được" kèm lý do, không phải một hàng số 0. Toàn bộ phán quyết nằm ở
 * `health-reading.ts` (hàm thuần, có test).
 */
export function HealthPanel(): ReactElement {
  const query = api.admin.health.useQuery({});

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <p className="text-sm text-ink-2">{t('admin.health.loading')}</p>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (query.isError) {
    const failure = err('admin.error.health', { reason: describeTrpcError(query.error) });
    return (
      <ErrorBlock title={failure.what} onRetry={() => void query.refetch()} retrying={query.isFetching} retryLabel={t('admin.reload')}>
        {failure.next}
      </ErrorBlock>
    );
  }

  return <HealthBody data={query.data} fetching={query.isFetching} onRefetch={() => void query.refetch()} />;
}

function HealthBody({
  data,
  fetching,
  onRefetch,
}: {
  readonly data: HealthOutput;
  readonly fetching: boolean;
  readonly onRefetch: () => void;
}): ReactElement {
  // Ép qua kiểu cấu trúc của `health-reading.ts`: BE đổi/bỏ một field thì dòng này đỏ ở
  // typecheck, chứ không âm thầm đọc `undefined` lúc chạy.
  const sources: readonly HealthSourceView[] = data.sources;
  const summary = summarizeHealth(sources);
  const at = formatFetchedAt(data.fetchedAt);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-prose flex-col gap-1">
          <p className="text-base text-ink">{summary.headline}</p>
          {at === null ? null : <p className="text-xs tabular-nums text-ink-3">{t('admin.health.fetched-at', { at })}</p>}
        </div>
        <Button variant="secondary" size="sm" icon="refresh" onClick={onRefetch} loading={fetching}>
          {t('admin.health.refetch')}
        </Button>
      </div>

      {summary.tone === 'ok' ? null : (
        <Notice
          tone={summary.tone === 'down' ? 'bad' : 'warn'}
          title={summary.tone === 'down' ? t('admin.health.alert-down-title') : t('admin.health.alert-degraded-title')}
        >
          {summary.headline}
        </Notice>
      )}

      <PoolBlock capacity={data.capacity} />

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-ink">{t('admin.health.sources-title')}</h3>
        <ul className="flex flex-col border-t border-rule">
          {sources.map((source) => (
            <SourceRow key={source.name} source={source} />
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Trần số ô của thước pool. Pool ấm ở quy mô NCKH là vài pod; quá trần thì thước chuyển
 * sang hai khối tỉ lệ, vì vài trăm ô 2px không còn đếm được bằng mắt và chỉ làm vỡ bố cục ở
 * 375px.
 */
const POOL_GAUGE_MAX_CELLS = 48;

function PoolBlock({
  capacity,
}: {
  readonly capacity: { readonly poolFree: number; readonly poolQuarantine: number } | null;
}): ReactElement {
  // `describePool` là phán quyết "biết hay không biết"; câu của nó cũng là tên trợ năng
  // của thước, nên trình đọc màn hình nghe đúng câu đã được test.
  const reading = describePool(capacity);

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-ink">{t('admin.health.pool-title')}</h3>
      {capacity === null || !reading.known ? (
        <p className="max-w-prose text-sm text-ink-2">{reading.text}</p>
      ) : (
        <>
          <p className="text-lg text-ink">
            <WithNums
              text={t('admin.health.pool-sentence', { free: numSlot(0), quarantine: numSlot(1) })}
              nums={[
                <InlineNum key="free" tone={capacity.poolFree === 0 ? 'warn' : 'ok'}>
                  {capacity.poolFree}
                </InlineNum>,
                <InlineNum key="quarantine" tone={capacity.poolQuarantine > 0 ? 'warn' : 'ink'}>
                  {capacity.poolQuarantine}
                </InlineNum>,
              ]}
            />
          </p>
          <PoolGauge free={capacity.poolFree} quarantine={capacity.poolQuarantine} label={reading.text} />
          {capacity.poolFree === 0 ? <p className="max-w-prose text-sm text-warn-ink">{t('admin.health.pool-dry')}</p> : null}
        </>
      )}
    </section>
  );
}

/**
 * Thước hai phần: ô xanh là pod ấm sẵn sàng, ô vàng là pod đang cách ly.
 *
 * `role="img"` + `aria-label` là câu đầy đủ: các ô bên trong là hình vẽ thuần, và câu
 * ngay phía trên đã nói bằng chữ. Pool là HAI tập rời nhau, không có trần chung nào để
 * chia, nên đây không phải thước một giá trị.
 */
function PoolGauge({ free, quarantine, label }: { readonly free: number; readonly quarantine: number; readonly label: string }): ReactElement {
  const total = free + quarantine;
  const cells = total > 0 && total <= POOL_GAUGE_MAX_CELLS;

  return (
    <div className="flex max-w-xl flex-col gap-2">
      <div role="img" aria-label={label} className="flex h-3 w-full gap-1 overflow-hidden rounded-full bg-well-2">
        {total === 0 ? null : cells ? (
          Array.from({ length: total }, (_, index) => (
            <span key={index} className={cn('h-full flex-1 rounded-full', index < free ? 'bg-ok-solid' : 'bg-warn-solid')} />
          ))
        ) : (
          <>
            <span className="h-full rounded-full bg-ok-solid" style={{ flexGrow: free }} />
            <span className="h-full rounded-full bg-warn-solid" style={{ flexGrow: quarantine }} />
          </>
        )}
      </div>
      <ul aria-hidden="true" className="flex flex-wrap gap-4 text-xs text-ink-2">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-ok-solid" />
          {t('admin.health.pool-free')}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-warn-solid" />
          {t('admin.health.pool-quarantine')}
        </li>
      </ul>
    </div>
  );
}

const SOURCE_DOT: Readonly<Record<HealthTone, string>> = {
  ok: 'bg-ok-solid',
  unhealthy: 'bg-warn-solid',
  unreachable: 'bg-bad-solid',
};

function SourceRow({ source }: { readonly source: HealthSourceView }): ReactElement {
  const reading = describeHealthSource(source);
  const series = orderSeries(source.series);

  return (
    <li className="flex flex-col gap-2 border-b border-rule py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span aria-hidden="true" className={cn('size-2.5 rounded-full', SOURCE_DOT[reading.tone], reading.tone === 'ok' && 'animate-breathe')} />
        <span className="font-medium text-ink">{describeSourceName(source.name)}</span>
        <span className="text-xs text-ink-3">{reading.label}</span>
      </div>
      <p className="max-w-prose text-sm text-ink-2">{reading.detail}</p>

      {/*
        `hasReadings` chứ không `series.length > 0`: quyết định "có gì để vẽ không" thuộc
        về hàm thuần đã có test. Bảng gập sẵn: vài chục dòng Prometheus đẩy cả phần nhật ký
        xuống quá một màn, trong khi câu tóm tắt bên trên đã trả lời điều người trực cần biết.
      */}
      {reading.hasReadings ? (
        <details className="group">
          <summary className="w-fit cursor-pointer text-xs font-medium text-acc-ink underline-offset-4 hover:underline">
            {t('admin.health.series-toggle', { count: series.length })}
          </summary>
          <div className="mt-3">
            <Table>
              <THead>
                <tr>
                  <TH>{t('admin.health.col-metric')}</TH>
                  <TH>{t('admin.health.col-labels')}</TH>
                  <TH numeric>{t('admin.health.col-value')}</TH>
                </tr>
              </THead>
              <TBody>
                {series.map((entry) => (
                  <TR key={`${entry.name}|${formatLabels(entry.labels)}`}>
                    <TD className="font-mono text-xs">{entry.name}</TD>
                    <TD className="font-mono text-xs text-ink-2">{formatLabels(entry.labels)}</TD>
                    <TD numeric className="font-mono">
                      {formatMetricValue(entry.value)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </details>
      ) : null}
    </li>
  );
}
