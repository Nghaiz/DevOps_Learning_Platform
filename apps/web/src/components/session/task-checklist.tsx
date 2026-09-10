'use client';

import type { ReactElement } from 'react';
import { Circle, CircleCheck, CircleX, LoaderCircle, Unplug } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { cn } from '@devops-platform/ui';
import type { TaskVisualState } from './task-state';

/**
 * P16 · 16.D.4 — danh sách kiểm nhiệm vụ, thay cho `<table>`.
 *
 * ## Vì sao không còn là bảng
 *
 * Một `<table>` hứa rằng các cột SO SÁNH ĐƯỢC với nhau theo hàng. Ở đây không
 * có gì để so: mỗi hàng là một việc phải làm, và thứ người học cần đọc trong
 * một cái liếc là "còn mấy việc chưa xong". Đó là hình dạng của một danh sách
 * kiểm, không phải của một bảng dữ liệu. Trình đọc màn hình cũng đọc bảng theo
 * lối "hàng 3 trên 7, cột Trạng thái, Chưa đạt", dài hơn hẳn một mục danh sách.
 *
 * ## ⛔ NĂM trạng thái, và `infra` là lý do file này tồn tại
 *
 * | Trạng thái | Hình | Màu | Nghĩa |
 * |---|---|---|---|
 * | `not-attempted` | vòng rỗng | trung tính | chưa chấm lần nào |
 * | `running` | vòng quay | lam tiến độ | đang chấm |
 * | `passed` | vòng có dấu tích | xanh | đạt |
 * | `failed` | vòng có dấu nhân | đỏ | bài làm chưa đạt |
 * | `infra` | phích cắm rời | vàng | lượt chấm KHÔNG CHẠY được |
 *
 * Hai hàng cuối là hai thứ khác nhau, và trước P16 chúng vẽ ra cùng một viên
 * badge. Một ô "chưa đạt" bảo người học đi sửa bài làm của mình, trong khi thứ
 * hỏng là cụm; họ sẽ sửa một thứ không sai, rất lâu.
 *
 * Phân biệt bằng CẢ hình LẪN màu, không chỉ màu (SC 1.4.1): phích cắm rời không
 * cùng họ hình với vòng-tích và vòng-nhân, nên nó đọc được cả khi in đen trắng
 * và với người không phân biệt đỏ với vàng. Hàng `infra` còn mang thêm một dòng
 * chữ nói thẳng đây không phải bài làm sai, vì đó chính là kết luận sai mà
 * người ta sẽ tự rút ra.
 *
 * ## Mỗi hàng là một `<button>` thật
 *
 * Một hàng bấm được mà không focus được là một hàng người dùng bàn phím không
 * mở được. Bản `<table>` cũ đã làm đúng chỗ này (nút nằm trong ô tiêu đề) và
 * quyết định đó đi theo sang đây, chỉ khác là nay cả hàng là vùng bấm.
 */

export interface TaskChecklistItem {
  readonly id: string;
  readonly title: string;
  readonly state: TaskVisualState;
  /** `null` ⇒ không hiện cột trọng số (mọi nhiệm vụ cùng trọng số). */
  readonly weight: number | null;
}

export interface TaskChecklistProps {
  readonly items: readonly TaskChecklistItem[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
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

/**
 * Màu của glyph và của nhãn. Chỉ dùng token ngữ nghĩa của `globals.css`.
 *
 * `status-done` chứ không `success` cho nhánh đạt: cùng cách `CheckResultPanel`
 * đang tô, nên một nhiệm vụ đạt trong danh sách và cùng nhiệm vụ đó trong khung
 * kết quả không nói hai màu khác nhau.
 */
const STATE_TONE: Readonly<Record<TaskVisualState, string>> = {
  'not-attempted': 'text-muted-foreground',
  running: 'text-status-progress',
  passed: 'text-status-done',
  failed: 'text-destructive',
  infra: 'text-warning',
};

export function TaskChecklist({ items, selectedId, onSelect }: TaskChecklistProps): ReactElement {
  return (
    <ul className="flex flex-col gap-1" aria-label={t('session.lab.checklist-legend')}>
      {items.map((item, index) => (
        <TaskChecklistRow
          key={item.id}
          item={item}
          index={index + 1}
          selected={item.id === selectedId}
          onSelect={onSelect}
        />
      ))}
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
    <li>
      <button
        type="button"
        data-state={item.state}
        onClick={() => {
          onSelect(item.id);
        }}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left',
          'transition-colors duration-(--motion-fast)',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected
            ? 'border-border bg-muted shadow-elevation-1'
            : 'border-transparent hover:bg-muted/60',
        )}
      >
        <Glyph
          aria-hidden="true"
          className={cn(
            'mt-0.5 size-4 shrink-0',
            tone,
            // Vòng quay chỉ ở đúng trạng thái đang chấm. `prefers-reduced-motion`
            // của `globals.css` hạ nó xuống 0.01ms nên không cần cổng riêng.
            item.state === 'running' && 'animate-spin',
          )}
        />

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs text-muted-foreground tabular-nums">{index}</span>
            <span className="text-sm font-medium text-foreground">{item.title}</span>
          </span>

          {/*
            Nhãn trạng thái là CHỮ, không chỉ là một cái icon có `title`. Một
            `title` trên icon là thứ người dùng bàn phím và người dùng cảm ứng
            không đọc được bằng cách nào cả.
          */}
          <span className={cn('mt-0.5 block text-xs font-medium', tone)}>
            {STATE_LABEL[item.state]}
          </span>

          {/*
            Câu này CHỈ có ở nhánh hạ tầng. Nó là nửa còn lại của sự phân biệt:
            hình và màu nói "khác với chưa đạt", còn câu này nói khác ở CHỖ NÀO.
          */}
          {item.state === 'infra' && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {t('session.task.infra-note')}
            </span>
          )}
        </span>

        {item.weight !== null && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {item.weight}
          </span>
        )}
      </button>
    </li>
  );
}
