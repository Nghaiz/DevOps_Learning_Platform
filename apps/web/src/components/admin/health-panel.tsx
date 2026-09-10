'use client';

import type { ReactElement } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { err, t } from '@devops-platform/copy';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@devops-platform/ui';
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
} from './health-reading';

type HealthOutput = inferRouterOutputs<AppRouter>['admin']['health'];

/**
 * Bảng sức khoẻ của `/admin` (13.G mục 23): pool, claim, reap, exec, đọc từ
 * `/metrics` của orchestrator và gateway qua `admin.health`.
 *
 * ## Không tự động đọc lại
 *
 * Mỗi lượt `admin.health` là HAI lượt HTTP tới hai dịch vụ nội bộ, mỗi lượt
 * timeout 10s. Đặt `refetchInterval` ở đây sẽ biến một tab quản trị để quên
 * thành một máy nện `/metrics` suốt ngày. Người trực bấm "Đọc lại" khi cần, và
 * thời điểm đọc luôn hiện cạnh số liệu để không ai nhầm số cũ với số mới.
 *
 * ## Nguồn hỏng KHÔNG được vẽ như nguồn khoẻ
 *
 * Trên cụm hôm nay `gateway` **được dự kiến** là không với tới được: cổng admin
 * 8083 cố ý không lên Service, và netpol chỉ mở cho ns monitoring (§3bis của
 * exec plan). Đó là thiết kế, không phải hỏng, nhưng nó vẫn phải hiện ra là
 * "chưa đọc được", kèm lý do, chứ không phải một hàng số 0. Toàn bộ phán quyết
 * đó nằm ở `health-reading.ts` (hàm thuần, có test).
 */
export function HealthPanel(): ReactElement {
  const query = api.admin.health.useQuery({});

  if (query.isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.health.title')}</CardTitle>
          <CardDescription>{t('admin.health.loading')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    // Hai nửa của `ErrorEntry` đi vào hai khe khác nhau của `ErrorState`: hỏng
    // cái gì thành tiêu đề, giờ làm gì thành phần thân. Ghép chúng vào một
    // chuỗi ở đây là bỏ đúng sự phân biệt mà tầng kiểu vừa ép ra.
    const failure = err('admin.error.health', { reason: describeTrpcError(query.error) });
    return (
      <ErrorState
        title={failure.what}
        message={failure.next}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  return (
    <HealthPanelBody
      data={query.data}
      fetching={query.isFetching}
      onRefetch={() => void query.refetch()}
    />
  );
}

function HealthPanelBody({
  data,
  fetching,
  onRefetch,
}: {
  readonly data: HealthOutput;
  readonly fetching: boolean;
  readonly onRefetch: () => void;
}): ReactElement {
  // Ép qua kiểu cấu trúc của `health-reading.ts`: nếu BE đổi/bỏ một field thì
  // dòng này đỏ ở typecheck, chứ không âm thầm đọc `undefined` lúc chạy.
  const sources: readonly HealthSourceView[] = data.sources;
  const summary = summarizeHealth(sources);
  const pool = describePool(data.capacity);
  const at = formatFetchedAt(data.fetchedAt);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>{t('admin.health.title')}</CardTitle>
          <CardDescription className="max-w-prose">
            {summary.headline}
            {at === null ? null : t('admin.health.fetched-at', { at })}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onRefetch} loading={fetching}>
          {t('admin.health.refetch')}
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {summary.tone === 'ok' ? null : (
          <Alert variant={summary.tone === 'down' ? 'destructive' : 'warning'}>
            <AlertTitle>
              {summary.tone === 'down'
                ? t('admin.health.alert-down-title')
                : t('admin.health.alert-degraded-title')}
            </AlertTitle>
            <AlertDescription>{summary.headline}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-foreground">{t('admin.health.pool-title')}</h2>
          <p className={pool.known ? 'text-sm text-foreground' : 'text-sm text-muted-foreground'}>
            {pool.text}
          </p>
        </div>

        {sources.map((source) => (
          <SourceBlock key={source.name} source={source} />
        ))}
      </CardContent>
    </Card>
  );
}

function SourceBlock({ source }: { readonly source: HealthSourceView }): ReactElement {
  const reading = describeHealthSource(source);
  const series = orderSeries(source.series);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium text-foreground">{describeSourceName(source.name)}</h2>
        <Badge variant={reading.badgeVariant}>{reading.label}</Badge>
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">{reading.detail}</p>

      {/*
        `hasReadings` chứ không `series.length > 0`: quyết định "có gì để vẽ
        không" thuộc về hàm thuần đã có test, không phải một điều kiện chép tay
        ở JSX, nơi không ai kiểm được nó.

        Bảng nằm trong khối cuộn ngang riêng: tên metric Prometheus dài hơn
        390px là chuyện thường, và ô nghiệm thu §7 mục 1 đòi không màn nào tràn
        ngang ở bề rộng đó. Cuộn cục bộ giữ được cả hai.
      */}
      {reading.hasReadings ? (
        <div className="w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.health.col-metric')}</TableHead>
                <TableHead>{t('admin.health.col-labels')}</TableHead>
                <TableHead className="text-right">{t('admin.health.col-value')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {series.map((entry) => (
                <TableRow key={`${entry.name}|${formatLabels(entry.labels)}`}>
                  <TableCell className="font-mono text-xs">{entry.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatLabels(entry.labels)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMetricValue(entry.value)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </section>
  );
}
