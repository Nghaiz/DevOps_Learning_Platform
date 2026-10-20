'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Icon, ProgressLine, cn } from '@devops-platform/ds';
import { formatMoment } from '../../../../lib/format-moment';
import { formatCountdown, isCountdownUrgent } from '../countdown';

/**
 * Đồng hồ của lượt thi: con số lớn bên trái, thước thời gian còn lại bên phải.
 *
 * - Mực khi còn thời gian, đỏ khi còn dưới 5 phút (`isCountdownUrgent`), xám khi lượt
 *   đã khoá. Thước rút ngắn theo cùng con số, nên liếc mắt là biết còn bao nhiêu
 *   phần của bài thi.
 * - Chữ số dùng `tabular-nums`: mỗi chữ số rộng bằng nhau, nên con số đứng yên trong
 *   lúc giây chạy thay vì rung theo bề ngang của từng chữ số.
 *
 * ⛔ `aria-live="off"` trên con số: đọc lại đồng hồ bốn lần mỗi giây làm trình đọc
 * màn hình không nói được gì khác. Thay vào đó MỘT vùng `role="status"` báo đúng một
 * lần khi đồng hồ chuyển sang gấp, vì nội dung của nó chỉ đổi đúng lúc đó.
 */
export function CountdownBoard(props: {
  readonly remainingMs: number;
  /** Tổng thời gian của lượt, để thước biết mẫu số. */
  readonly totalMs: number;
  readonly closed: boolean;
  readonly submitted: boolean;
  readonly deadline: string;
}): ReactElement {
  const urgent = !props.closed && isCountdownUrgent(props.remainingMs);
  const left = props.closed ? 0 : Math.max(0, props.remainingMs);
  const ratio = props.totalMs > 0 ? Math.min(1, left / props.totalMs) : 0;
  const percent = Math.round(ratio * 100);

  return (
    <section
      aria-label={t('exam.countdown-label')}
      data-urgent={urgent ? 'true' : undefined}
      className="grid gap-6 border-y border-rule py-7 md:grid-cols-[auto_minmax(16rem,22rem)] md:items-end md:justify-between"
    >
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-sm text-ink-3">
          <Icon name={props.closed ? 'lock' : 'timer'} size={16} />
          {props.closed
            ? t(props.submitted ? 'exam.attempt.submitted' : 'exam.attempt.expired')
            : t('exam.countdown-label')}
        </p>
        <output
          aria-live="off"
          className={cn(
            'font-display text-[clamp(3.25rem,11vw,6.5rem)] font-semibold leading-none tracking-[-0.03em] tabular-nums',
            'transition-colors duration-300',
            props.closed ? 'text-ink-3' : urgent ? 'text-bad-ink' : 'text-ink',
          )}
        >
          {formatCountdown(left)}
        </output>
      </div>

      <div className="flex flex-col gap-2.5">
        <ProgressLine
          value={ratio}
          size="md"
          role="meter"
          tone={props.closed ? 'acc' : urgent ? 'bad' : 'acc'}
          label={t('exam.countdown-meter', { percent })}
        />
        <p className="text-sm tabular-nums text-ink-2">{t('exam.deadline-note', { at: formatMoment(props.deadline) })}</p>
        <p role="status" className={cn('text-sm font-medium', urgent ? 'text-bad-ink' : 'sr-only')}>
          {urgent ? t('exam.countdown-warn') : null}
        </p>
      </div>
    </section>
  );
}
