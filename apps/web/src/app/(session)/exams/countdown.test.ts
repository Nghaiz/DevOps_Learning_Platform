import { describe, expect, it } from 'vitest';

import { COUNTDOWN_RESYNC_MS, COUNTDOWN_TICK_MS, formatCountdown, remainingFrom } from './countdown';

const anchor = { remainingMsAtSync: 600_000, monotonicAtSync: 1_000 };

describe('remainingFrom', () => {
  it('trừ đúng phần đã trôi qua theo đồng hồ đơn điệu', () => {
    expect(remainingFrom(anchor, 1_000)).toBe(600_000);
    expect(remainingFrom(anchor, 61_000)).toBe(540_000);
  });

  it('hết giờ trả 0, không trả số âm', () => {
    // Một số âm vẽ ra `-00:03` và đọc như lỗi hiển thị, trong khi thứ đang xảy
    // ra là bài đã đóng.
    expect(remainingFrom(anchor, 999_999)).toBe(0);
  });

  /*
   * ⛔ Ô GÁC CỦA AC-7, và nó đo bằng cách KHÔNG cấp cho hàm một `Date` nào.
   *
   * `remainingFrom` chỉ nhận hai con số đơn điệu. Không có tham số nào để đồng
   * hồ hệ thống chui vào, nên "đổi giờ máy khách" không biểu diễn được ở đây,
   * và đó chính là điều cần khẳng định: một bản cài đặt dùng
   * `deadline - Date.now()` sẽ không lắp vừa chữ ký này.
   */
  it('chữ ký hàm KHÔNG có chỗ cho đồng hồ hệ thống chui vào', () => {
    // Hai lần gọi cách nhau đúng 1 phút theo đồng hồ đơn điệu phải cho kết quả
    // lệch đúng 1 phút, bất kể `Date.now()` ở đâu giữa hai lần gọi.
    const before = remainingFrom(anchor, 10_000);
    const after = remainingFrom(anchor, 70_000);
    expect(before - after).toBe(60_000);
  });

  it('mốc neo mới ghi đè hoàn toàn mốc cũ', () => {
    // Đây là hình dạng của một lượt đồng bộ lại: máy chủ nói "còn 5 phút", và
    // từ đó mọi phép trừ tính lại từ mốc mới, không cộng dồn sai lệch cũ.
    const resynced = { remainingMsAtSync: 300_000, monotonicAtSync: 500_000 };
    expect(remainingFrom(resynced, 500_000)).toBe(300_000);
    expect(remainingFrom(resynced, 560_000)).toBe(240_000);
  });
});

describe('formatCountdown', () => {
  it('mm:ss khi dưới một giờ', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(9_000)).toBe('00:09');
    expect(formatCountdown(605_000)).toBe('10:05');
  });

  it('h:mm:ss khi trên một giờ', () => {
    expect(formatCountdown(3_600_000)).toBe('1:00:00');
    expect(formatCountdown(7_384_000)).toBe('2:03:04');
  });

  /*
   * Bề rộng cố định là một yêu cầu về THỊ GIÁC, không phải thẩm mỹ: một chuỗi
   * đổi độ dài ở mốc 10 giây làm cả khối chữ nhảy ngang, và trên màn hình mà
   * người ta liếc mỗi vài giây thì chuyển động đó là thứ duy nhất mắt bắt được.
   */
  it('phút và giây LUÔN hai chữ số', () => {
    for (const ms of [1_000, 11_000, 61_000, 601_000]) {
      expect(formatCountdown(ms)).toMatch(/^\d{2}:\d{2}$/u);
    }
  });

  it('số âm đọc ra 00:00, không đọc ra một chuỗi lạ', () => {
    expect(formatCountdown(-5_000)).toBe('00:00');
  });

  it('làm tròn XUỐNG, không làm tròn lên', () => {
    // Làm tròn lên sẽ hiện `00:01` khi thực tế còn 400ms, tức nói với người thi
    // rằng họ còn một giây mà họ không còn.
    expect(formatCountdown(1_999)).toBe('00:01');
    expect(formatCountdown(400)).toBe('00:00');
  });
});

describe('hằng số nhịp', () => {
  it('nhịp vẽ dày hơn một giây, nhịp đồng bộ thưa hơn nhiều', () => {
    expect(COUNTDOWN_TICK_MS).toBeLessThan(1_000);
    expect(COUNTDOWN_RESYNC_MS).toBeGreaterThan(COUNTDOWN_TICK_MS * 10);
  });
});
