import { t } from '@devops-platform/copy';

/**
 * Đọc một dòng `admin_audit` (`admin.audit.list`) thành câu tiếng Việt, hàm
 * thuần, test được.
 *
 * ## Luật của cả file: nhật ký nói ĐÚNG thứ nó biết, và nói ra chỗ nó không biết
 *
 * `admin_audit.actor_id` cố ý KHÔNG có khoá ngoại tới `users` (chú thích ở
 * `schema.ts` và ở C4): nhật ký sống lâu hơn tài khoản. Hệ quả trực tiếp lên
 * giao diện là **một dòng có thể nêu một id không còn tồn tại**, và cách xử lý
 * đúng là hiện đúng id đó kèm nói rõ nó là một id, KHÔNG phải để trống hay tra
 * ngược ra "người dùng đã xoá" (ta không có bảng nào để tra).
 *
 * `detail` là `jsonb` tự do (`unknown` ở tầng đọc) vì mỗi hành động mang chi
 * tiết khác nhau. Hàm dưới đây đọc được hai hình dạng đã biết và **không giả
 * vờ** hiểu hình dạng thứ ba: hình dạng lạ hiện ra dưới dạng JSON thô, chứ
 * không bị nuốt.
 */

/**
 * Hành động lạ (một bản BFF mới hơn ghi một `action` FE chưa biết) hiện NGUYÊN
 * chuỗi gốc. Nhật ký mà nuốt một hành động không nhận ra là nhật ký nói dối về
 * chính phạm vi của mình.
 */
export function describeAuditAction(action: string): string {
  if (action.trim() === '') {
    return t('admin.audit.action-missing');
  }
  const known = AUDIT_ACTION_LABEL.get(action);
  return known === undefined ? action : known();
}

/**
 * Mọi `action` mà server ghi THẬT (grep `action: '` trong
 * `server/trpc/routers`). Hàm, không phải chuỗi đã dựng: bản đồ chữ chỉ được
 * đọc lúc gọi, cùng nhịp với mọi `t()` khác của file này.
 *
 * Sáu hành động lớp học và kỳ thi thêm 2026-10-03: trước đó chúng hiện ra
 * trong bảng nhật ký là chuỗi tiếng Anh trần (`exam.remove`) giữa một bảng toàn
 * tiếng Việt. Hành động chưa có ở đây vẫn hiện nguyên chuỗi gốc, không rỗng.
 *
 * `Map`, KHÔNG phải object literal: `action` là chuỗi từ DB, và
 * `record['toString']` trả về hàm của `Object.prototype` thay vì `undefined`.
 */
const AUDIT_ACTION_LABEL: ReadonlyMap<string, () => string> = new Map([
  ['user.setRole', () => t('admin.audit-action.set-role')],
  ['session.terminate', () => t('admin.audit-action.terminate')],
  ['class.create', () => t('admin.audit-action.class-create')],
  ['class.addMember', () => t('admin.audit-action.class-add-member')],
  ['class.removeMember', () => t('admin.audit-action.class-remove-member')],
  ['exam.create', () => t('admin.audit-action.exam-create')],
  ['exam.update', () => t('admin.audit-action.exam-update')],
  ['exam.remove', () => t('admin.audit-action.exam-remove')],
]);

export function describeAuditTarget(targetType: string, targetId: string): string {
  /*
   * `class` thêm 2026-09-14 (§18.F). Không có nhánh này thì ba hành động lớp
   * học hiện ra trong bảng nhật ký là chữ `class` trần — rơi về nhánh cuối, tức
   * KHÔNG hỏng, chỉ lạc quẻ giữa một bảng toàn tiếng Việt. Đó đúng là loại lỗi
   * không ai báo và cũng không ai sửa.
   */
  const type =
    targetType === 'user'
      ? t('admin.audit-target.user')
      : targetType === 'session'
        ? t('admin.audit-target.session')
        : targetType === 'class'
          ? t('admin.audit-target.class')
          : targetType === 'exam'
            ? t('admin.audit-target.exam')
            : targetType;
  return targetId.trim() === ''
    ? t('admin.audit.target-unknown-id', { type })
    : t('admin.audit.target', { type, id: targetId });
}

export interface ActorView {
  readonly text: string;
  /** Câu phụ giải thích vì sao chỉ có id, hoặc vì sao không có id. */
  readonly note: string;
  /**
   * `true` khi dòng nhật ký không ghi id người thực hiện. Câu giải thích chung
   * ("chỉ có id") đã nằm ở chú thích bảng; ca thiếu id thì câu riêng của nó phải
   * hiện ngay trong ô, không nấp trong `title` (chuột mới thấy, bàn phím và màn
   * hình cảm ứng không bao giờ thấy).
   */
  readonly missing: boolean;
}

/**
 * Người thực hiện.
 *
 * ⛔ KHÔNG bao giờ trả chuỗi rỗng. Một ô trống ở cột "ai làm" đọc ra là "không
 * ai làm", trong khi sự thật là "có người làm, ta chỉ không tra được tên nữa".
 */
export function describeAuditActor(actorId: string): ActorView {
  if (actorId.trim() === '') {
    return {
      text: t('admin.audit.actor-unknown'),
      note: t('admin.audit.actor-unknown-note'),
      missing: true,
    };
  }
  return { text: actorId, note: t('admin.audit.actor-note'), missing: false };
}

/**
 * Chi tiết của một dòng.
 *
 * Hai hình dạng đã biết được dịch sang tiếng Việt; mọi hình dạng khác trả JSON
 * thô. Cố "đoán" hình dạng thứ ba sẽ cho ra một câu tự tin và sai, còn JSON thô
 * thì xấu nhưng luôn đúng.
 */
export function describeAuditDetail(action: string, detail: unknown): string {
  if (detail === null || detail === undefined) {
    return t('admin.audit-detail.none');
  }

  if (action === 'user.setRole') {
    const roles = readRoleChange(detail);
    if (roles !== null) {
      return t('admin.audit-detail.role-change', { from: roles.from, to: roles.to });
    }
  }

  if (action === 'session.terminate') {
    const terminate = readTerminate(detail);
    if (terminate !== null) {
      return t('admin.audit-detail.terminate', {
        reason: terminate.reason,
        owner: terminate.targetUserId,
      });
    }
  }

  return stringifyDetail(detail);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readRoleChange(detail: unknown): { from: string; to: string } | null {
  const record = asRecord(detail);
  if (record === null) {
    return null;
  }
  const from: unknown = record['from'];
  const to: unknown = record['to'];
  return typeof from === 'string' && typeof to === 'string' ? { from, to } : null;
}

function readTerminate(detail: unknown): { reason: string; targetUserId: string } | null {
  const record = asRecord(detail);
  if (record === null) {
    return null;
  }
  const reason: unknown = record['reason'];
  if (typeof reason !== 'string') {
    return null;
  }
  const target: unknown = record['targetUserId'];
  // `targetUserId` CÓ THỂ null: `terminateSessionAsAdmin` đọc nó từ response
  // của orchestrator, và orchestrator có thể reap xong mà không trả session.
  return {
    reason,
    targetUserId:
      typeof target === 'string' && target !== '' ? target : t('admin.audit-detail.owner-unknown'),
  };
}

/**
 * `JSON.stringify` NÉM trên `BigInt` và trên tham chiếu vòng. Cả hai không nên
 * xuất hiện trong `jsonb` đọc lên từ Postgres, nhưng một trang nhật ký mà đổ vỡ
 * vì một dòng dữ liệu lạ là trang vô dụng đúng lúc cần nó nhất.
 */
function stringifyDetail(detail: unknown): string {
  try {
    return JSON.stringify(detail) ?? String(detail);
  } catch {
    return t('admin.audit-detail.unreadable');
  }
}
