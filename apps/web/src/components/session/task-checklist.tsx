'use client';

import type { ReactElement, ReactNode } from 'react';
import { Circle, CircleCheck, CircleX, LoaderCircle, Unplug } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { LINE_CLASSES, cn, type LineId } from '@devops-platform/ui';
import type { TaskVisualState } from './task-state';

/**
 * Danh sách nhiệm vụ của lab, vẽ thành một TUYẾN DỌC kiểu KodeKloud: mỗi nhiệm
 * vụ là một ga (số thứ tự, tên, trạng thái bằng hình + chữ, trọng số), ga đang
 * chọn bung đề bài + nút chấm + kết quả ngay bên dưới nó.
 *
 * NĂM trạng thái nhìn được. `infra` (lượt chấm không chạy được) tách khỏi
 * `failed` (bài làm chưa đạt) ở cả chữ, hình lẫn màu, và chỉ `infra` mang câu
 * "không phải bài làm của bạn chưa đạt".
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
  /** Màu tuyến của chủ đề lab. */
  readonly line?: LineId;
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

type Glyph = typeof Circle;

const STATE_GLYPH: Readonly<Record<TaskVisualState, Glyph>> = {
  'not-attempted': Circle,
  running: LoaderCircle,
  passed: CircleCheck,
  failed: CircleX,
  infra: Unplug,
};

const STATE_TONE: Readonly<Record<TaskVisualState, string>> = {
  'not-attempted': 'text-muted-foreground',
  running: 'text-foreground',
  passed: 'text-success',
  failed: 'text-destructive',
  infra: 'text-warning',
};

export function TaskChecklist({ items, selectedId, onSelect, line, children }: TaskChecklistProps): ReactElement {
  const rail = line === undefined ? 'bg-foreground' : LINE_CLASSES[line].bg;
  return (
    <ul aria-label={t('session.lab.checklist-legend')}>
      {items.map((item, index) => {
        const selected = item.id === selectedId;
        const isLast = index === items.length - 1;
        return (
          <li key={item.id} className="relative flex gap-4">
            <span aria-hidden="true" className="relative flex w-5 shrink-0 flex-col items-center pt-3">
              <span
                className={cn(
                  'z-10 grid size-5 shrink-0 place-items-center border-[3px] font-mono text-[10px] font-bold',
                  selected
                    ? 'animate-pulse-station border-foreground bg-signal text-signal-foreground'
                    : item.state === 'passed'
                      ? cn(rail, 'border-transparent text-background')
                      : 'border-foreground bg-card text-foreground',
                )}
              >
                {index + 1}
              </span>
              {!isLast && <span className={cn('w-1 flex-1', rail)} />}
            </span>
            <div className="min-w-0 flex-1 pb-2">
              <TaskChecklistRow item={item} index={index + 1} selected={selected} onSelect={onSelect} />
              {selected && children !== undefined && <div className="animate-rise pt-1 pb-6">{children}</div>}
            </div>
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
  const Glyph = STATE_GLYPH[item.state];
  const tone = STATE_TONE[item.state];

  return (
    <button
      type="button"
      data-state={item.state}
      onClick={() => {
        onSelect(item.id);
      }}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex min-h-11 w-full items-start gap-3 px-2 py-2.5 text-left',
        'transition-colors duration-(--motion-fast)',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'bg-muted' : 'hover:bg-muted/60',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="sr-only">{index}</span>
          <span className={cn('text-foreground', selected ? 'type-title' : 'text-sm font-semibold')}>{item.title}</span>
        </span>

        {/* Nhãn trạng thái là CHỮ, không chỉ là một icon có `title`. */}
        <span className={cn('mt-1 flex items-center gap-1.5 font-mono text-xs', tone)}>
          <Glyph aria-hidden="true" className={cn('size-3.5 shrink-0', item.state === 'running' && 'animate-spin')} />
          {STATE_LABEL[item.state]}
        </span>

        {item.state === 'infra' && (
          <span className="mt-0.5 block text-xs text-muted-foreground">{t('session.task.infra-note')}</span>
        )}
      </span>

      {item.weight !== null && (
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {t('session.lab.task-weight', { weight: item.weight })}
        </span>
      )}
    </button>
  );
}
