'use client';

import { useCallback, useMemo, useState, type KeyboardEvent, type ReactElement } from 'react';
import { ChevronDown, Map as MapIcon } from 'lucide-react';
import type { ClusterView, ObjectView } from '@devops-platform/games';
import { cn } from '@devops-platform/ui';
import { HIDDEN_SCROLL } from './inspector-frame.tsx';

/** Bao nhiêu chấm pod vẽ trước khi gộp phần dư thành `+n`. */
const MAX_DOTS = 12;

const DOT_CLASS: Readonly<Record<ObjectView['statusToken'], string>> = {
  success: 'bg-success',
  destructive: 'bg-destructive',
  warning: 'bg-warning',
  'status-progress': 'bg-status-progress',
  'status-locked': 'bg-status-locked',
};

export interface MinimapProps {
  readonly view: ClusterView;
  /**
   * Bấm vào một node ⇒ cha phát `CameraCommand` kind `focus`.
   *
   * ⚠ Không nhận `CameraCommand` dựng sẵn từ đây được: `CameraCommand.focus`
   * mang `uid` của một OBJECT, mà node không phải object và không có uid. Cha —
   * nơi biết scene địa chỉ hoá node thế nào — là chỗ đúng để dịch. Xem báo cáo
   * chỗ lệch hợp đồng.
   */
  readonly onSelectNode: (nodeName: string) => void;
  readonly className?: string;
}

/**
 * Bản đồ thu nhỏ — góc dưới phải, nhìn từ trên xuống.
 *
 * Mỗi node là một ô; pod đang chạy trên node đó là các chấm bên trong, tô theo
 * token trạng thái của chính engine (`ObjectView.statusToken`) chứ không tô theo
 * một bảng màu riêng. Nhờ vậy chấm đỏ ở bản đồ và khối đỏ trong cảnh 3D luôn
 * cùng nghĩa — hai bảng màu song song là cách nhanh nhất làm bản đồ thành thứ
 * gây hiểu nhầm.
 *
 * Không dùng khung `PanelFrame`: bản đồ THU GỌN chứ không đóng, và một nút chữ
 * thập ở đây sẽ hứa một hành động (bỏ hẳn lớp) mà nó không làm.
 */
export function Minimap({ view, onSelectNode, className }: MinimapProps): ReactElement {
  const [collapsed, setCollapsed] = useState(true);

  const podsByNode = useMemo(() => {
    const map = new Map<string, ObjectView[]>();
    for (const object of view.objects) {
      if (object.kind !== 'Pod') {
        continue;
      }
      // Pod chưa xếp lịch gom vào khoá rỗng — chúng là thứ người chơi cần thấy
      // nhất khi cụm hết chỗ, và bỏ chúng đi làm bản đồ nói dối rằng mọi pod đều
      // đã có nhà.
      const key = object.nodeName ?? '';
      const bucket = map.get(key);
      if (bucket === undefined) {
        map.set(key, [object]);
      } else {
        bucket.push(object);
      }
    }
    return map;
  }, [view.objects]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setCollapsed(true);
    }
  }, []);

  const unscheduled = podsByNode.get('') ?? [];

  return (
    <section
      aria-label="Bản đồ thu nhỏ của cụm"
      onKeyDown={onKeyDown}
      className={cn(
        'pointer-events-auto absolute right-3 bottom-3 z-20 w-56 overflow-hidden rounded-lg border border-border',
        'bg-card/95 text-card-foreground shadow-elevation-2 backdrop-blur-sm',
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => {
          setCollapsed((current) => !current);
        }}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
          'hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
        )}
      >
        <MapIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">
          {view.nodes.length} node · {podCount(podsByNode)} pod
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 transition-transform',
            collapsed ? '-rotate-90' : 'rotate-0',
          )}
        />
      </button>

      {collapsed ? null : (
        // Cụm nhiều node thì bản đồ vẫn phải nằm gọn trong màn hình; cuộn được
        // nhưng không có thanh trượt nào hiện ra.
        <div
          className={cn(
            'flex max-h-[45vh] flex-col gap-1.5 border-t border-border p-2',
            HIDDEN_SCROLL,
          )}
        >
          {view.nodes.map((node) => (
            <button
              key={node.name}
              type="button"
              onClick={() => {
                onSelectNode(node.name);
              }}
              aria-label={`Đưa camera tới ${node.name}, ${String((podsByNode.get(node.name) ?? []).length)} pod`}
              className={cn(
                'flex flex-col gap-1 rounded-md border p-1.5 text-left transition-colors',
                'hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
                node.ready ? 'border-border' : 'border-destructive',
              )}
            >
              <span className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate font-mono">{node.name}</span>
                <span
                  className={cn(
                    'shrink-0',
                    node.ready ? 'text-muted-foreground' : 'text-destructive',
                  )}
                >
                  {node.ready ? `${String(Math.round(node.cpuUsed * 100))}%` : 'NotReady'}
                </span>
              </span>
              <PodDots pods={podsByNode.get(node.name) ?? []} />
            </button>
          ))}

          {unscheduled.length === 0 ? null : (
            <div className="flex flex-col gap-1 rounded-md border border-warning p-1.5">
              <span className="text-[11px] text-warning">Chưa xếp lịch ({unscheduled.length})</span>
              <PodDots pods={unscheduled} />
            </div>
          )}

          {view.nodes.length === 0 ? (
            <p className="px-1 py-2 text-[11px] text-muted-foreground">Cụm chưa có node nào.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function PodDots({ pods }: { readonly pods: readonly ObjectView[] }): ReactElement {
  const shown = pods.slice(0, MAX_DOTS);
  const extra = pods.length - shown.length;
  return (
    <span aria-hidden="true" className="flex min-h-2 flex-wrap items-center gap-0.5">
      {shown.map((pod) => (
        <span key={pod.uid} className={cn('size-2 rounded-[2px]', DOT_CLASS[pod.statusToken])} />
      ))}
      {extra > 0 ? (
        <span className="ml-0.5 text-[10px] text-muted-foreground">+{extra}</span>
      ) : null}
    </span>
  );
}

function podCount(byNode: ReadonlyMap<string, readonly ObjectView[]>): number {
  let total = 0;
  for (const pods of byNode.values()) {
    total += pods.length;
  }
  return total;
}
