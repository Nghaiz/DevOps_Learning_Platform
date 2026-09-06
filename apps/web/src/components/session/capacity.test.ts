import { describe, expect, it } from 'vitest';
import { describeCapacity } from './capacity';
import {
  LOW_CAPACITY_RATIO,
  describeCapacity as describeShellCapacity,
} from '../shell/capacity';

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

/**
 * Cổng CHỐNG-LỆCH giữa hai chỗ hiển thị.
 *
 * Đây là ca đã hỏng thật: vỏ dùng ngưỡng tỉ lệ 20% trần mềm, khung phiên dùng
 * ngưỡng cố định `LOW_REMAINING = 3`. Với trần 20 và 16 phiên đang chạy, badge
 * trên thanh đầu trang đọc "sắp hết chỗ" còn nhãn cạnh nút Bắt đầu ngay bên
 * dưới đọc "còn 4 chỗ" bình thường — cùng dữ liệu, cùng màn hình.
 *
 * Kiểm bằng CẢ HAI hàm thật, không kiểm "hằng số này bằng hằng số kia": một
 * phép kiểm so hai hằng vẫn xanh khi ai đó thêm một nhánh `if` chỉ ở một bên.
 */
describe('vỏ và khung phiên nói cùng một mức', () => {
  const cases: ReadonlyArray<{ activeSessions: number; softCapacity: number }> = [
    { activeSessions: 0, softCapacity: 20 },
    { activeSessions: 15, softCapacity: 20 },
    // Ca đã hỏng: còn 4/20 = đúng ngưỡng 20%; ngưỡng cố định 3 đọc ra 'ok'.
    { activeSessions: 16, softCapacity: 20 },
    { activeSessions: 18, softCapacity: 20 },
    { activeSessions: 20, softCapacity: 20 },
    { activeSessions: 25, softCapacity: 20 },
    { activeSessions: 7, softCapacity: 10 },
    { activeSessions: 8, softCapacity: 10 },
    { activeSessions: 4, softCapacity: 30 },
    { activeSessions: 0, softCapacity: 0 },
  ];

  it.each(cases)('cùng tone và cùng số còn lại tại $activeSessions/$softCapacity', (snapshot) => {
    const hint = describeCapacity(snapshot);
    const reading = describeShellCapacity({
      ...snapshot,
      hardCapacity: snapshot.softCapacity + 3,
      fetchedAt: '2026-09-06T10:00:00.000Z',
    });
    expect(hint).not.toBeNull();
    expect(hint?.tone).toBe(reading.tone);
    expect(hint?.remaining).toBe(reading.remaining);
  });

  it('ngưỡng "sắp hết" co giãn theo trần, không phải một số phiên cố định', () => {
    // 20% của 20 = 4 ⇒ còn 4 là "sắp hết", còn 5 thì chưa.
    expect(describeCapacity({ activeSessions: 16, softCapacity: 20 })?.tone).toBe('low');
    expect(describeCapacity({ activeSessions: 15, softCapacity: 20 })?.tone).toBe('ok');
    // Trần đổi ⇒ ngưỡng đổi theo, không cần sửa dòng nào ở FE.
    expect(describeCapacity({ activeSessions: 8, softCapacity: 10 })?.tone).toBe('low');
    expect(describeCapacity({ activeSessions: 7, softCapacity: 10 })?.tone).toBe('ok');
    expect(LOW_CAPACITY_RATIO).toBe(0.2);
  });

  it('"chưa biết" vẫn là null SAU khi gộp — không rơi về 0 rồi đọc thành "đầy"', () => {
    // Ca dễ mất nhất khi gộp: vỏ vốn nhận đầu vào không-null, nên một bản gộp
    // cẩu thả sẽ bỏ mất cổng này và biến một lỗi mạng thành "Sandbox đang đầy".
    for (const unknown of [null, undefined, { activeSessions: Number.NaN, softCapacity: 20 }]) {
      expect(describeCapacity(unknown)).toBeNull();
    }
  });
});
