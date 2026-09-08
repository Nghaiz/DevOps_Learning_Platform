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
  /**
   * Vị trí do VỎ quyết định, không phải thẻ.
   *
   * Thẻ không biết rail rộng bao nhiêu, cũng không biết màn hình đang rộng hay
   * hẹp — mà đúng hai thứ đó quyết định nó phải đứng ở đâu. Bản trước neo cứng
   * `left-3` ngay trong thẻ và nó chui xuống dưới rail, mất hẳn mép trái.
   */
  readonly className?: string;
  /**
   * Thẻ mở sẵn hay không khi CHƯA ai bấm.
   *
   * Vỏ quyết định theo bề rộng: dưới ~1440px, rail 208px cộng thẻ 320px ăn hết
   * 544px của viewport và thẻ nổi đè lên phần canvas còn lại — người chơi phải
   * nhìn cảnh VÒNG QUANH một panel. Thấy được trên ảnh chụp 1280, không thấy
   * được ở 1920.
   */
  readonly defaultOpen?: boolean;
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
export function LevelCard({
  level,
  status,
  onRevealHint,
  className,
  defaultOpen = true,
}: LevelCardProps): ReactElement {
  /*
   * `null` = người dùng CHƯA bấm, nên đi theo mặc định của bề rộng. Một khi họ
   * bấm, lựa chọn của họ thắng và không bị một lần resize ghi đè — đổi kích
   * thước cửa sổ mà panel tự bung ra lại là hành vi khó chịu kinh điển.
   */
  const [open, setOpen] = useState<boolean | null>(null);
  const isOpen = open ?? defaultOpen;
  const required = level.objectives.filter((o) => o.required);
  const met = new Set(status.objectivesMet);
  const done = required.filter((o) => met.has(o.id)).length;

  return (
    <section
      aria-labelledby="k8s-level-heading"
      className={cn('absolute', HUD_PANEL, className)}
    >
      <div className="flex items-start gap-2 p-2">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls="k8s-level-body"
          onClick={() => setOpen(!isOpen)}
          className="mt-0.5 shrink-0 rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {isOpen ? (
            <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
          )}
          <span className="sr-only">{isOpen ? 'Thu gọn thẻ level' : 'Mở rộng thẻ level'}</span>
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

      {/*
        `max-h-[38vh]` chứ không phải 52vh: ở 1080px, 52vh là 561px và thẻ chiếm
        hơn nửa chiều cao màn hình — nhìn ra một tài liệu, không phải một HUD.
        Primer vẫn đọc hết được bằng cách cuộn; thứ bị cắt là sự CHIẾM CHỖ.
      */}
      <div id="k8s-level-body" hidden={!isOpen} className="max-h-[38vh] overflow-y-auto border-t border-border/60 px-3 py-2">
        <TeachingPanel teaching={level.teaching} />
        <div className="mt-2 border-t border-border/60">
          <ObjectivesPanel level={level} status={status} onRevealHint={onRevealHint} />
        </div>
      </div>
    </section>
  );
}
