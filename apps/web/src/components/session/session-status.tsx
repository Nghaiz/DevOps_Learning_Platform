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
 * ⛔ `import type` cho `SessionPhase` — dạng type-only bị xoá lúc biên dịch nên
 * không kéo `@xterm/*` vào, cùng kỷ luật với `session-phase.ts`. Phần lucide
 * thì là import THẬT, và đó là lý do file này là `.tsx` riêng chứ không nhét
 * thêm vào `session-phase.ts`: file kia được giữ node-safe có chủ đích.
 *
 * `Record<SessionPhase, …>` chứ không `Record<string, …>`: thêm một pha mới vào
 * máy trạng thái mà quên hình/màu sẽ ĐỎ ở typecheck, thay vì lặng lẽ hiện một
 * chấm trống cho người học.
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
 * Màu chữ/viền theo MỨC ĐỘ, không theo pha.
 *
 * ⛔ Khoá vào `phaseBadgeVariant` chứ không dựng một bảng phase → màu thứ hai.
 * Hai bảng cùng trả lời "pha này nghiêm trọng tới đâu" là hai bảng sẽ lệch
 * nhau: thêm một pha mới, ai đó sửa một bảng, và badge ở đầu trang nói "lỗi"
 * trong khi viên ở khoang terminal nói "bình thường" — về CÙNG một phiên. Ở
 * đây chỉ còn một phép dịch: mức độ → lớp CSS.
 *
 * Đo bằng đúng công thức của `theme/tokens.contract.test.ts` (trộn alpha trong
 * sRGB đã mã hoá gamma), icon màu `X` trên nền `X/10` đè lên `--card`:
 *   success      4.49 sáng / 6.12 tối
 *   warning      4.60 / 7.12
 *   destructive  3.99 / 5.47
 *   status-locked ~4.7 / ~6.2 (cùng độ sáng với status-done, chroma thấp hơn)
 * Tất cả là ĐỒ HOẠ (icon + viền) ⇒ ngưỡng 3:1 của SC 1.4.11, cả bốn đều trên.
 *
 * CHỮ trong viên thì dùng `--foreground` (16.6–17.2 sáng / 14.8–15.2 tối), KHÔNG
 * dùng màu mức độ: `--destructive` trên nền `destructive/10` đo được 3.99 —
 * DƯỚI ngưỡng 4.5 của chữ thường. Tô chữ theo mức độ ở đây sẽ là một lỗi
 * contrast thật, không phải một lựa chọn thẩm mỹ.
 */
const TONE_CLASS: Record<PhaseBadgeVariant, string> = {
  secondary: 'border-status-locked/40 bg-status-locked/10 text-status-locked',
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  destructive: 'border-destructive/40 bg-destructive/10 text-destructive',
};

/** Pha nào đang "chờ một thứ gì đó xảy ra" ⇒ icon quay. */
const SPINNING: ReadonlySet<SessionPhase> = new Set<SessionPhase>(['creating', 'connecting']);

export interface PhaseIconProps {
  readonly phase: SessionPhase;
  readonly className?: string;
}

/**
 * Icon của một pha. LUÔN `aria-hidden`: nó đi kèm nhãn chữ ở mọi chỗ dùng, và
 * một icon tự xưng tên bên cạnh chính chữ đó là đọc hai lần cho một thứ.
 *
 * `animate-spin` cho pha đang chờ — `prefers-reduced-motion` đã được
 * `globals.css` hạ `animation-duration` xuống 0.01ms bằng bộ chọn phổ quát nên
 * không cần `motion-reduce:` ở đây.
 */
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
 * Viên trạng thái phiên đặt NGAY TRÊN khoang terminal.
 *
 * ⛔ KHÔNG có `aria-live` ở đây, dù nó nói cùng một thứ với badge trong
 * `SessionControls`. Badge kia LÀ vùng sống duy nhất của trang (quyết định
 * D10 — hai vùng sống thì trình đọc màn hình đọc hai lần cho một lần đổi pha).
 * Viên này là chữ tĩnh: người dùng đọc khi họ tới đó, không bị đọc tự động.
 *
 * Vì sao vẫn lặp lại thông tin: thanh công cụ nằm ở đầu trang, còn câu hỏi
 * "terminal của tôi còn sống không" nảy ra khi mắt đang ở terminal. Bắt người
 * học ngước lên đầu trang để trả lời một câu hỏi về khoang họ đang nhìn là
 * đúng loại ma sát mà bố cục hai khoang sinh ra để xoá.
 */
export function SessionStatusPill({ phase, className }: SessionStatusPillProps): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        phaseToneClass(phase),
        className,
      )}
    >
      <PhaseIcon phase={phase} />
      <span className="text-foreground">{SESSION_PHASE_LABEL[phase]}</span>
    </span>
  );
}

/** Lớp màu dạng viền + nền nhạt của một pha, đi qua mức độ của `phaseBadgeVariant`. */
export function phaseToneClass(phase: SessionPhase): string {
  return TONE_CLASS[phaseBadgeVariant(phase)];
}
