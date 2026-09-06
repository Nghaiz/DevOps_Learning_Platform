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

/**
 * Tập biến thể badge mà MỘT PHA phiên có thể sinh ra — hẹp hơn `BadgeVariant`.
 *
 * Vì sao không trả thẳng `BadgeVariant`: bảng màu của `Badge` nay có 13 biến
 * thể (thêm `difficulty-*` và `status-*` cho danh mục), mà một pha phiên không
 * bao giờ là "độ khó trung cấp". Khai rộng buộc mọi bảng tra khoá theo kiểu trả
 * về phải liệt kê đủ 13 dòng, trong đó 9 dòng không thể xảy ra — và một bảng
 * đầy dòng chết thì không ai đọc nữa.
 *
 * Hẹp lại giữ đúng cái bảo đảm cần giữ: thêm một PHA mới trả về một biến thể
 * chưa có trong tập này ⇒ đỏ typecheck tại `TONE_CLASS` của `session-status`,
 * đúng chỗ cần đỏ. Thêm một biến thể badge cho danh mục thì không đụng gì ở đây.
 */
export type PhaseBadgeVariant = Extract<
  BadgeVariant,
  'success' | 'warning' | 'destructive' | 'secondary'
>;

/** Màu badge theo pha. Chỉ dùng token C1 (qua variant của `Badge`). */
export function phaseBadgeVariant(phase: SessionPhase): PhaseBadgeVariant {
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
