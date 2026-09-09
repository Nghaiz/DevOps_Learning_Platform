'use client';

import { type ReactElement } from 'react';
import type { ClusterView } from '@devops-platform/games';
import { cn } from '@devops-platform/ui';
import { HIDDEN_SCROLL } from './inspector-frame.tsx';
import { PanelFrame } from './inspector-frame.tsx';
import { MetricsChart } from './metrics-chart.tsx';
import { type MetricSample } from './metrics-history.ts';

const percent = (value: number): string => `${String(Math.round(value * 100))}%`;
const count = (value: number): string => String(Math.round(value));

export interface MetricsPanelProps {
  readonly view: ClusterView;
  /**
   * Chuỗi mẫu, do cha thu (`useMetricsHistory`).
   *
   * ⚠ Trước đây bảng tự giữ lịch sử trong state của chính nó, nên đồ thị bắt
   * đầu từ lúc MỞ bảng và bảng phải tự đi giải thích điều đó ở chân. Kể từ khi
   * dải số liệu nằm thường trực trên thanh trên cùng, mẫu đã được thu sẵn cho cả
   * phiên — nhận vào rẻ hơn và cho đồ thị đầy đủ hơn.
   */
  readonly history: readonly MetricSample[];
  readonly onClose: () => void;
  /** Cho lead đổi chỗ đặt. Bỏ trống thì dùng góc trái dưới. */
  readonly className?: string;
}

/**
 * Bảng số liệu — bật bằng phím `M` (`ARENA_KEYS.toggleMetrics`).
 *
 * Lịch sử nằm trong state của chính component, nên nó SỐNG THEO bảng: đóng bảng
 * là mất chuỗi mẫu. Đó là đánh đổi có chủ ý chứ không phải sót — giữ lịch sử ở
 * cha có nghĩa là mọi phiên chơi đều trả giá bộ nhớ cho một bảng phần lớn thời
 * gian đang tắt. Bảng tự nói ra giới hạn này ở chân, để người dùng không tưởng
 * đồ thị đang giấu mất phần đầu.
 */
export function MetricsPanel({
  view,
  history,
  onClose,
  className,
}: MetricsPanelProps): ReactElement {
  const cpu = history.map((sample) => sample.cpu);
  const memory = history.map((sample) => sample.memory);
  const pods = history.map((sample) => sample.pods);

  return (
    <PanelFrame
      title="Số liệu cụm"
      closeLabel="Đóng bảng số liệu"
      onClose={onClose}
      className={cn('absolute bottom-3 left-3 z-20 w-72 max-w-[calc(100%-1.5rem)]', className)}
    >
      <div className={cn('flex min-h-0 flex-col gap-3 px-3 py-3', HIDDEN_SCROLL)}>
        <MetricsChart
          title="CPU trung bình"
          values={cpu}
          max={1}
          format={percent}
          colorToken="var(--status-progress)"
        />
        <MetricsChart
          title="Bộ nhớ trung bình"
          values={memory}
          max={1}
          format={percent}
          colorToken="var(--warning)"
        />
        <MetricsChart
          title="Số pod"
          values={pods}
          max={null}
          format={count}
          colorToken="var(--success)"
        />

        <div>
          <h3 className="mb-1 text-xs text-muted-foreground">Theo node</h3>
          <ul className="flex flex-col gap-1">
            {view.nodes.map((node) => (
              <li key={node.name} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate font-mono">{node.name}</span>
                <span
                  className={cn(
                    'shrink-0 font-mono',
                    node.ready ? 'text-muted-foreground' : 'text-destructive',
                  )}
                >
                  {node.ready
                    ? `${percent(node.cpuUsed)} · ${percent(node.memoryUsed)}`
                    : 'NotReady'}
                </span>
              </li>
            ))}
          </ul>
          {view.nodes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Cụm chưa có node nào.</p>
          ) : null}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Đồ thị tính từ lúc vào bài, giữ {String(history.length)} mẫu gần nhất.
        </p>
      </div>
    </PanelFrame>
  );
}
