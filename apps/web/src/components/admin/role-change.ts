import { err, t } from '@devops-platform/copy';
import type { BadgeVariant } from '@devops-platform/ui';
import type { ViewerRole } from '../shell/nav';

/**
 * Đổi vai trò người dùng (`admin.users.setRole`), phần QUYẾT ĐỊNH, tách khỏi
 * JSX để test được trong vitest node thuần.
 *
 * Hàm ở đây trả lời hai câu, và chúng khác nhau:
 *
 * · **Có được phép bấm không** (`allowed` / `blockedReason`), phán quyết phía
 *   client, TRƯỚC khi gửi.
 * · **Nói gì với người bấm** (`title` / `body`), câu xác nhận phải gọi tên
 *   người dùng VÀ cả hai vai trò. "Bạn có chắc không?" là câu hỏi vô nghĩa cho
 *   một hành động sửa quyền của người khác.
 *
 * Chữ không còn ở file này. Mọi nhánh gọi `t()` hoặc `err()` trên một khoá của
 * `packages/copy/src/surfaces/admin.ts`, nên cổng gạch ngang dài, cổng mất dấu
 * và cổng danh sách chặn soi được TOÀN BỘ các nhánh chứ không chỉ nhánh mà test
 * đi vào.
 */

/**
 * Thứ tự trong ô chọn: quyền THẤP lên trước.
 *
 * ⚠ Cố ý KHÁC thứ tự của `pgEnum('user_role', ['user','admin','author'])`. Thứ
 * tự enum trong DB là thứ tự lịch sử của migration, không phải thứ tự có nghĩa
 * cho người đọc. Sắp theo quyền tăng dần thì việc "nâng" hay "hạ" nhìn thấy
 * được ngay trong danh sách.
 */
export const ASSIGNABLE_ROLES: readonly ViewerRole[] = ['user', 'author', 'admin'];

/** Nhãn vai trò cho người đọc; giá trị lạ giữ nguyên chuỗi gốc thay vì hiện ô trống. */
export function describeRole(role: string): string {
  if (role === 'user' || role === 'author' || role === 'admin') {
    return t(`admin.role.${role}`);
  }
  return role;
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
 * ⛔ Chặn tự hạ quyền, BẢN SAO CÓ CHỦ Ý của luật phía server
 * (`setUserRole` trong `apps/web/src/server/admin/users.ts` ném `FORBIDDEN`).
 *
 * Không phải là thừa, và cũng KHÔNG phải là chỗ duy nhất: máy chủ vẫn là cổng
 * thật (client nào cũng gửi được request tuỳ ý). Bản ở đây tồn tại để người
 * dùng biết TRƯỚC KHI bấm, thay vì bấm rồi nhận một lỗi đỏ, và câu chữ nói
 * đúng hậu quả: admin cuối cùng tự hạ quyền sẽ khoá luôn `/admin` và không có
 * đường mở lại nào ngoài SQL tay.
 *
 * Điều kiện khớp máy chủ từng chữ: `actor.id === targetUserId && role !== 'admin'`.
 * Tự đặt lại chính mình thành `admin` KHÔNG bị chặn ở server; nó chỉ vô nghĩa,
 * và nhánh "vai trò không đổi" bên dưới bắt nó trước.
 */
export function planRoleChange(input: RoleChangeInput): RoleChangePlan {
  const from = describeRole(input.currentRole);
  const to = describeRole(input.nextRole);
  const title = t('admin.role-change.title', { email: input.targetEmail });
  const body = t('admin.role-change.body', { email: input.targetEmail, from, to });
  const confirmLabel = t('admin.role-change.confirm', { to });

  if (input.currentRole === input.nextRole) {
    return {
      allowed: false,
      blockedReason: t('admin.role-change.blocked-same', { to }),
      title,
      body,
      confirmLabel,
    };
  }

  if (input.actorId === input.targetId && input.nextRole !== 'admin') {
    return {
      allowed: false,
      blockedReason: t('admin.role-change.blocked-self'),
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
 * là mạng chập hay lỗi thật, nên không được nói chắc rằng dữ liệu chưa đổi.
 *
 * Trả về chuỗi GHÉP hai nửa vì `ConfirmDialog` chỉ có một khe `error`. Hai nửa
 * vẫn tách rời ở tầng kiểu trong bản đồ; chỗ ghép là đây, và nó là chỗ duy
 * nhất.
 */
export function describeRoleChangeError(code: string | null, message: string): string {
  const entry =
    code === 'FORBIDDEN'
      ? err('admin.error.role-forbidden', { message })
      : code === 'NOT_FOUND'
        ? err('admin.error.role-not-found', { message })
        : err('admin.error.role-other', { message });
  return `${entry.what} ${entry.next}`;
}
