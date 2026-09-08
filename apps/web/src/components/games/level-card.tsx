'use client';

import { useState, type ReactElement } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Level, SessionStatus } from '@devops-platform/games';
import { cn } from '@devops-platform/ui';
import { HUD_PANEL } from './game-hud';
import { ObjectivesPanel } from './objectives-panel';
import { TeachingPanel } from './teaching-panel';

export interface LevelCardProps {
  readonly level: Level;
  readonly status: SessionStatus;
  readonly onRevealHint: (index: number) => void;
}

/**
 * Thẻ level nổi ở góc trên-trái (§12.5).
 *
 * **Thu gọn được**, và đó là yêu cầu chứ không phải tiện ích: thẻ này mang cả
 * `primer` lẫn checklist nên nó là overlay CAO NHẤT trên màn hình, và người chơi
 * đã đọc xong primer cần lấy lại phần canvas đó. Thu gọn giữ lại tiêu đề và tiến
 * độ mục tiêu — vừa đủ để biết mình đang ở đâu mà không che cụm.
 *
 * ⚠ Nút thu gọn nằm TRƯỚC nội dung trong DOM. Với overlay chồng nhau, thứ tự Tab
 * là thứ tự DOM, và §12.4 đòi thứ tự đó theo trình tự ĐỌC — người dùng bàn phím
 * phải gặp cái công tắc trước cái mà nó đóng/mở, y như người dùng chuột.
 */
export function LevelCard({ level, status, onRevealHint }: LevelCardProps): ReactElement {
  const [open, setOpen] = useState(true);
  const required = level.objectives.filter((o) => o.required);
  const met = new Set(status.objectivesMet);
  const done = required.filter((o) => met.has(o.id)).length;

  return (
    <section
      aria-labelledby="k8s-level-heading"
      className={cn('absolute top-16 left-3 z-20 w-[min(20rem,calc(100vw-1.5rem))]', HUD_PANEL)}
    >
      <div className="flex items-start gap-2 p-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="k8s-level-body"
          onClick={() => setOpen((value) => !value)}
          className="mt-0.5 shrink-0 rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {open ? (
            <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
          )}
          <span className="sr-only">{open ? 'Thu gọn thẻ level' : 'Mở rộng thẻ level'}</span>
        </button>
        <div className="min-w-0 flex-1">
          <h2 id="k8s-level-heading" className="text-sm font-semibold text-foreground">
            L{level.chapter} — {level.title}
          </h2>
          <p className="font-mono text-[10px] text-muted-foreground">
            Mục tiêu bắt buộc {done}/{required.length}
          </p>
        </div>
      </div>

      <div id="k8s-level-body" hidden={!open} className="max-h-[52vh] overflow-y-auto border-t border-border/60 px-3 py-2">
        <TeachingPanel teaching={level.teaching} />
        <div className="mt-2 border-t border-border/60">
          <ObjectivesPanel level={level} status={status} onRevealHint={onRevealHint} />
        </div>
      </div>
    </section>
  );
}
