import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  describePasswordChangeError,
  describePasswordSection,
  validatePasswordChange,
} from './account-sections';

describe('describePasswordSection', () => {
  it('hasPassword = false: ẨN form và NÓI vì sao', () => {
    // `me.get.hasPassword` là false khi bảng `accounts` không có dòng
    // `providerId = 'credential'` — tài khoản Google/Microsoft. Hiện form cho
    // họ là bẫy: họ gõ một "mật khẩu hiện tại" chưa từng tồn tại.
    const section = describePasswordSection(false);

    expect(section.visible).toBe(false);
    expect(section.reason).not.toBeNull();
    expect(section.reason).toContain('Google');
    expect(section.reason).toContain('Microsoft');
  });

  it('hasPassword = true: hiện form, không kèm lời giải thích thừa', () => {
    const section = describePasswordSection(true);

    expect(section.visible).toBe(true);
    expect(section.reason).toBeNull();
  });
});

describe('validatePasswordChange', () => {
  it('thiếu mật khẩu hiện tại', () => {
    expect(validatePasswordChange({ current: '', next: 'matkhaumoi1', confirm: 'matkhaumoi1' })).toBe(
      'Nhập mật khẩu hiện tại để xác nhận đây là bạn.',
    );
  });

  it('mật khẩu mới ngắn hơn ngưỡng của Better Auth', () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    const error = validatePasswordChange({ current: 'cu', next: short, confirm: short });

    expect(error).toContain(String(MIN_PASSWORD_LENGTH));
    expect(error).toContain('Thêm ký tự');
  });

  it('hai ô mới không khớp', () => {
    const error = validatePasswordChange({ current: 'cu', next: 'matkhaumoi1', confirm: 'matkhaumoi2' });
    expect(error).toContain('chưa khớp');
  });

  it('hợp lệ ⇒ null', () => {
    expect(
      validatePasswordChange({ current: 'cu', next: 'matkhaumoi1', confirm: 'matkhaumoi1' }),
    ).toBeNull();
  });

  it('KHÔNG chặn khi mật khẩu mới trùng mật khẩu cũ — đó là việc của server', () => {
    expect(validatePasswordChange({ current: 'giongnhau1', next: 'giongnhau1', confirm: 'giongnhau1' })).toBeNull();
  });
});

describe('describePasswordChangeError', () => {
  it('INVALID_PASSWORD chỉ đúng vào ô mật khẩu HIỆN TẠI', () => {
    const text = describePasswordChangeError('INVALID_PASSWORD', 'Invalid password');

    expect(text).toContain('hiện tại');
    expect(text).toContain('ô đầu tiên');
    expect(text).not.toContain('mật khẩu mới');
  });

  it('lỗi khác: giữ câu của máy chủ rồi nói làm gì tiếp', () => {
    const text = describePasswordChangeError(null, 'Máy chủ bận.');
    expect(text).toContain('Máy chủ bận.');
    expect(text).toContain('Thử lại');
  });

  it('không có câu nào từ máy chủ: vẫn phải nói làm gì tiếp', () => {
    expect(describePasswordChangeError(null, null)).toContain('thử lại');
  });
});
