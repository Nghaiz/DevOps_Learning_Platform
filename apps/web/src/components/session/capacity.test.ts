import { describe, expect, it } from 'vitest';
import { describeCapacity } from './capacity';

/**
 * Ô AC 13.B/13.D: *"'Còn N chỗ' phản ánh trần thật của P12; chạm trần thì báo
 * trước, không để người dùng gặp 429 trần trụi."*
 *
 * Ca quan trọng nhất của file là ca "chưa biết": một hiện thực trả
 * `{remaining: 0}` cho dữ liệu vắng mặt sẽ ĐI QUA mọi ca còn lại và chỉ hỏng
 * khi orchestrator có sự cố — đúng lúc người học cần trang này chạy nhất.
 */
describe('describeCapacity', () => {
  it('CHƯA BIẾT (query lỗi/chưa chạy) ⇒ null, KHÔNG phải "đang đầy"', () => {
    expect(describeCapacity(null)).toBeNull();
    expect(describeCapacity(undefined)).toBeNull();
  });

  it('số không hữu hạn cũng là chưa biết', () => {
    expect(describeCapacity({ activeSessions: Number.NaN, softCapacity: 20 })).toBeNull();
    expect(describeCapacity({ activeSessions: 3, softCapacity: Number.NaN })).toBeNull();
  });

  it('còn chỗ ⇒ nhãn đếm đúng, không cảnh báo', () => {
    const hint = describeCapacity({ activeSessions: 3, softCapacity: 20 });
    expect(hint).toEqual({
      remaining: 17,
      exhausted: false,
      tone: 'ok',
      label: 'Còn 17 chỗ',
      warning: null,
    });
  });

  it('sắp hết ⇒ đổi tone nhưng vẫn không cảnh báo', () => {
    expect(describeCapacity({ activeSessions: 18, softCapacity: 20 })?.tone).toBe('low');
    expect(describeCapacity({ activeSessions: 18, softCapacity: 20 })?.warning).toBeNull();
  });

  it('chạm trần ⇒ cảnh báo TRƯỚC, và câu cảnh báo nói cả "chuyện gì" lẫn "làm gì tiếp"', () => {
    const hint = describeCapacity({ activeSessions: 20, softCapacity: 20 });
    expect(hint?.exhausted).toBe(true);
    expect(hint?.remaining).toBe(0);
    expect(hint?.label).toBe('Sandbox đang đầy');
    expect(hint?.warning).toContain('đang đầy');
    expect(hint?.warning).toContain('thử lại sau');
  });

  it('vượt trần (đo lệch nhịp) vẫn kẹp ở 0, không hiện số âm', () => {
    const hint = describeCapacity({ activeSessions: 25, softCapacity: 20 });
    expect(hint?.remaining).toBe(0);
    expect(hint?.exhausted).toBe(true);
  });

  it('trần mềm ÂM (poolTarget > trần cứng) vẫn kẹp ở 0', () => {
    expect(describeCapacity({ activeSessions: 0, softCapacity: -2 })?.remaining).toBe(0);
  });

  it('KHÔNG chôn hằng số trần: cùng số phiên, trần khác ⇒ nhãn khác', () => {
    // Nếu ai đó chép "20" vào FE thì ca này đỏ — đó là cả lý do nó tồn tại.
    expect(describeCapacity({ activeSessions: 5, softCapacity: 20 })?.label).toBe('Còn 15 chỗ');
    expect(describeCapacity({ activeSessions: 5, softCapacity: 8 })?.label).toBe('Còn 3 chỗ');
  });
});
