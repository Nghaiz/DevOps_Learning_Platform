import type { BadgeVariant } from '@devops-platform/ui';
import type { ViewerRole } from '../shell/nav';

/**
 * Đổi vai trò người dùng (`admin.users.setRole`) — phần QUYẾT ĐỊNH, tách khỏi
 * JSX để test được trong vitest node thuần.
 *
 * Hàm ở đây trả lời hai câu, và chúng khác nhau:
 *
 * · **Có được phép bấm không** (`allowed` / `blockedReason`) — phán quyết phía
 *   client, TRƯỚC khi gửi.
 * · **Nói gì với người bấm** (`title` / `body`) — câu xác nhận phải gọi tên
 *   người dùng VÀ cả hai vai trò. "Bạn có chắc không?" là câu hỏi vô nghĩa cho
 *   một hành động sửa quyền của người khác.
 */

/**
 * Thứ tự trong ô chọn: quyền THẤP lên trước.
 *
 * ⚠ Cố ý KHÁC thứ tự của `pgEnum('user_role', ['user','admin','author'])` —
 * thứ tự enum trong DB là thứ tự lịch sử của migration, không phải thứ tự có
 * nghĩa cho người đọc. Sắp theo quyền tăng dần thì việc "nâng" hay "hạ" nhìn
 * thấy được ngay trong danh sách.
 */
export const ASSIGNABLE_ROLES: readonly ViewerRole[] = ['user', 'author', 'admin'];

export const ROLE_LABEL: Readonly<Record<ViewerRole, string>> = {
  user: 'Người học',
  author: 'Người soạn bài',
  admin: 'Quản trị',
};

/** Nhãn vai trò cho người đọc; giá trị lạ giữ nguyên chuỗi gốc thay vì hiện ô trống. */
export function describeRole(role: string): string {
  return ROLE_LABEL[role as ViewerRole] ?? role;
}

export function roleBadgeVariant(role: string): BadgeVariant {
  if (role === 'admin') {
    return 'destructive';
  }
  if (role === 'author') {
    return 'secondary';
  }
  return 'outline';
}

export interface RoleChangePlan {
  readonly allowed: boolean;
  /** Khác `null` ⇒ nút xác nhận bị khoá và câu này hiện ra. */
  readonly blockedReason: string | null;
  readonly title: string;
  /** Nêu ĐÍCH DANH người dùng và CẢ HAI vai trò. */
  readonly body: string;
  readonly confirmLabel: string;
}

export interface RoleChangeInput {
  /** Id của admin đang đăng nhập. */
  readonly actorId: string;
  readonly targetId: string;
  readonly targetEmail: string;
  readonly currentRole: string;
  readonly nextRole: ViewerRole;
}

/**
 * ⛔ Chặn tự hạ quyền — BẢN SAO CÓ CHỦ Ý của luật phía server
 * (`setUserRole` trong `apps/web/src/server/admin/users.ts` ném `FORBIDDEN`).
 *
 * Không phải là thừa, và cũng KHÔNG phải là chỗ duy nhất: máy chủ vẫn là cổng
 * thật (client nào cũng gửi được request tuỳ ý). Bản ở đây tồn tại để người
 * dùng biết TRƯỚC KHI bấm, thay vì bấm rồi nhận một lỗi đỏ — và câu chữ nói
 * đúng hậu quả: admin cuối cùng tự hạ quyền sẽ khoá luôn `/admin` và không có
 * đường mở lại nào ngoài SQL tay.
 *
 * Điều kiện khớp máy chủ từng chữ: `actor.id === targetUserId && role !== 'admin'`.
 * Tự đặt lại chính mình thành `admin` KHÔNG bị chặn ở server — nó chỉ vô nghĩa,
 * và nhánh "vai trò không đổi" bên dưới bắt nó trước.
 */
export function planRoleChange(input: RoleChangeInput): RoleChangePlan {
  const from = describeRole(input.currentRole);
  const to = describeRole(input.nextRole);
  const title = `Đổi vai trò của ${input.targetEmail}?`;
  const body = `${input.targetEmail}: ${from} → ${to}. Việc này được ghi vào nhật ký quản trị kèm tên bạn, và có hiệu lực ở lần tải trang tiếp theo của người đó.`;
  const confirmLabel = `Đổi thành ${to}`;

  if (input.currentRole === input.nextRole) {
    return {
      allowed: false,
      blockedReason: `Người này đã là ${to} — chọn một vai trò khác.`,
      title,
      body,
      confirmLabel,
    };
  }

  if (input.actorId === input.targetId && input.nextRole !== 'admin') {
    return {
      allowed: false,
      blockedReason:
        'Đây là tài khoản của chính bạn. Tự hạ quyền quản trị sẽ khoá luôn trang /admin và chỉ mở lại được bằng SQL tay trên máy chủ — máy chủ cũng từ chối việc này. Nhờ một quản trị viên khác đổi giúp.',
      title,
      body,
      confirmLabel,
    };
  }

  return { allowed: true, blockedReason: null, title, body, confirmLabel };
}

/**
 * Câu lỗi khi máy chủ TỪ CHỐI lượt đổi vai trò.
 *
 * `FORBIDDEN` là phán quyết có chủ đích của `setUserRole` (tự hạ quyền), nên
 * câu của máy chủ đã đúng và chỉ cần thêm phần "nên làm gì". Mọi mã khác có thể
 * là mạng chập hay lỗi thật — không được nói chắc rằng dữ liệu chưa đổi.
 */
export function describeRoleChangeError(code: string | null, message: string): string {
  if (code === 'FORBIDDEN') {
    return `${message}. Vai trò giữ nguyên, không có gì thay đổi.`;
  }
  if (code === 'NOT_FOUND') {
    return `${message}. Tài khoản có thể vừa bị xoá — tải lại danh sách.`;
  }
  return `${message} Tải lại danh sách để xem vai trò hiện tại trước khi thử lại.`;
}
