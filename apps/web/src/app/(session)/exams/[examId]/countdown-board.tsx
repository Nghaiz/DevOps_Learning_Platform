'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { cn } from '@devops-platform/ui';
import { formatMoment } from '../../../../lib/format-moment';
import { formatCountdown, isCountdownUrgent } from '../countdown';

/**
 * Bảng giờ kiểu bảng tàu chạy: mỗi chữ số một ô lật, chữ mono lớn.
 *
 * - Nền mực khi còn thời gian, chuyển sang đỏ PTIT khi còn dưới 5 phút
 *   (`isCountdownUrgent`), và về nền xám tĩnh khi lượt đã khoá.
 * - Mỗi ô có `key` gồm vị trí VÀ chữ số, nên React chỉ dựng lại đúng ô vừa đổi:
 *   ô giây lật mỗi giây, ô phút đứng yên. Hiệu ứng lật là `animate-reveal-down`,
 *   khối giảm chuyển động toàn cục tắt nó.
 *
 * ⛔ `aria-live="off"` trên con số: đọc lại đồng hồ bốn lần mỗi giây làm trình đọc
 * màn hình không nói được gì khác. Thay vào đó MỘT vùng `role="status"` báo đúng
 * một lần khi bảng chuyển sang gấp, vì nội dung của nó chỉ đổi đúng lúc đó.
 */
export function CountdownBoard(props: {
  readonly remainingMs: number;
  readonly closed: boolean;
  readonly submitted: boolean;
  readonly deadline: string;
}): ReactElement {
  const urgent = !props.closed && isCountdownUrgent(props.remainingMs);
  const text = props.closed ? formatCountdown(0) : formatCountdown(props.remainingMs);
  const secondsFrom = text.lastIndexOf(':') + 1;

  return (
    <section
      aria-label={t('exam.countdown-label')}
      data-urgent={urgent ? 'true' : undefined}
      className={cn(
        'relative overflow-hidden transition-colors duration-[var(--motion-slow)]',
        props.closed
          ? 'bg-muted text-muted-foreground'
          : urgent
            ? 'bg-primary text-primary-foreground'
            : 'bg-ink text-ink-foreground',
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-rails opacity-[0.06]" />
      <div className="relative flex flex-col gap-6 px-5 py-8 md:flex-row md:items-end md:justify-between md:px-10 md:py-10">
        <div className="flex flex-col gap-4">
          <p className="type-label opacity-80">
            {props.closed
              ? t(props.submitted ? 'exam.attempt.submitted' : 'exam.attempt.expired')
              : t('exam.countdown-label')}
          </p>
          <output aria-live="off" className="flex items-center gap-1.5 md:gap-2">
            {/*
              Ô chữ số mang `animate-reveal-down`, chạy lại mỗi lần React dựng ô
              mới. Khoá theo cả chữ số thì ô GIÂY dựng lại mỗi giây và hiệu ứng
              chớp liên tục. Chỉ các ô đứng trước dấu ":" cuối (phút, giờ) mang
              chữ số trong khoá: chúng lật một lần mỗi phút; ô giây khoá theo vị
              trí và chỉ đổi chữ.
            */}
            {[...text].map((char, index) =>
              char === ':' ? (
                <span
                  key={`sep-${String(index)}`}
                  className="font-mono text-[clamp(2.5rem,8vw,6rem)] leading-none font-bold opacity-70"
                >
                  {char}
                </span>
              ) : (
                <span
                  key={index < secondsFrom ? `${String(index)}-${char}` : String(index)}
                  className={cn(
                    'inline-flex h-[clamp(4rem,12vw,8.5rem)] w-[clamp(2.75rem,8vw,5.75rem)] animate-reveal-down items-center justify-center',
                    'font-mono text-[clamp(2.75rem,9vw,6.5rem)] leading-none font-bold tabular-nums',
                    props.closed ? 'bg-background/60' : 'bg-background/10',
                  )}
                >
                  {char}
                </span>
              ),
            )}
          </output>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <p className="font-mono text-sm opacity-90">
            {t('exam.deadline-note', { at: formatMoment(props.deadline) })}
          </p>
          <p role="status" className="type-label">
            {urgent ? t('exam.countdown-warn') : null}
          </p>
        </div>
      </div>
    </section>
  );
}
