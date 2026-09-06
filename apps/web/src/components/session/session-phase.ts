import type { SessionPhase } from '@devops-platform/terminal';
import type { BadgeVariant } from '@devops-platform/ui';

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
  idle: 'Chưa có phiên',
  creating: 'Đang tạo phiên…',
  connecting: 'Đang kết nối…',
  ready: 'Sandbox sẵn sàng',
  reconnecting: 'Mất kết nối — đang thử lại…',
  exited: 'Shell đã thoát',
  expired: 'Phiên đã kết thúc',
  error: 'Lỗi',
};

/** Màu badge theo pha. Chỉ dùng token C1 (qua variant của `Badge`). */
export function phaseBadgeVariant(phase: SessionPhase): BadgeVariant {
  switch (phase) {
    case 'ready':
      return 'success';
    case 'reconnecting':
      return 'warning';
    case 'error':
    case 'expired':
      return 'destructive';
    default:
      return 'secondary';
  }
}

/** Ngưỡng hiện đồng hồ TTL — dưới 10 phút mới đáng nói (C5). */
export const TTL_VISIBLE_MS = 10 * 60_000;
/** Dưới 2 phút thì đổi sang màu destructive. */
export const TTL_URGENT_MS = 2 * 60_000;
