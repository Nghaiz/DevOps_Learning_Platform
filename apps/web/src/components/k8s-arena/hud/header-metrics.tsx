'use client';

import { type ReactElement } from 'react';
import { cn } from '@devops-platform/ui';
import type { ClusterView } from '@devops-platform/games';
import { sampleFrom } from './metrics-history';
import type { MetricSample } from './metrics-history.ts';

/**
 * Dải số liệu trên thanh trên cùng.
 *
 * ## Vì sao nó ở ĐÂY chứ không ở bảng bật/tắt dưới đáy
 *
 * Bản trước, số liệu duy nhất nằm trong một bảng nổi mở bằng phím `M` — nghĩa là
 * mặc định người chơi KHÔNG thấy tải của cụm mình vừa dựng. Thanh trên cùng thì
 * ngược lại: nó là dải duy nhất canvas không chiếm, luôn hiện, và mắt đã quen
 * liếc lên đó để đọc trạng thái. Chỗ ấy trước đây đang bị hai thứ chiếm mà không
 * nói được gì:
 *
 * - **Ba ngôi sao** — điểm sao chỉ khác 0 SAU khi thắng, nên suốt cả ván nó là ba
 *   ô xám cố định. Một khoảng màn hình luôn hiện, không bao giờ đổi.
 * - **Thanh tiến độ** — lặp lại đúng con số `x/y` ngay bên cạnh nó, và lặp lại
 *   lần nữa danh sách mục tiêu trong thẻ nhiệm vụ ở ngay dưới.
 *
 * Cả hai đã gỡ; chỗ đó nay là thứ đổi theo từng tick.
 *
 * ## Vì sao có đồ thị tí hon
 *
 * Một con số phần trăm trả lời "bây giờ bao nhiêu" nhưng không trả lời "đang lên
 * hay đang xuống" — mà với một cụm đang co giãn thì câu thứ hai mới là câu người
 * chơi cần. Đường tí hon 40×16 px trả lời nó mà không tốn thêm một dòng nào.
 */
export interface HeaderMetricsProps {
  readonly view: ClusterView;
  readonly history: readonly MetricSample[];
  /** Mở bảng số liệu đầy đủ. Dải này là bản tóm tắt, không phải bản thay thế. */
  readonly onOpenMetrics: () => void;
}

/** Ngưỡng đổi màu, dùng chung cho mọi ô phần trăm. */
const WARN_AT = 0.7;
const CRIT_AT = 0.88;

function loadToken(value: number): string {
  if (value >= CRIT_AT) return 'text-destructive';
  if (value >= WARN_AT) return 'text-warning';
  return 'text-status-progress';
}

function loadStroke(value: number): string {
  if (value >= CRIT_AT) return 'var(--destructive)';
  if (value >= WARN_AT) return 'var(--warning)';
  return 'var(--status-progress)';
}

export function HeaderMetrics({ view, history, onOpenMetrics }: HeaderMetricsProps): ReactElement {
  const latest = sampleFrom(view);
  const cpu = latest?.cpu ?? 0;
  const memory = latest?.memory ?? 0;

  let running = 0;
  let pending = 0;
  let failing = 0;
  let pods = 0;
  for (const object of view.objects) {
    if (object.kind !== 'Pod') continue;
    pods += 1;
    if (object.statusToken === 'success') running += 1;
    else if (object.statusToken === 'status-progress') pending += 1;
    else if (object.statusToken === 'destructive' || object.statusToken === 'warning') failing += 1;
  }
  const nodesReady = view.nodes.filter((node) => node.ready).length;
  const activeIncidents = view.incidents.filter((i) => i.resolvedTick === null).length;

  return (
    <button
      type="button"
      onClick={onOpenMetrics}
      aria-label="Số liệu cụm — mở bảng đầy đủ"
      className={cn(
        'arena-header-metrics group flex min-w-0 items-center gap-4 rounded-md px-2 py-1',
        'outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <Gauge label="CPU" value={cpu} series={history.map((s) => s.cpu)} />
      <Gauge label="RAM" value={memory} series={history.map((s) => s.memory)} />

      <Cell label="POD">
        <span className="flex items-baseline gap-1.5 font-mono text-xs font-semibold">
          <Dot className="bg-success" />
          <span className="text-foreground">{running}</span>
          {pending === 0 ? null : (
            <>
              <Dot className="bg-status-progress" />
              <span className="text-status-progress">{pending}</span>
            </>
          )}
          {failing === 0 ? null : (
            <>
              <Dot className="bg-destructive" />
              <span className="text-destructive">{failing}</span>
            </>
          )}
          {pods === running && pending === 0 && failing === 0 ? null : (
            <span className="text-muted-foreground">/{pods}</span>
          )}
        </span>
      </Cell>

      <Cell label="NODE">
        <span
          className={cn(
            'font-mono text-xs font-semibold',
            nodesReady === view.nodes.length ? 'text-foreground' : 'text-destructive',
          )}
        >
          {nodesReady}/{view.nodes.length}
        </span>
      </Cell>

      {activeIncidents === 0 ? null : (
        <Cell label="SỰ CỐ">
          <span className="font-mono text-xs font-semibold text-destructive">
            {activeIncidents}
          </span>
        </Cell>
      )}
    </button>
  );
}

function Cell({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactElement;
}): ReactElement {
  return (
    <span className="flex flex-col items-start gap-px leading-none">
      <span className="font-mono text-[9px] font-semibold tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {children}
    </span>
  );
}

function Dot({ className }: { readonly className: string }): ReactElement {
  return <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', className)} />;
}

/** Ô phần trăm kèm đường tí hon. `series` rỗng thì chỉ còn con số. */
function Gauge({
  label,
  value,
  series,
}: {
  readonly label: string;
  readonly value: number;
  readonly series: readonly number[];
}): ReactElement {
  return (
    <span className="flex items-center gap-1.5">
      <Cell label={label}>
        <span className={cn('font-mono text-xs font-semibold', loadToken(value))}>
          {Math.round(value * 100)}%
        </span>
      </Cell>
      <Spark values={series} stroke={loadStroke(value)} />
    </span>
  );
}

const SPARK_W = 40;
const SPARK_H = 16;
/** Số mẫu cuối được vẽ. Nhiều hơn thì mỗi mẫu hẹp dưới một pixel và đường thành một vệt. */
const SPARK_POINTS = 24;

/**
 * Đường tí hon, vẽ bằng SVG.
 *
 * SVG chứ không canvas: ở 40×16 px thì chi phí một `<polyline>` nhỏ hơn chi phí
 * dựng và đồng bộ một canvas theo `devicePixelRatio`, và nó nét ở mọi mật độ
 * điểm ảnh mà không cần làm gì thêm.
 *
 * ⛔ Trục tung LUÔN là 0..1, không tự co theo dữ liệu. Đồ thị tự co làm một cụm
 * nhàn rỗi dao động quanh 3% trông y hệt một cụm sắp chết ở 95% — đúng cái bẫy
 * "đường đẹp, nghĩa sai" mà một dải liếc-mắt-là-đọc không được phép có.
 */
function Spark({
  values,
  stroke,
}: {
  readonly values: readonly number[];
  readonly stroke: string;
}): ReactElement | null {
  const tail = values.slice(-SPARK_POINTS);
  if (tail.length < 2) {
    return (
      <span aria-hidden className="inline-block" style={{ width: SPARK_W, height: SPARK_H }} />
    );
  }
  const step = SPARK_W / (tail.length - 1);
  const points = tail
    .map(
      (v, i) =>
        `${(i * step).toFixed(1)},${(SPARK_H - Math.min(1, Math.max(0, v)) * SPARK_H).toFixed(1)}`,
    )
    .join(' ');
  const headY = SPARK_H - Math.min(1, Math.max(0, tail[tail.length - 1] ?? 0)) * SPARK_H;

  return (
    <svg
      aria-hidden
      width={SPARK_W}
      height={SPARK_H}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      className="overflow-visible"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
      {/* Đầu đường sáng hơn thân: mắt bắt ngay được "đang ở đâu" trong một đường 40px. */}
      <circle cx={SPARK_W} cy={headY} r={1.6} fill={stroke} />
    </svg>
  );
}
