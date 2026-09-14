'use client';

import { useState, type ReactElement } from 'react';
import { AlertTriangle, CheckCircle2, Info, Search, XCircle } from 'lucide-react';
import type { EventView } from '@devops-platform/games';
import { cn } from '@devops-platform/ui';
import { HIDDEN_SCROLL } from './inspector-frame.tsx';
import { EVENT_LEVEL_LABEL } from './inspector-types.ts';
import './events.css';

export interface InspectorEventsProps {
  readonly events: readonly EventView[];
  readonly tick: number;
  readonly scope?: 'resource' | 'cluster';
}

type Filter = 'all' | EventView['level'];
const FILTERS: readonly Filter[] = ['all', 'error', 'warning', 'info'];
const ICON = { info: Info, warning: AlertTriangle, error: XCircle };

/** Shared readable history; visible severity labels never rely on colour alone. */
export function InspectorEvents({
  events,
  tick,
  scope = 'resource',
}: InspectorEventsProps): ReactElement {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const counts = { all: events.length, error: 0, warning: 0, info: 0 };
  for (const event of events) counts[event.level] += 1;
  const shown = events
    .filter(
      (event) =>
        (filter === 'all' || event.level === filter) &&
        event.message.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi')),
    )
    .slice()
    .reverse();

  return (
    <div className="arena-event-feed">
      <div className="arena-event-tools">
        <div className="arena-event-filters" role="group" aria-label="Lọc mức độ sự kiện">
          {FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => {
                setFilter(option);
              }}
            >
              {option === 'all' ? 'Tất cả' : EVENT_LEVEL_LABEL[option]}{' '}
              <span>{counts[option]}</span>
            </button>
          ))}
        </div>
        <label className="arena-event-search">
          <Search aria-hidden size={15} />
          <input
            aria-label="Tìm trong nội dung sự kiện"
            placeholder="Tìm nội dung sự kiện…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </label>
        <p className="arena-event-caption">Mới nhất ở trên · Mốc là bước mô phỏng của cụm</p>
      </div>
      <ol
        tabIndex={0}
        aria-label={scope === 'cluster' ? 'Nhật ký sự kiện của cụm' : 'Sự kiện của tài nguyên'}
        className={cn('arena-event-list', HIDDEN_SCROLL)}
      >
        {shown.map((event, index) => {
          const Icon = ICON[event.level];
          const delta = Math.max(0, tick - event.tick);
          return (
            <li
              key={`${event.tick}-${index}-${event.message}`}
              className="arena-event-card"
              data-level={event.level}
            >
              <span className="arena-event-symbol">
                <Icon aria-hidden size={16} />
              </span>
              <div className="arena-event-content">
                <div className="arena-event-meta">
                  <strong>{EVENT_LEVEL_LABEL[event.level]}</strong>
                  <span>
                    Mốc {event.tick}
                    {scope === 'resource'
                      ? ` · ${delta === 0 ? 'vừa xong' : `${delta} bước trước`}`
                      : ''}
                  </span>
                </div>
                <p>{event.message}</p>
              </div>
            </li>
          );
        })}
        {shown.length === 0 ? (
          <li className="arena-event-empty">
            <CheckCircle2 aria-hidden size={24} />
            <strong>
              {events.length === 0 ? 'Chưa có hoạt động được ghi lại' : 'Không có sự kiện phù hợp'}
            </strong>
            <p>
              {events.length === 0
                ? 'Khi cụm xếp lịch, khởi động hoặc gặp lỗi, diễn biến sẽ xuất hiện tại đây.'
                : 'Thử chọn Tất cả hoặc đổi nội dung tìm kiếm.'}
            </p>
          </li>
        ) : null}
      </ol>
      <p className="arena-event-footer">
        {shown.length} / {events.length} sự kiện · Nhật ký ghi lại diễn biến, không phải số sự cố
        đang mở.
      </p>
    </div>
  );
}
