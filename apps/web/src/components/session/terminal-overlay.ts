import { t } from '@devops-platform/copy';
import type { SessionPhase } from '@devops-platform/terminal';
import { SESSION_PHASE_LABEL } from './session-phase';
import type { HandoffState } from './terminal-handoff';

/**
 * Lớp phủ trên terminal theo pha phiên (H2: "terminal chết trông như còn sống").
 *
 * Trước bản này, khi phiên hết hạn hay shell thoát, khoang terminal vẫn vẽ màn
 * hình cũ với con trỏ nhấp nháy, và chỉ một viên chữ nhỏ ở góc nói điều ngược
 * lại. Người học gõ vào một terminal đã chết mà không thấy gì xảy ra.
 *
 * Mỗi pha không phải `ready` có đúng MỘT câu nói chuyện gì đang xảy ra và tối
 * đa MỘT việc làm được. Hàm thuần, test ở node.
 *
 * ⛔ `import type` cho `SessionPhase`: subpath `"."` của terminal kéo `@xterm/*`.
 */

export type OverlayAction = 'reconnect' | 'new-session' | 'reclaim';

export type OverlayTone = 'wait' | 'down' | 'elsewhere';

export interface TerminalOverlay {
  readonly tone: OverlayTone;
  readonly title: string;
  readonly detail: string | null;
  readonly action: OverlayAction | null;
}

export interface OverlayInput {
  readonly phase: SessionPhase;
  /** Câu lý do của máy trạng thái (`SessionState.message`). */
  readonly message: string | null;
  readonly handoff: HandoffState;
  /** Hook phiên có `reconnect` không (nối lại vào CÙNG pod, không tốn phiên mới). */
  readonly canReconnect: boolean;
  /** Mã đóng gần nhất của WebSocket, nếu có. */
  readonly closeCode?: number | null;
}

/** Gateway giới hạn stdin 256 KiB/s, nhịp dồn 512 KiB: dán quá cỡ đó là đóng với mã này. */
export const CLOSE_RATE_LIMITED = 4429;

export function resolveTerminalOverlay(input: OverlayInput): TerminalOverlay | null {
  const { phase, message, handoff, canReconnect } = input;

  if (handoff === 'elsewhere') {
    return {
      tone: 'elsewhere',
      title: t('session.overlay.elsewhere-title'),
      detail: t('session.overlay.elsewhere-detail'),
      action: 'reclaim',
    };
  }
  if (handoff === 'reclaiming') {
    return { tone: 'wait', title: t('session.overlay.reclaiming'), detail: null, action: null };
  }

  const title = SESSION_PHASE_LABEL[phase];
  switch (phase) {
    case 'ready':
    case 'idle':
      return null;
    case 'creating':
      return { tone: 'wait', title, detail: t('session.overlay.creating-detail'), action: null };
    case 'connecting':
      return { tone: 'wait', title, detail: t('session.overlay.connecting-detail'), action: null };
    case 'reconnecting':
      return {
        tone: 'wait',
        title,
        detail: message ?? t('session.overlay.reconnecting-detail'),
        action: canReconnect ? 'reconnect' : null,
      };
    case 'exited':
    case 'error':
      return {
        tone: 'down',
        title,
        // Câu chung "vượt giới hạn tốc độ" không nói người học đã làm gì; ca thường gặp là dán một khối quá lớn.
        detail: input.closeCode === CLOSE_RATE_LIMITED ? t('session.overlay.rate-limited') : message,
        action: canReconnect ? 'reconnect' : 'new-session',
      };
    case 'expired':
      // Pod đã bị thu hồi: nối lại không có gì để nối vào.
      return { tone: 'down', title, detail: message, action: 'new-session' };
  }
}

export function overlayActionLabel(action: OverlayAction): string {
  switch (action) {
    case 'reconnect':
      return t('session.overlay.reconnect');
    case 'new-session':
      return t('session.overlay.new-session');
    case 'reclaim':
      return t('session.overlay.reclaim');
  }
}
