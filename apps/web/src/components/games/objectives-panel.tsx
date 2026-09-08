'use client';

import { type ReactElement } from 'react';
import { Check, Circle, Lightbulb } from 'lucide-react';
import type { Level, SessionStatus } from '@devops-platform/games';
import { Button, cn } from '@devops-platform/ui';

export interface ObjectivesPanelProps {
  readonly level: Level | null;
  readonly status: SessionStatus;
  readonly onRevealHint: (index: number) => void;
}

/**
 * Mục tiêu + gợi ý.
 *
 * Gợi ý mở TUẦN TỰ và mỗi lần mở là một `GameAction` — không phải vì muốn làm
 * khó, mà vì `hintsUsed` đi vào chấm điểm và vào `RunLog`. Một gợi ý hiện ra mà
 * không qua `dispatch` sẽ làm bản ghi phát lại lệch với thứ người chơi thật sự
 * đã thấy, và §8.3 dựng toàn bộ cơ chế xác minh trên chỗ đó.
 */
export function ObjectivesPanel({ level, status, onRevealHint }: ObjectivesPanelProps): ReactElement {
  if (level === null) {
    return <p className="px-3 py-4 text-sm text-muted-foreground">Chưa nạp được level.</p>;
  }

  const met = new Set(status.objectivesMet);
  const nextHint = status.hintsRevealed;
  const hasMoreHints = nextHint < level.hints.length;

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <ul role="list" aria-label="Mục tiêu của level" className="flex flex-col gap-1.5">
        {level.objectives.map((objective) => {
          const done = met.has(objective.id);
          return (
            <li key={objective.id} className="flex items-start gap-2 text-sm">
              {/*
                Icon là TRANG TRÍ; trạng thái nói bằng chữ trong `sr-only`. Nếu để
                icon mang nghĩa thì người dùng trình đọc màn hình nghe được một
                danh sách mục tiêu mà không phân biệt nổi cái nào đã xong — đúng
                lỗi mà §4.4 tồn tại để chặn.
              */}
              {done ? (
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <span className={cn('min-w-0', done ? 'text-foreground' : 'text-muted-foreground')}>
                <span className="sr-only">{done ? 'Đã đạt: ' : 'Chưa đạt: '}</span>
                {objective.label}
                {!objective.required ? (
                  <span className="ml-1.5 text-xs text-muted-foreground">(thưởng)</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      {level.hints.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <ol role="list" aria-label="Gợi ý đã mở" className="flex flex-col gap-1.5">
            {level.hints.slice(0, status.hintsRevealed).map((hint, index) => (
              <li key={hint} className="flex gap-2 text-sm text-muted-foreground">
                <span className="shrink-0 font-mono text-xs">{index + 1}.</span>
                <span className="min-w-0">{hint}</span>
              </li>
            ))}
          </ol>
          {hasMoreHints ? (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onRevealHint(nextHint)}>
              <Lightbulb aria-hidden="true" className="size-4" />
              Mở gợi ý {nextHint + 1} / {level.hints.length}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Đã mở hết gợi ý của level này.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
