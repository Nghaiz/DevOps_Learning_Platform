import type { ComponentType, ReactElement } from 'react';
import {
  CircleAlert,
  CircleCheck,
  CircleStop,
  Hourglass,
  LoaderCircle,
  PlugZap,
  WifiOff,
} from 'lucide-react';
import type { SessionPhase } from '@devops-platform/terminal';
import { cn } from '@devops-platform/ui';
import { SESSION_PHASE_LABEL, phaseBadgeVariant, type PhaseBadgeVariant } from './session-phase';

/**
 * Hình + màu cho từng pha của `session-machine.ts`.
 *
 * ⛔ `import type` cho `SessionPhase`: dạng type-only không kéo `@xterm/*` vào.
 * `Record<SessionPhase, …>`: thêm một pha mà quên hình là đỏ typecheck.
 */
const PHASE_ICON: Record<SessionPhase, ComponentType<{ className?: string }>> = {
  idle: CircleStop,
  creating: LoaderCircle,
  connecting: PlugZap,
  ready: CircleCheck,
  reconnecting: WifiOff,
  exited: CircleStop,
  expired: Hourglass,
  error: CircleAlert,
};

/**
 * Màu theo MỨC ĐỘ, khoá vào `phaseBadgeVariant` chứ không dựng bảng thứ hai:
 * hai bảng cùng trả lời "pha này nặng tới đâu" sẽ lệch nhau.
 *
 * Chữ trong viên dùng `--foreground`, chỉ icon mang màu mức độ: `--destructive`
 * trên nền `destructive/10` dưới ngưỡng 4.5:1 của chữ thường.
 */
const TONE_CLASS: Record<PhaseBadgeVariant, string> = {
  secondary: 'border-border text-muted-foreground',
  success: 'border-success/50 text-success',
  warning: 'border-warning/50 text-warning',
  destructive: 'border-destructive/50 text-destructive',
};

/** Pha nào đang "chờ một thứ gì đó xảy ra" ⇒ icon quay. */
const SPINNING: ReadonlySet<SessionPhase> = new Set<SessionPhase>(['creating', 'connecting']);

export interface PhaseIconProps {
  readonly phase: SessionPhase;
  readonly className?: string;
}

/** Icon của một pha, luôn `aria-hidden` vì nó đi kèm nhãn chữ ở mọi chỗ dùng. */
export function PhaseIcon({ phase, className }: PhaseIconProps): ReactElement {
  const Icon = PHASE_ICON[phase];
  return (
    <Icon aria-hidden="true" className={cn('size-3.5 shrink-0', SPINNING.has(phase) && 'animate-spin', className)} />
  );
}

export interface SessionStatusPillProps {
  readonly phase: SessionPhase;
  readonly className?: string;
}

/**
 * Viên trạng thái phiên trên thanh khoang làm việc.
 *
 * ⛔ KHÔNG có `aria-live`: vùng sống DUY NHẤT của pha phiên nằm ở
 * `SessionControls` (D10). Viên này là chữ tĩnh, cho câu hỏi "terminal còn sống
 * không" nảy ra khi mắt đang ở terminal.
 */
export function SessionStatusPill({ phase, className }: SessionStatusPillProps): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 border px-2 font-mono text-[11px]',
        phaseToneClass(phase),
        className,
      )}
    >
      <PhaseIcon phase={phase} />
      <span className="text-foreground">{SESSION_PHASE_LABEL[phase]}</span>
    </span>
  );
}

/** Lớp màu viền + icon của một pha, đi qua mức độ của `phaseBadgeVariant`. */
export function phaseToneClass(phase: SessionPhase): string {
  return TONE_CLASS[phaseBadgeVariant(phase)];
}
