import { describe, expect, it } from 'vitest';
import {
  POD_FALLBACK_SHELL,
  shellLabel,
  describeLeaderboardPreference,
  describeSessionShellFallback,
  describeShellPreference,
  describeTerminalThemePreference,
} from './preference-notices';

/**
 * D7 — `applySessionPreferences` trả `preferencesApplied: false` ở đường cold
 * (pod chưa được cấp) và KHÔNG ném. Người dùng vì thế có thể chọn `pwsh`, thấy
 * "Đã lưu", rồi nhận zsh mà không có gì nói cho họ biết. Các ca dưới đây gác
 * đúng câu chữ đóng lỗ đó.
 */
describe('describeShellPreference', () => {
  it('LUÔN nói ra ca không áp được — kể cả khi mọi thứ đang bình thường', () => {
    const notice = describeShellPreference({ shell: 'pwsh', activeSessionCount: 0 });
    const text = notice.lines.join(' ');

    expect(text).toContain('lần mở phiên TIẾP THEO');
    expect(text).toContain('bỏ qua tuỳ chọn');
    // Tên shell dự phòng phải là shell THẬT của pod. `.tmux.conf` của image đặt
    // zsh, nên viết "bash" ở đây là nói sai đúng lúc câu này cần đúng nhất.
    expect(text).toContain('zsh');
    expect(POD_FALLBACK_SHELL).toBe('zsh');
  });

  it('KHÔNG khẳng định tuỳ chọn đang có hiệu lực ngay bây giờ', () => {
    const text = describeShellPreference({ shell: 'zsh', activeSessionCount: 0 }).lines.join(' ');

    expect(text).not.toContain('đã áp dụng');
    expect(text).not.toContain('đang dùng');
    expect(text).not.toContain('có hiệu lực ngay');
  });

  it('đang có phiên chạy: cảnh báo rằng chúng giữ shell cũ', () => {
    const notice = describeShellPreference({ shell: 'bash', activeSessionCount: 2 });

    expect(notice.tone).toBe('warning');
    expect(notice.lines.join(' ')).toContain('2 phiên chạy');
    expect(notice.lines.join(' ')).toContain('giữ shell cũ');
  });

  it('còn trang nữa: con số là SÀN, nói "ít nhất N" thay vì một tổng sai', () => {
    // `me.activeSessions` phân trang; `items.length` của trang đầu không phải
    // tổng số phiên. Nói "2 phiên" khi thật ra có 7 là sai ở đúng ca cảnh báo
    // này quan trọng nhất.
    const notice = describeShellPreference({
      shell: 'bash',
      activeSessionCount: 20,
      moreSessions: true,
    });

    expect(notice.lines.join(' ')).toContain('ít nhất 20 phiên chạy');
  });

  it('không có phiên nào: không thêm câu cảnh báo', () => {
    const notice = describeShellPreference({ shell: 'bash', activeSessionCount: 0 });

    expect(notice.tone).toBe('default');
    expect(notice.lines).toHaveLength(1);
  });

  it('chưa đọc được số phiên (null): KHÔNG khẳng định "bạn không có phiên nào"', () => {
    // Một lượt `me.activeSessions` hỏng không phải bằng chứng về số phiên.
    const notice = describeShellPreference({ shell: 'bash', activeSessionCount: null });

    expect(notice.tone).toBe('default');
    expect(notice.lines).toHaveLength(1);
    expect(notice.lines.join(' ')).not.toContain('không có phiên');
  });
});

describe('describeLeaderboardPreference', () => {
  it('nói rõ phạm vi: chỉ áp cho lần thử SAU', () => {
    for (const publicName of [true, false]) {
      const text = describeLeaderboardPreference(publicName).lines.join(' ');
      expect(text).toContain('SAU');
      expect(text).toContain('đã nộp giữ lựa chọn của riêng chúng');
    }
  });

  it('tắt công tắc KHÔNG được đọc thành "ẩn tên khỏi mọi bảng xếp hạng"', () => {
    // `labs.startAttempt` chỉ SEED `lab_attempts.display_name_public`; các lần
    // đã nộp giữ giá trị cũ và đổi qua `labs.setDisplayPreference`.
    const text = describeLeaderboardPreference(false).lines.join(' ');

    expect(text).toContain('Những lần thử lab SAU sẽ ẩn danh');
    expect(text).not.toContain('mọi bảng');
    expect(text).not.toContain('tất cả');
  });
});

describe('describeTerminalThemePreference', () => {
  it('null = đi theo giao diện trang, và nói ra điều đó', () => {
    expect(describeTerminalThemePreference(null).lines[0]).toContain('theo giao diện');
  });

  it('chọn cụ thể = KHÔNG đổi theo giao diện trang nữa', () => {
    const text = describeTerminalThemePreference('dlp-contrast').lines.join(' ');
    expect(text).toContain('Tương phản cao');
    expect(text).toContain('kể cả khi bạn đổi giao diện trang');
  });
});

describe('describeSessionShellFallback', () => {
  it('nói ra CHUYỆN ĐÃ XẢY RA, không chỉ chuyện có thể xảy ra', () => {
    const notice = describeSessionShellFallback('pwsh');

    expect(notice).not.toBeNull();
    expect(notice?.tone).toBe('warning');
    expect(notice?.lines[0]).toContain('Phiên này đang chạy');
    expect(notice?.lines[0]).toContain(shellLabel(POD_FALLBACK_SHELL));
    expect(notice?.lines[0]).toContain(shellLabel('pwsh'));
  });

  it('nói LÀM GÌ TIẾP — và mượn nguyên câu chữ của /settings, không viết bản thứ hai', () => {
    const notice = describeSessionShellFallback('pwsh');
    const shared = describeShellPreference({ shell: 'pwsh', activeSessionCount: null });

    // Khẳng định QUAN HỆ giữa hai chỗ, không khẳng định lại nội dung: nếu ai đó
    // sửa câu ở `/settings` mà quên trang bài học, ca này đỏ.
    expect(notice?.lines).toEqual([notice?.lines[0], ...shared.lines]);
    // Nửa "làm gì tiếp" nay là một câu RIÊNG mở đầu bằng động từ viết hoa, nên
    // phép so phân biệt hoa thường phải đi theo. Khẳng định không đổi: câu của
    // `/settings` được mượn nguyên, không viết bản thứ hai.
    expect(notice?.lines.join(' ')).toContain('Mở lại phiên là áp được');
  });

  it('shell đã chọn TRÙNG mặc định của máy: im lặng, vì không có gì để báo', () => {
    // Người dùng vẫn nhận đúng thứ họ chọn — chỉ là nhờ mặc định của image chứ
    // không nhờ script. Một băng "phiên này dùng zsh chứ không phải zsh" là câu
    // vô nghĩa đặt đúng chỗ người đọc cần một câu rõ ràng.
    expect(describeSessionShellFallback(POD_FALLBACK_SHELL)).toBeNull();
  });
});
