import { describe, expect, it } from 'vitest';
import { formatDay, formatMoment } from './format-moment';

/**
 * Bốn bản chép tay đã gộp về đây (xem chú thích của module). Bộ này gác đúng
 * hai điều mà việc gộp có thể làm hỏng: câu "không rõ" phải giữ nguyên ở cả ba
 * đầu vào hỏng, và `formatDay` phải TIẾP TỤC khác `formatMoment` — nếu không,
 * lần dọn trùng lặp này đã âm thầm thêm giờ vào bảng người dùng.
 */
describe('formatMoment', () => {
  it('null / chuỗi hỏng ⇒ "không rõ", không phải "Invalid Date"', () => {
    expect(formatMoment(null)).toBe('không rõ');
    expect(formatMoment('không-phải-ngày')).toBe('không rõ');
    expect(formatMoment('')).toBe('không rõ');
  });

  it('chuỗi ISO hợp lệ ⇒ có nội dung', () => {
    expect(formatMoment('2026-09-06T10:00:00.000Z')).not.toBe('không rõ');
  });
});

describe('formatDay', () => {
  it('null / chuỗi hỏng ⇒ cùng câu "không rõ" như formatMoment', () => {
    expect(formatDay(null)).toBe('không rõ');
    expect(formatDay('bậy bạ')).toBe('không rõ');
  });

  it('KHÁC formatMoment: chỉ ngày, không giờ — khác biệt CỐ Ý, không phải trùng lặp', () => {
    const iso = '2026-09-06T10:30:00.000Z';

    expect(formatDay(iso)).not.toBe(formatMoment(iso));
    // Ngày nằm trong cả hai; giờ chỉ nằm trong bản có giờ.
    expect(formatMoment(iso)).toContain(formatDay(iso));
    expect(formatMoment(iso).length).toBeGreaterThan(formatDay(iso).length);
  });
});
