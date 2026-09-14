'use client';

import { useMemo, useState, type ReactElement } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import type { ObjectView } from '@devops-platform/games';
import { cn } from '@devops-platform/ui';
import { HIDDEN_SCROLL, PanelFrame } from './inspector-frame.tsx';
import { INCIDENT_LABEL } from './incidents-labels.ts';
import { objectLabel, type IncidentView } from './inspector-types.ts';
import './events.css';

type IncidentFilter = 'active' | 'resolved' | 'all';
const FILTER_LABEL = { active: 'Cần xử lý', resolved: 'Đã xử lý', all: 'Tất cả' };
const FILTER_ORDER: readonly IncidentFilter[] = ['active', 'resolved', 'all'];

export interface IncidentsPanelProps {
  readonly incidents: readonly IncidentView[];
  readonly objects: readonly ObjectView[];
  readonly tick: number;
  readonly onSelect: (uid: string) => void;
  readonly onClose: () => void;
  readonly className?: string;
}

/** Active issues lead; historical events are explicitly distinguished from open incidents. */
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
  const activeCount = incidents.filter((incident) => incident.resolvedTick === null).length;
  const counts = {
    active: activeCount,
    resolved: incidents.length - activeCount,
    all: incidents.length,
  };
  const shown = incidents
    .filter(
      (incident) =>
        filter === 'all' ||
        (filter === 'active' ? incident.resolvedTick === null : incident.resolvedTick !== null),
    )
    .slice()
    .sort(
      (a, b) =>
        Number(a.resolvedTick !== null) - Number(b.resolvedTick !== null) ||
        b.startedTick - a.startedTick,
    );

  return (
    <PanelFrame
      title="Sự cố của cụm"
      closeLabel="Đóng danh sách sự cố"
      onClose={onClose}
      className={cn(
        'arena-incident-window absolute top-3 left-1/2 z-20 -translate-x-1/2',
        className,
      )}
    >
      <div className="arena-incident-summary" data-active={activeCount > 0}>
        {activeCount > 0 ? (
          <AlertTriangle aria-hidden size={22} />
        ) : (
          <CheckCircle2 aria-hidden size={22} />
        )}
        <div>
          <strong>
            {activeCount > 0 ? `${activeCount} sự cố cần bạn xử lý` : 'Không có sự cố đang mở'}
          </strong>
          <p>
            {activeCount > 0
              ? 'Chọn tài nguyên để xem trạng thái và tìm nguyên nhân.'
              : 'Tiếp tục theo dõi cụm hoặc xem lại các sự cố đã xử lý.'}
          </p>
        </div>
      </div>
      <div className="arena-event-tools">
        <div role="group" aria-label="Lọc sự cố" className="arena-event-filters">
          {FILTER_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => {
                setFilter(option);
              }}
            >
              {FILTER_LABEL[option]} <span>{counts[option]}</span>
            </button>
          ))}
        </div>
        <p className="arena-event-caption">
          1. Chọn tài nguyên → 2. Đọc trạng thái, sự kiện → 3. Điều chỉnh cấu hình
        </p>
      </div>
      <ul
        tabIndex={0}
        aria-label="Danh sách sự cố"
        className={cn('arena-incident-list', HIDDEN_SCROLL)}
      >
        {shown.map((incident) => {
          const target = byUid.get(incident.targetUid) ?? null;
          const active = incident.resolvedTick === null;
          const spanned = Math.max(0, (incident.resolvedTick ?? tick) - incident.startedTick);
          return (
            <li
              key={`${incident.kind}-${incident.targetUid}-${incident.startedTick}`}
              className="arena-incident-card"
              data-active={active}
            >
              <div className="arena-incident-top">
                <span className="arena-incident-status">
                  {active ? (
                    <AlertTriangle aria-hidden size={13} />
                  ) : (
                    <CheckCircle2 aria-hidden size={13} />
                  )}
                  {active ? 'Cần xử lý' : 'Đã xử lý'}
                </span>
                <span>{spanned} bước mô phỏng</span>
              </div>
              <h3>{INCIDENT_LABEL[incident.kind]}</h3>
              <p className="arena-incident-target">
                {target === null ? 'Tài nguyên đã bị xoá' : objectLabel(target)}
              </p>
              <div className="arena-incident-bottom">
                <span>
                  Bắt đầu: mốc {incident.startedTick}
                  {incident.resolvedTick !== null
                    ? ` · Kết thúc: mốc ${incident.resolvedTick}`
                    : ''}
                </span>
                {target === null ? (
                  <span>Không còn trên bản đồ</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(target.uid);
                    }}
                  >
                    Xem tài nguyên <ArrowUpRight aria-hidden size={14} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {shown.length === 0 ? (
          <li className="arena-event-empty">
            <CheckCircle2 aria-hidden size={26} />
            <strong>
              {filter === 'active'
                ? 'Cụm chưa ghi nhận sự cố đang mở'
                : 'Chưa có sự cố trong mục này'}
            </strong>
            <p>
              {filter === 'resolved'
                ? 'Các sự cố được khắc phục sẽ được lưu ở đây để bạn xem lại.'
                : 'Sự cố sẽ xuất hiện khi cụm phát hiện vấn đề cần kiểm tra.'}
            </p>
          </li>
        ) : null}
      </ul>
    </PanelFrame>
  );
}
