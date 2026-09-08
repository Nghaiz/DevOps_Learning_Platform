import { describe, expect, it } from 'vitest';
import {
  BOB_AMPLITUDE,
  REDUCED_DURATION_S,
  SPAWN_DURATION_S,
  bobOffset,
  clamp01,
  easeOutBack,
  easeOutCubic,
  lerp,
  phaseFromId,
  pulse01,
  transitionDuration,
} from './scene-motion';

describe('easeOutBack', () => {
  it('đi từ 0 tới 1', () => {
    expect(easeOutBack(0)).toBeCloseTo(0);
    expect(easeOutBack(1)).toBeCloseTo(1);
  });

  /**
   * Vượt nhẹ là CẢ MỤC ĐÍCH của hàm này (§9.3 "ease vượt nhẹ rồi lắng"). Một
   * ease-out thường cũng chạy 0→1 và cũng "trông mượt", nên không có ô này thì
   * việc dùng nhầm hàm sẽ không bao giờ bị phát hiện.
   */
  it('có vượt quá 1 ở quãng giữa', () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => easeOutBack(i / 100)));
    expect(peak).toBeGreaterThan(1);
    // …nhưng không nảy như bóng cao su.
    expect(peak).toBeLessThan(1.15);
  });

  it('kẹp đầu vào ngoài khoảng', () => {
    expect(easeOutBack(-1)).toBeCloseTo(easeOutBack(0));
    expect(easeOutBack(5)).toBeCloseTo(easeOutBack(1));
  });
});

describe('easeOutCubic', () => {
  it('đơn điệu tăng, không vượt', () => {
    let previous = -1;
    for (let i = 0; i <= 100; i += 1) {
      const value = easeOutCubic(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
  });
});

describe('phaseFromId', () => {
  /**
   * Hai nửa của §9.3, và cả hai đều cần thiết:
   * — khác pha, nếu không cả cảnh đập như một khối và đọc ra là lỗi vẽ;
   * — bất biến theo uid, nếu không pod giật mỗi lần trạng thái đổi.
   */
  it('cùng uid thì cùng pha, mãi mãi', () => {
    expect(phaseFromId('pod-web-1')).toBe(phaseFromId('pod-web-1'));
  });

  it('uid khác nhau cho pha khác nhau', () => {
    const phases = new Set(Array.from({ length: 200 }, (_, i) => phaseFromId(`pod-${String(i)}`)));
    // Va chạm hash vài lần trong 200 chuỗi là chấp nhận được; đập cùng nhịp thì không.
    expect(phases.size).toBeGreaterThan(190);
  });

  it('luôn nằm trong một vòng tròn', () => {
    for (const id of ['', 'a', 'pod-rất-dài-tên-có-dấu', '💥']) {
      const phase = phaseFromId(id);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(Math.PI * 2);
    }
  });
});

describe('bobOffset', () => {
  it('không bao giờ vượt biên độ đã khai', () => {
    for (let t = 0; t < 20; t += 0.05) {
      expect(Math.abs(bobOffset(t, 0.7))).toBeLessThanOrEqual(BOB_AMPLITUDE + 1e-9);
    }
  });

  it('hai pod khác pha thì lệch nhau tại cùng một thời điểm', () => {
    const a = bobOffset(1.1, phaseFromId('pod-a'));
    const b = bobOffset(1.1, phaseFromId('pod-b'));
    expect(Math.abs(a - b)).toBeGreaterThan(1e-6);
  });
});

describe('pulse01', () => {
  it('nằm trong 0..1', () => {
    for (let t = 0; t < 10; t += 0.05) {
      const value = pulse01(t, 2.1);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('transitionDuration', () => {
  /**
   * §9.3 nói rõ: `prefers-reduced-motion` RÚT chuyển tiếp còn ~1 frame, KHÔNG
   * xoá nó. Xoá hẳn thì vật thể nhảy cóc, và nhảy cóc chính là thứ khó chịu nhất
   * với đúng nhóm người đã bật tuỳ chọn đó.
   */
  it('rút còn một frame khi giảm chuyển động, không xoá hẳn', () => {
    expect(transitionDuration(SPAWN_DURATION_S, true)).toBe(REDUCED_DURATION_S);
    expect(transitionDuration(SPAWN_DURATION_S, true)).toBeGreaterThan(0);
    expect(transitionDuration(SPAWN_DURATION_S, false)).toBe(SPAWN_DURATION_S);
  });
});

describe('clamp01 / lerp', () => {
  it('kẹp và nội suy', () => {
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(lerp(2, 4, 0.5)).toBe(3);
  });
});
