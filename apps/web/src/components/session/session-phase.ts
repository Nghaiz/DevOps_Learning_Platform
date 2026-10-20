import { t } from '@devops-platform/copy';
import type { SessionPhase } from '@devops-platform/terminal';
import type { Tone } from '@devops-platform/ds';

/**
 * Nhãn tiếng Việt cho từng pha của `session-machine.ts`.
 *
 * ⛔ `import type` (không phải `import`): `@devops-platform/terminal` qua
 * subpath `"."` kéo theo `@xterm/*` và chết ở node. Dạng type-only bị xoá lúc
 * biên dịch nên file này vẫn nạp được trong test `environment: 'node'` — cùng
 * kỷ luật với `apps/web/src/lib/use-session-reason-lookup.ts`.
 *
 * `Record<SessionPhase, string>` chứ không `Record<string, string>`: thêm một
 * pha mới vào máy trạng thái mà quên dịch sẽ ĐỎ ở typecheck, thay vì lặng lẽ
 * hiện tên pha bằng tiếng Anh cho người học.
 */
export const SESSION_PHASE_LABEL: Record<SessionPhase, string> = {
  idle: t('session.phase.idle'),
  creating: t('session.phase.creating'),
  connecting: t('session.phase.connecting'),
  ready: t('session.phase.ready'),
  reconnecting: t('session.phase.reconnecting'),
  exited: t('session.phase.exited'),
  expired: t('session.phase.expired'),
  error: t('session.phase.error'),
};

/**
 * Sắc của viên trạng thái theo pha. `Record` để thêm một pha vào máy trạng thái mà
 * quên sắc là đỏ typecheck.
 */
const PHASE_TONE: Record<SessionPhase, Tone> = {
  idle: 'neutral',
  creating: 'info',
  connecting: 'info',
  ready: 'ok',
  reconnecting: 'warn',
  exited: 'neutral',
  expired: 'bad',
  error: 'bad',
};

export function phaseTone(phase: SessionPhase): Tone {
  return PHASE_TONE[phase];
}

/** Pha nào đang "chờ một thứ gì đó xảy ra": chấm nhịp thở, không có vòng xoay. */
export function phaseIsWaiting(phase: SessionPhase): boolean {
  return phase === 'creating' || phase === 'connecting' || phase === 'reconnecting';
}

/** Ngưỡng hiện đồng hồ TTL — dưới 10 phút mới đáng nói (C5). */
export const TTL_VISIBLE_MS = 10 * 60_000;
/** Dưới 2 phút thì đổi sang màu destructive. */
export const TTL_URGENT_MS = 2 * 60_000;
