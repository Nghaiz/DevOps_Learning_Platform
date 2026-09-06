import { describe, expect, it } from 'vitest';
import { avatarInitials } from './initials';

describe('avatarInitials — từ tên', () => {
  it('họ và tên tiếng Việt lấy chữ đầu của từ ĐẦU và từ CUỐI', () => {
    expect(avatarInitials('Nguyễn Văn An', 'nva@example.com')).toBe('NA');
  });

  it('giữ nguyên dấu — không rơi về chữ cái trần', () => {
    expect(avatarInitials('Đặng Thu Hà', 'dth@example.com')).toBe('ĐH');
  });

  /**
   * Đối chứng cho việc chuẩn hoá NFC. Chuỗi dưới đây là "Ễ" viết TỔ HỢP
   * (`E` + U+0302 + U+0303) — trông y hệt trên màn hình nhưng khác byte. Không
   * có `normalize('NFC')` thì kết quả là `E` trần và test này đỏ.
   */
  it('tên viết dạng tổ hợp (NFD) vẫn ra ký tự có dấu', () => {
    expect(avatarInitials('E\u0302\u0303m Be\u0301', 'e@example.com')).toBe('ỄB');
  });

  it('một từ duy nhất ra đúng một ký tự', () => {
    expect(avatarInitials('Hà', 'ha@example.com')).toBe('H');
  });

  it('khoảng trắng thừa không sinh ký tự rỗng', () => {
    expect(avatarInitials('   Lê    Minh   ', 'lm@example.com')).toBe('LM');
  });
});

describe('avatarInitials — rơi về email khi tên rỗng', () => {
  it('phần trước @ tách theo dấu chấm', () => {
    expect(avatarInitials('', 'van.an@example.com')).toBe('VA');
  });

  it('tách theo gạch dưới, gạch ngang và dấu cộng', () => {
    expect(avatarInitials('', 'thu_ha@example.com')).toBe('TH');
    expect(avatarInitials('', 'minh-tu@example.com')).toBe('MT');
    expect(avatarInitials('', 'an+dlp@example.com')).toBe('AD');
  });

  it('email không có dấu phân tách ra một ký tự', () => {
    expect(avatarInitials('', 'admin@example.com')).toBe('A');
  });

  it('tên chỉ toàn khoảng trắng vẫn coi là rỗng', () => {
    expect(avatarInitials('   ', 'admin@example.com')).toBe('A');
  });
});

describe('avatarInitials — biên', () => {
  it('không bao giờ dài quá hai ký tự', () => {
    for (const name of ['Nguyễn Thị Bích Ngọc Ánh', 'a b c d e f g']) {
      expect(Array.from(avatarInitials(name, 'x@example.com')).length).toBeLessThanOrEqual(2);
    }
  });

  it('ký tự ngoài BMP không bị cắt thành nửa surrogate', () => {
    const result = avatarInitials('\u{1F680} Team', 'x@example.com');
    expect(Array.from(result).length).toBe(2);
    expect(result.codePointAt(0)).toBe(0x1f680);
  });

  it('cả tên lẫn email rỗng ra dấu hỏi, KHÔNG ra chuỗi rỗng', () => {
    expect(avatarInitials('', '')).toBe('?');
  });
});
