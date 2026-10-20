import type { ReactElement } from 'react';
import type { SessionPhase } from '@devops-platform/terminal';
import { Pill, cn } from '@devops-platform/ds';
import { SESSION_PHASE_LABEL, phaseIsWaiting, phaseTone } from './session-phase';

export interface SessionStatusPillProps {
  readonly phase: SessionPhase;
  readonly className?: string;
}

/**
 * Viên trạng thái máy: chấm màu theo mức độ + chữ. Pha đang chờ thì chấm thở nhịp,
 * không có vòng xoay.
 *
 * ⛔ KHÔNG có `aria-live`: vùng sống DUY NHẤT của pha nằm ở `SessionControls`. Viên
 * này là chữ tĩnh cho câu hỏi "máy còn sống không" khi mắt đang ở terminal.
 */
export function SessionStatusPill({ phase, className }: SessionStatusPillProps): ReactElement {
  return (
    <Pill tone={phaseTone(phase)} dot live={phaseIsWaiting(phase) || phase === 'ready'} className={cn('whitespace-nowrap', className)}>
      {SESSION_PHASE_LABEL[phase]}
    </Pill>
  );
}
