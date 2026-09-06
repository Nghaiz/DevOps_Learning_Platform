import { describe, expect, it } from 'vitest';
import {
  ASSIGNABLE_ROLES,
  ROLE_LABEL,
  describeRole,
  describeRoleChangeError,
  planRoleChange,
  roleBadgeVariant,
  type RoleChangeInput,
} from './role-change';

const ADMIN_ID = 'usr_admin_1';

function plan(over: Partial<RoleChangeInput> = {}) {
  return planRoleChange({
    actorId: ADMIN_ID,
    targetId: 'usr_hoc_9',
    targetEmail: 'hoc@example.test',
    currentRole: 'user',
    nextRole: 'author',
    ...over,
  });
}

describe('planRoleChange — chặn tự hạ quyền', () => {
  it('admin tự hạ mình xuống người học: KHÔNG cho bấm', () => {
    const result = plan({ targetId: ADMIN_ID, currentRole: 'admin', nextRole: 'user' });
    expect(result.allowed).toBe(false);
    expect(result.blockedReason).not.toBeNull();
  });

  it('admin tự hạ mình xuống người soạn bài: cũng KHÔNG cho bấm', () => {
    const result = plan({ targetId: ADMIN_ID, currentRole: 'admin', nextRole: 'author' });
    expect(result.allowed).toBe(false);
  });

  it('lý do nói đúng hậu quả, không chỉ "không được phép"', () => {
    const result = plan({ targetId: ADMIN_ID, currentRole: 'admin', nextRole: 'user' });
    expect(result.blockedReason).toContain('tài khoản của chính bạn');
    expect(result.blockedReason).toContain('SQL tay');
    expect(result.blockedReason).toContain('quản trị viên khác');
  });

  /**
   * Khớp điều kiện máy chủ TỪNG CHỮ (`actor.id === targetUserId && role !==
   * 'admin'`). Tự đặt mình thành `admin` không bị server chặn — nó chỉ vô
   * nghĩa, và nhánh "vai trò không đổi" bắt nó trước.
   */
  it('tự đặt mình thành admin: chặn vì KHÔNG ĐỔI, không phải vì tự hạ quyền', () => {
    const result = plan({ targetId: ADMIN_ID, currentRole: 'admin', nextRole: 'admin' });
    expect(result.allowed).toBe(false);
    expect(result.blockedReason).toContain('đã là');
  });

  /** ĐỐI CHỨNG DƯƠNG: không có ca này thì một hàm `allowed: false` vô điều kiện vẫn xanh. */
  it('hạ quyền NGƯỜI KHÁC vẫn được phép', () => {
    const result = plan({ targetId: 'usr_khac', currentRole: 'admin', nextRole: 'user' });
    expect(result.allowed).toBe(true);
    expect(result.blockedReason).toBeNull();
  });

  it('nâng quyền người khác được phép', () => {
    expect(plan({ currentRole: 'user', nextRole: 'admin' }).allowed).toBe(true);
  });
});

describe('planRoleChange — câu xác nhận', () => {
  it('gọi tên người dùng', () => {
    expect(plan().body).toContain('hoc@example.test');
    expect(plan().title).toContain('hoc@example.test');
  });

  it('nêu CẢ HAI vai trò, bằng tiếng Việt', () => {
    const result = plan({ currentRole: 'user', nextRole: 'admin' });
    expect(result.body).toContain(ROLE_LABEL.user);
    expect(result.body).toContain(ROLE_LABEL.admin);
  });

  it('nói rõ hành động được ghi vào nhật ký', () => {
    expect(plan().body).toContain('nhật ký quản trị');
  });

  it('nhãn nút nêu vai trò đích, không phải "Xác nhận" suông', () => {
    expect(plan({ nextRole: 'admin' }).confirmLabel).toContain(ROLE_LABEL.admin);
  });

  it('câu xác nhận vẫn đầy đủ ngay cả khi đang bị chặn (người dùng cần đọc được ngữ cảnh)', () => {
    const result = plan({ targetId: ADMIN_ID, currentRole: 'admin', nextRole: 'user' });
    expect(result.body).toContain(ROLE_LABEL.admin);
    expect(result.body).toContain(ROLE_LABEL.user);
  });
});

describe('nhãn vai trò', () => {
  it('ba vai trò gán được, xếp theo quyền tăng dần', () => {
    expect(ASSIGNABLE_ROLES).toEqual(['user', 'author', 'admin']);
  });

  it('mỗi vai trò có nhãn tiếng Việt riêng', () => {
    const labels = ASSIGNABLE_ROLES.map((role) => ROLE_LABEL[role]);
    expect(new Set(labels).size).toBe(3);
    expect(labels.every((label) => label.trim().length > 0)).toBe(true);
  });

  it('vai trò lạ giữ nguyên chuỗi gốc, không thành ô trống', () => {
    expect(describeRole('superuser')).toBe('superuser');
  });

  it('admin nổi bật khác hai vai trò còn lại', () => {
    expect(roleBadgeVariant('admin')).not.toBe(roleBadgeVariant('user'));
    expect(roleBadgeVariant('admin')).not.toBe(roleBadgeVariant('author'));
  });
});

describe('describeRoleChangeError', () => {
  it('FORBIDDEN: khẳng định KHÔNG có gì thay đổi', () => {
    const text = describeRoleChangeError('FORBIDDEN', 'Không thể tự hạ quyền admin của chính mình');
    expect(text).toContain('Không thể tự hạ quyền');
    expect(text).toContain('giữ nguyên');
  });

  it('NOT_FOUND: gợi ý tải lại danh sách', () => {
    expect(describeRoleChangeError('NOT_FOUND', 'Không có người dùng đó')).toContain('tải lại');
  });

  /**
   * Lỗi mạng KHÔNG được khẳng định "vai trò giữ nguyên": request có thể đã tới
   * server và đã ghi, chỉ có phản hồi là mất. Nói chắc điều ta không biết là
   * cách làm người trực đổi vai trò hai lần.
   */
  it('lỗi không rõ: không khẳng định dữ liệu chưa đổi', () => {
    const text = describeRoleChangeError(null, 'Không gọi được máy chủ.');
    expect(text).not.toContain('giữ nguyên');
    expect(text).toContain('Tải lại danh sách');
  });
});
