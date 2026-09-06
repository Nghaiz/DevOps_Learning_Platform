import { describe, expect, it } from 'vitest';
import {
  describeAuditAction,
  describeAuditActor,
  describeAuditDetail,
  describeAuditTarget,
  formatAuditMoment,
} from './audit-row';

describe('describeAuditActor — id không còn tra ngược được', () => {
  /**
   * `admin_audit.actor_id` cố ý KHÔNG có khoá ngoại tới `users` (nhật ký sống
   * lâu hơn tài khoản), nên một dòng CÓ THỂ nêu một id không còn tồn tại. Ô
   * trống ở cột "ai làm" đọc ra là "không ai làm" — sai hẳn nghĩa.
   */
  it('luôn hiện đúng id, không bao giờ trả ô trống', () => {
    expect(describeAuditActor('usr_da_xoa_7').text).toBe('usr_da_xoa_7');
  });

  it('giải thích vì sao chỉ có id chứ không có tên', () => {
    expect(describeAuditActor('usr_1').note).toContain('tài khoản đã xoá');
  });

  it('actor rỗng: nói "không rõ" và nói rõ đó là lỗi ghi, không phải "không ai làm"', () => {
    const view = describeAuditActor('   ');
    expect(view.text).toBe('không rõ');
    expect(view.text).not.toBe('');
    expect(view.note).toContain('không phải "không ai làm"');
  });
});

describe('describeAuditAction', () => {
  it('hai hành động đã biết có nhãn tiếng Việt', () => {
    expect(describeAuditAction('user.setRole')).toBe('Đổi vai trò người dùng');
    expect(describeAuditAction('session.terminate')).toBe('Kết thúc phiên của người dùng');
  });

  /** Nhật ký nuốt một hành động không nhận ra là nhật ký nói dối về phạm vi của chính nó. */
  it('hành động lạ hiện NGUYÊN chuỗi gốc', () => {
    expect(describeAuditAction('content.forceDelete')).toBe('content.forceDelete');
  });

  it('action rỗng vẫn nói được điều gì đó', () => {
    expect(describeAuditAction('')).toContain('không rõ');
  });
});

describe('describeAuditTarget', () => {
  it('gộp loại và id', () => {
    expect(describeAuditTarget('user', 'usr_9')).toBe('Người dùng usr_9');
    expect(describeAuditTarget('session', 'sess_9')).toBe('Phiên sess_9');
  });

  it('loại lạ giữ nguyên chuỗi gốc', () => {
    expect(describeAuditTarget('content', 'lesson-1')).toBe('content lesson-1');
  });

  it('id rỗng nói rõ là không rõ id', () => {
    expect(describeAuditTarget('user', '')).toContain('không rõ id');
  });
});

describe('describeAuditDetail', () => {
  it('đổi vai trò: đọc được CẢ vai trò cũ lẫn mới', () => {
    const text = describeAuditDetail('user.setRole', { from: 'user', to: 'admin' });
    expect(text).toContain('user');
    expect(text).toContain('admin');
  });

  it('kết thúc phiên: nêu lý do và chủ phiên', () => {
    const text = describeAuditDetail('session.terminate', {
      reason: 'admin_terminated',
      targetUserId: 'usr_hoc_9',
    });
    expect(text).toContain('admin_terminated');
    expect(text).toContain('usr_hoc_9');
  });

  /**
   * `targetUserId` CÓ THỂ null — `terminateSessionAsAdmin` đọc nó từ response
   * của orchestrator, và orchestrator có thể reap xong mà không trả session.
   */
  it('kết thúc phiên thiếu chủ phiên: vẫn đọc được lý do, chủ phiên nói "không rõ"', () => {
    const text = describeAuditDetail('session.terminate', {
      reason: 'admin_terminated',
      targetUserId: null,
    });
    expect(text).toContain('admin_terminated');
    expect(text).toContain('không rõ');
  });

  it('detail null: nói không có chi tiết, không phải ô trống', () => {
    expect(describeAuditDetail('user.setRole', null)).toBe('không có chi tiết');
  });

  /** Hình dạng lạ KHÔNG bị nuốt: hiện JSON thô còn hơn một câu tự tin và sai. */
  it('hình dạng lạ hiện JSON thô', () => {
    const text = describeAuditDetail('content.archive', { id: 'lesson-1', extra: [1, 2] });
    expect(text).toContain('lesson-1');
    expect(text).toContain('extra');
  });

  it('detail của hành động đã biết nhưng sai hình dạng: rơi về JSON thô, không ném', () => {
    expect(describeAuditDetail('user.setRole', { from: 42 })).toContain('42');
  });

  /** Trang nhật ký đổ vỡ vì một dòng dữ liệu lạ là trang vô dụng đúng lúc cần nó nhất. */
  it('dữ liệu không stringify được không làm đổ trang', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(() => describeAuditDetail('la', circular)).not.toThrow();
    expect(describeAuditDetail('la', circular)).toContain('không đọc được');
  });
});

describe('formatAuditMoment', () => {
  it('chuỗi hỏng thành "không rõ", không phải Invalid Date', () => {
    expect(formatAuditMoment('hôm kia')).toBe('không rõ');
  });

  it('thời điểm hợp lệ cho một chuỗi thật', () => {
    expect(formatAuditMoment('2026-09-06T10:00:00.000Z')).not.toBe('không rõ');
  });
});
