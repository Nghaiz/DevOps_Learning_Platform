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
  readonly handoff: HandoffState;
}

/**
 * Lượt chấm chạy ở máy chủ (exec vào pod), không đi qua WebSocket của
 * terminal. Nhưng nó cần pod còn sống và đã được gateway xác nhận, và `ready`
 * là pha DUY NHẤT nói được cả hai điều đó.
 *
 * Ngoại lệ: terminal đã giao sang cửa sổ riêng. Trang khi đó tự ngắt kết nối
 * (gateway chỉ cho một WebSocket), nên `phase` của trang ĐỨNG YÊN ở pha lúc
 * giao. Bấm giao lúc còn `connecting` là trang không bao giờ thấy `ready`, và
 * nút Kiểm tra khoá mãi với câu "chờ terminal nối" trong khi terminal ở cửa sổ
 * kia chạy bình thường. Ở đó chỉ `expired` còn là phán quyết đáng tin (máy chủ
 * đã nói pod không còn); pha khác chỉ là pha cũ, và lượt chấm hỏng thì tự báo
 * lỗi hệ thống chứ không đọc thành bài sai.
 */
export function checkBlockedReason(input: CheckGateInput): string | null {
  if (!input.hasSession) {
    return t('session.check.blocked-no-session');
  }
  if (input.handoff !== 'here' && input.phase !== 'expired') {
    return null;
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
