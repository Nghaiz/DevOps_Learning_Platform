// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COUNTDOWN_RESYNC_MS, COUNTDOWN_TICK_MS } from './countdown';
import { useCountdown } from './use-countdown';

/**
 * Hồi quy review-1 #5: bộ hiệu chỉnh 30 giây của đồng hồ thi không bao giờ bắn.
 *
 * Nơi gọi thật truyền một callback MỚI ở mỗi lượt render (nó phụ thuộc đối
 * tượng kết quả của query), và nhịp 250ms làm component render lại liên tục.
 * Test dựng đúng điều kiện đó: mỗi lượt render một `onExpire` mới, cùng trỏ về
 * một bộ đếm.
 */
beforeEach(() => {
  // `performance` PHẢI được giả cùng bộ hẹn giờ: có vậy số hiển thị mới đổi ở
  // mỗi nhịp và component mới render lại, đúng điều kiện làm hỏng bản cũ. Giả
  // mỗi `setInterval` thì số đứng yên, React bỏ qua lượt render, và test xanh
  // trên cả bản lỗi (đã đo).
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useCountdown', () => {
  it('lượt hiệu chỉnh vẫn bắn sau 30 giây dù callback đổi ở mỗi lượt render', () => {
    const calls = vi.fn();
    renderHook(() => useCountdown(10 * 60_000, false, () => calls()));

    // Từng nhịp một, mỗi nhịp một `act`: React chỉ xả lượt render khi `act`
    // đóng, nên một `act` bọc cả 30 giây sẽ không render lại lần nào giữa chừng
    // và test xanh trên cả bản lỗi (đã đo).
    const ticks = Math.ceil(COUNTDOWN_RESYNC_MS / COUNTDOWN_TICK_MS) + 1;
    for (let index = 0; index < ticks; index += 1) {
      act(() => {
        vi.advanceTimersByTime(COUNTDOWN_TICK_MS);
      });
    }

    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('chạm 0 thì hỏi máy chủ đúng một lần, không lặp mỗi nhịp', () => {
    const calls = vi.fn();
    renderHook(() => useCountdown(2 * COUNTDOWN_TICK_MS, false, () => calls()));

    act(() => {
      vi.advanceTimersByTime(10 * COUNTDOWN_TICK_MS);
    });

    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('lượt đã đóng thì không hẹn giờ nào chạy', () => {
    const calls = vi.fn();
    renderHook(() => useCountdown(10 * 60_000, true, () => calls()));

    act(() => {
      vi.advanceTimersByTime(2 * COUNTDOWN_RESYNC_MS);
    });

    expect(calls).not.toHaveBeenCalled();
  });
});
