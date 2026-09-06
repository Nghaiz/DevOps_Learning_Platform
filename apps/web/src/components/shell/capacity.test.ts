import { describe, expect, it } from 'vitest';
import { LOW_CAPACITY_RATIO, describeCapacity, formatFetchedAt } from './capacity';

function view(activeSessions: number, softCapacity: number, hardCapacity = softCapacity + 3) {
  return { activeSessions, softCapacity, hardCapacity, fetchedAt: '2026-09-06T10:00:00.000Z' };
}

describe('describeCapacity — số còn lại', () => {
  it('còn = soft − active', () => {
    expect(describeCapacity(view(5, 17)).remaining).toBe(12);
  });

  it('không bao giờ âm khi active vượt trần mềm (pool đang trả pod về)', () => {
    const reading = describeCapacity(view(19, 17));
    expect(reading.remaining).toBe(0);
    expect(reading.tone).toBe('full');
  });

  /**
   * Cổng chống hằng số viết tay: nếu ai đó thay `view.softCapacity` bằng 20 hay
   * 23 (hai con số đã lưu hành trong các report P12), cùng một đầu vào sẽ ra
   * một số khác — và test này đỏ. Trần mềm là thứ orchestrator TÍNH, FE chỉ trừ.
   */
  it('bám trần trong payload, không bám một hằng số của riêng FE', () => {
    expect(describeCapacity(view(4, 8)).label).toBe('Còn 4 chỗ');
    expect(describeCapacity(view(4, 30)).label).toBe('Còn 26 chỗ');
    expect(describeCapacity(view(4, 17)).label).toBe('Còn 13 chỗ');
  });
});

describe('describeCapacity — ba mức', () => {
  it('ok khi còn nhiều hơn ngưỡng tỉ lệ', () => {
    const reading = describeCapacity(view(0, 20));
    expect(reading.tone).toBe('ok');
    expect(reading.label).toBe('Còn 20 chỗ');
  });

  it('low ở đúng ngưỡng tỉ lệ, và ngưỡng co giãn theo trần', () => {
    // 20% của 20 = 4 ⇒ còn 4 là "sắp hết", còn 5 thì chưa.
    expect(describeCapacity(view(16, 20)).tone).toBe('low');
    expect(describeCapacity(view(15, 20)).tone).toBe('ok');
    // Trần đổi ⇒ ngưỡng đổi theo, không cần sửa dòng nào.
    expect(describeCapacity(view(8, 10)).tone).toBe('low');
    expect(describeCapacity(view(7, 10)).tone).toBe('ok');
    expect(LOW_CAPACITY_RATIO).toBe(0.2);
  });

  it('full khi hết chỗ, và câu nói rõ phải làm gì tiếp', () => {
    const reading = describeCapacity(view(17, 17));
    expect(reading.tone).toBe('full');
    expect(reading.label).toBe('Hết chỗ');
    expect(reading.detail).toContain('sẽ bị từ chối');
    expect(reading.detail).toContain('Của tôi');
  });

  it('trần mềm 0 (pool ăn hết quota) đọc là hết chỗ, không phải "còn 0 chỗ"', () => {
    expect(describeCapacity(view(0, 0, 3)).tone).toBe('full');
  });
});

describe('describeCapacity — câu hiển thị', () => {
  it('mọi mức đều nêu cả active lẫn hai trần', () => {
    for (const reading of [
      describeCapacity(view(0, 20, 23)),
      describeCapacity(view(18, 20, 23)),
      describeCapacity(view(20, 20, 23)),
    ]) {
      expect(reading.detail).toContain('20');
      expect(reading.detail).toContain('trần cứng 23');
    }
  });

  /**
   * "Hết chỗ" là đúng chỗ một sản phẩm thương mại sẽ chèn "nâng cấp gói để có
   * thêm sandbox". Nền tảng này KHÔNG có phần đó (ràng buộc chủ dự án), nên câu
   * hết chỗ phải chỉ sang việc kết thúc một phiên, không sang việc mua thêm.
   *
   * Chỉ kiểm tiếng Việt — nửa tiếng Anh do lệnh grep AC ở `phase-13-exec.md` §5
   * gác; xem chú thích cùng lý do ở `nav.test.ts`.
   */
  it('không chứa lối thoát thương mại nào', () => {
    const all = [describeCapacity(view(0, 20)), describeCapacity(view(20, 20))]
      .flatMap((reading) => [reading.label, reading.detail])
      .join(' ');
    expect(all).not.toMatch(/giá|gói cước|thanh toán|nâng cấp|dùng thử/i);
  });
});

describe('formatFetchedAt', () => {
  it('trả chuỗi giờ cho thời điểm hợp lệ', () => {
    expect(formatFetchedAt('2026-09-06T10:00:00.000Z')).not.toBeNull();
  });

  it('trả null (không phải "Invalid Date") cho chuỗi rác', () => {
    expect(formatFetchedAt('không-phải-thời-điểm')).toBeNull();
    expect(formatFetchedAt('')).toBeNull();
  });
});
