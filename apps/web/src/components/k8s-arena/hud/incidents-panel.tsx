'use client';

import { useMemo, useState, type ReactElement } from 'react';
import type { ObjectView } from '@devops-platform/games';
import { Badge, cn } from '@devops-platform/ui';
import { HIDDEN_SCROLL, PanelFrame } from './inspector-frame.tsx';
import { INCIDENT_LABEL } from './incidents-labels.ts';
import { objectLabel, type IncidentView } from './inspector-types.ts';

type IncidentFilter = 'active' | 'resolved' | 'all';

const FILTER_LABEL: Readonly<Record<IncidentFilter, string>> = {
  active: 'Đang xảy ra',
  resolved: 'Đã xử lý',
  all: 'Tất cả',
};

const FILTER_ORDER: readonly IncidentFilter[] = ['active', 'resolved', 'all'];

export interface IncidentsPanelProps {
  /**
   * Sự cố của cụm.
   *
   * ⚠ KHÔNG lấy được từ `ClusterView` — hợp đồng engine không có trường nào cho
   * sự cố, dù `ClusterState.incidents` tồn tại ở tầng trong. Cha phải bơm vào.
   * Xem bảng chỗ lệch hợp đồng ở đầu `inspector-types.ts`.
   */
  readonly incidents: readonly IncidentView[];
  /** Để tra tên tài nguyên bị ảnh hưởng từ `targetUid`. */
  readonly objects: readonly ObjectView[];
  readonly tick: number;
  /** Chọn tài nguyên bị ảnh hưởng. Cha đặt `selectedUid` VÀ phát lệnh camera `focus`. */
  readonly onSelect: (uid: string) => void;
  readonly onClose: () => void;
  readonly className?: string;
}

/**
 * Danh sách sự cố — bật bằng phím `I` (`ARENA_KEYS.toggleIncidents`).
 *
 * Mặc định lọc "Đang xảy ra": người mở bảng này gần như luôn đang đi tìm thứ
 * cần sửa NGAY. Lịch sử đã xử lý vẫn tra được, nhưng nó không phải thứ chắn
 * đường lúc mở.
 */
export function IncidentsPanel({
  incidents,
  objects,
  tick,
  onSelect,
  onClose,
  className,
}: IncidentsPanelProps): ReactElement {
  const [filter, setFilter] = useState<IncidentFilter>('active');

  const byUid = useMemo(() => new Map(objects.map((object) => [object.uid, object])), [objects]);

  const shown = incidents.filter((incident) => {
    switch (filter) {
      case 'active':
        return incident.resolvedTick === null;
      case 'resolved':
        return incident.resolvedTick !== null;
      case 'all':
        return true;
    }
  });

  const activeCount = incidents.reduce(
    (acc, incident) => (incident.resolvedTick === null ? acc + 1 : acc),
    0,
  );

  return (
    <PanelFrame
      title={`Sự cố (${String(activeCount)} đang xảy ra)`}
      closeLabel="Đóng danh sách sự cố"
      onClose={onClose}
      className={cn(
        'absolute top-3 left-1/2 z-20 w-96 max-w-[calc(100%-1.5rem)] -translate-x-1/2',
        className,
      )}
      headerExtra={
        <div role="group" aria-label="Lọc sự cố" className="flex shrink-0 gap-1">
          {FILTER_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => {
                setFilter(option);
              }}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                filter === option
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {FILTER_LABEL[option]}
            </button>
          ))}
        </div>
      }
    >
      <ul className={cn('flex max-h-72 min-h-0 flex-col divide-y divide-border', HIDDEN_SCROLL)}>
        {shown.map((incident) => {
          const target = byUid.get(incident.targetUid) ?? null;
          const active = incident.resolvedTick === null;
          // Thời lượng TÍNH tại đây, không lưu: sự cố còn sống thì đo tới tick
          // hiện tại, đã xử lý thì đo tới tick xử lý.
          const spanned = (incident.resolvedTick ?? tick) - incident.startedTick;
          return (
            <li key={`${incident.kind}-${incident.targetUid}-${String(incident.startedTick)}`}>
              <button
                type="button"
                // Vô hiệu khi tài nguyên đã bị xoá: bay camera tới một uid không
                // còn trong cảnh sẽ không làm gì cả, và "bấm không ăn" đọc ra như
                // giao diện hỏng chứ không như "thứ đó đã biến mất".
                disabled={target === null}
                onClick={() => {
                  if (target !== null) {
                    onSelect(target.uid);
                  }
                }}
                className={cn(
                  'flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors',
                  'enabled:hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
                  'disabled:cursor-default disabled:opacity-60',
                )}
              >
                <span className="flex items-center gap-2">
                  <Badge variant={active ? 'destructive' : 'success'}>
                    {active ? 'Đang xảy ra' : 'Đã xử lý'}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {INCIDENT_LABEL[incident.kind]}
                  </span>
                </span>
                <span className="flex justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="min-w-0 truncate font-mono">
                    {target === null ? 'tài nguyên đã bị xoá' : objectLabel(target)}
                  </span>
                  <span className="shrink-0 font-mono">
                    t{incident.startedTick} · {spanned} tick
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          {filter === 'active' ? 'Cụm đang không có sự cố nào.' : 'Không có sự cố nào khớp bộ lọc.'}
        </p>
      ) : null}
    </PanelFrame>
  );
}
