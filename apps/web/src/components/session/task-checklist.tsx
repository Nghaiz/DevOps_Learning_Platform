'use client';

import type { ReactElement, ReactNode } from 'react';
import { t } from '@devops-platform/copy';
import { Icon, cn, type IconName } from '@devops-platform/ds';
import type { TaskVisualState } from './task-state';

/**
 * Danh sách nhiệm vụ của lab: mỗi nhiệm vụ một hàng (số thứ tự, tên, trạng thái bằng
 * hình + chữ, trọng số), hàng đang chọn bung đề bài + nút chấm + kết quả ngay bên dưới.
 *
 * NĂM trạng thái nhìn được. `infra` (lượt chấm không chạy được) tách khỏi `failed`
 * (bài làm chưa đạt) ở cả chữ, hình lẫn màu, và chỉ `infra` mang câu "không phải bài
 * làm của bạn chưa đạt".
 */
export interface TaskChecklistItem {
  readonly id: string;
  readonly title: string;
  readonly state: TaskVisualState;
  readonly weight: number | null;
}

export interface TaskChecklistProps {
  readonly items: readonly TaskChecklistItem[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  /** Thân của nhiệm vụ đang chọn (đề bài, nút chấm, kết quả). */
  readonly children?: ReactNode;
}

const STATE_LABEL: Readonly<Record<TaskVisualState, string>> = {
  'not-attempted': t('session.task.state.not-attempted'),
  running: t('session.task.state.running'),
  passed: t('session.task.state.passed'),
  failed: t('session.task.state.failed'),
  infra: t('session.task.state.infra'),
};

const STATE_GLYPH: Readonly<Record<TaskVisualState, IconName>> = {
  'not-attempted': 'circle',
  running: 'circle-dot',
  passed: 'success',
  failed: 'danger',
  infra: 'unplug',
};

const STATE_TONE: Readonly<Record<TaskVisualState, string>> = {
  'not-attempted': 'text-ink-3',
  running: 'text-info-ink',
  passed: 'text-ok-ink',
  failed: 'text-bad-ink',
  infra: 'text-warn-ink',
};

export function TaskChecklist({ items, selectedId, onSelect, children }: TaskChecklistProps): ReactElement {
  return (
    <ul aria-label={t('session.lab.checklist-legend')} className="flex flex-col">
      {items.map((item, index) => {
        const selected = item.id === selectedId;
        return (
          <li key={item.id} className="border-b border-rule last:border-b-0">
            <TaskChecklistRow item={item} index={index + 1} selected={selected} onSelect={onSelect} />
            {selected && children !== undefined ? <div className="animate-enter pb-5 pl-9 pt-1">{children}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}

function TaskChecklistRow({
  item,
  index,
  selected,
  onSelect,
}: {
  readonly item: TaskChecklistItem;
  readonly index: number;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
}): ReactElement {
  const tone = STATE_TONE[item.state];
  return (
    <button
      type="button"
      data-state={item.state}
      onClick={() => onSelect(item.id)}
      aria-current={selected ? 'true' : undefined}
      aria-expanded={selected}
      className={cn(
        'flex min-h-12 w-full items-start gap-3 py-3 text-left outline-none focus-visible:outline-solid',
        'transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-focus',
        'hover:[&_[data-task-title]]:text-acc-ink',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums',
          // Xanh lá CHỈ cho "đã đạt". Nhiệm vụ đang mở dùng màu trung tính đậm: màu mục ở khu
          // thực hành là xanh lá, và một vòng xanh trên nhiệm vụ chưa chấm đọc ra như đã xong.
          item.state === 'passed' ? 'bg-ok-solid text-on-solid' : selected ? 'bg-ink text-canvas' : 'bg-well-2 text-ink-2',
        )}
      >
        {item.state === 'passed' ? <Icon name="check" size={13} strokeWidth={3} /> : index}
      </span>
      <span className="min-w-0 flex-1">
        <span className="sr-only">{index}</span>
        <span data-task-title="" className={cn('block text-ink transition-colors', selected ? 'font-display text-md font-semibold' : 'text-sm font-medium')}>
          {item.title}
        </span>
        {/* Nhãn trạng thái là CHỮ, không chỉ là một biểu tượng có `title`. */}
        <span className={cn('mt-1 flex items-center gap-1.5 text-xs', tone)}>
          <Icon
            name={STATE_GLYPH[item.state]}
            size={14}
            data-state-icon=""
            className={cn('shrink-0', item.state === 'running' && 'animate-breathe')}
          />
          {STATE_LABEL[item.state]}
        </span>
        {item.state === 'infra' ? <span className="mt-0.5 block text-xs text-ink-3">{t('session.task.infra-note')}</span> : null}
      </span>
      {item.weight === null ? null : (
        <span className="shrink-0 pt-0.5 text-xs tabular-nums text-ink-3">{t('session.lab.task-weight', { weight: item.weight })}</span>
      )}
      <Icon name={selected ? 'chevron-up' : 'chevron-down'} size={16} className="mt-1 shrink-0 text-ink-3" />
    </button>
  );
}
