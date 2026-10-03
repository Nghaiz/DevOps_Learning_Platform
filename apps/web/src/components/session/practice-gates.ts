import { t } from '@devops-platform/copy';
import type { SessionPhase } from '@devops-platform/terminal';
import type { HandoffState } from './terminal-handoff';

/**
 * Hai cổng của màn thực hành, tách khỏi React để test ở node: khi nào nút
 * "Kiểm tra" bấm được, và khi nào nút chạy lệnh trên khối mã bấm được.
 *
 * ⛔ `import type` cho `SessionPhase`: subpath `"."` của `@devops-platform/terminal`
 * kéo theo `@xterm/*` và chết ở node. Dạng type-only bị xoá lúc biên dịch.
 *
 * Mỗi hàm trả `null` khi được phép, hoặc CÂU LÝ DO khi không. Trả lý do chứ
 * không trả boolean: một nút xám không lời giải thích là trạng thái tệ nhất, vì
 * người học không biết nên chờ hay đã hỏng. Nơi gọi in câu này cạnh nút.
 */

export interface CheckGateInput {
  readonly phase: SessionPhase;
  readonly hasSession: boolean;
}

/**
 * Lượt chấm chạy ở máy chủ (exec vào pod), không đi qua WebSocket của
 * terminal. Nhưng nó cần pod còn sống và đã được gateway xác nhận, và `ready`
 * là pha DUY NHẤT nói được cả hai điều đó.
 */
export function checkBlockedReason(input: CheckGateInput): string | null {
  if (!input.hasSession) {
    return t('session.check.blocked-no-session');
  }
  switch (input.phase) {
    case 'ready':
      return null;
    case 'idle':
    case 'creating':
    case 'connecting':
    case 'reconnecting':
      return t('session.check.blocked-wait');
    case 'expired':
      return t('session.check.blocked-expired');
    case 'exited':
    case 'error':
      return t('session.check.blocked-down');
  }
}

export interface ExecGateInput extends CheckGateInput {
  /** Trang đang cầm một `TerminalHandle` (kết nối của CHÍNH trang này đang mở). */
  readonly terminalAttached: boolean;
  readonly handoff: HandoffState;
}

/**
 * Nút chạy lệnh gõ vào PTY qua WebSocket của trang, nên ngoài pha `ready` nó
 * còn cần chính trang đang giữ kết nối: khi terminal đã được chuyển ra cửa sổ
 * riêng, pha vẫn là `ready` mà trang không còn gì để gõ vào.
 */
export function execBlockedReason(input: ExecGateInput): string | null {
  if (!input.hasSession) {
    return t('session.exec.blocked-no-session');
  }
  if (input.handoff !== 'here') {
    return t('session.exec.blocked-elsewhere');
  }
  if (input.phase === 'ready' && input.terminalAttached) {
    return null;
  }
  switch (input.phase) {
    case 'expired':
    case 'exited':
    case 'error':
      return t('session.exec.blocked-down');
    default:
      return t('session.exec.blocked-wait');
  }
}
