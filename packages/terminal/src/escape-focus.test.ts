import { describe, expect, it } from 'vitest';
import { ESCAPE_FOCUS_WINDOW_MS, createEscapeFocusDetector } from './escape-focus.ts';

/**
 * Ô AC D10: *"`Esc` đơn là phím thật của terminal (vim); `Esc` hai lần trong
 * ≤500ms rời focus."*
 *
 * Hai vế, và vế ĐẦU mới là vế dễ mất: một detector bắt Esc đơn vẫn "chạy được"
 * với mọi thao tác chuột, và chỉ hỏng khi có người thật mở vim. Nên ca đầu tiên
 * dưới đây là ca quan trọng nhất của file.
 */
describe('createEscapeFocusDetector — D10', () => {
  it('MỘT lần Esc KHÔNG kích hoạt (vim còn cần phím này)', () => {
    const detector = createEscapeFocusDetector();
    expect(detector.press('Escape', 1_000)).toBe(false);
  });

  it('hai lần Esc trong cửa sổ ⇒ kích hoạt', () => {
    const detector = createEscapeFocusDetector();
    expect(detector.press('Escape', 1_000)).toBe(false);
    expect(detector.press('Escape', 1_400)).toBe(true);
  });

  it('ĐÚNG mốc 500ms vẫn kích hoạt — ngưỡng là ≤, không phải <', () => {
    const detector = createEscapeFocusDetector();
    detector.press('Escape', 1_000);
    expect(detector.press('Escape', 1_000 + ESCAPE_FOCUS_WINDOW_MS)).toBe(true);
  });

  it('quá 500ms một mili-giây ⇒ KHÔNG kích hoạt, và lần đó thành lần thứ nhất mới', () => {
    const detector = createEscapeFocusDetector();
    detector.press('Escape', 1_000);
    expect(detector.press('Escape', 1_501)).toBe(false);
    // Lần trễ đó không bị vứt đi: nó mở một cặp mới.
    expect(detector.press('Escape', 1_600)).toBe(true);
  });

  it('phím khác xen giữa hai Esc ⇒ KHÔNG kích hoạt (chuỗi vim `Esc :wq Esc`)', () => {
    const detector = createEscapeFocusDetector();
    detector.press('Escape', 1_000);
    detector.press(':', 1_050);
    detector.press('w', 1_080);
    detector.press('q', 1_100);
    expect(detector.press('Escape', 1_150)).toBe(false);
  });

  it('lần Esc thứ ba mở cặp MỚI, không ăn theo lần thứ hai (giữ phím auto-repeat)', () => {
    const detector = createEscapeFocusDetector();
    expect(detector.press('Escape', 0)).toBe(false);
    expect(detector.press('Escape', 100)).toBe(true);
    expect(detector.press('Escape', 200)).toBe(false);
    expect(detector.press('Escape', 300)).toBe(true);
  });

  it('reset() quên lần Esc đang treo', () => {
    const detector = createEscapeFocusDetector();
    detector.press('Escape', 1_000);
    detector.reset();
    expect(detector.press('Escape', 1_100)).toBe(false);
  });

  it('cửa sổ tuỳ biến được (dùng cho test, không phải cho production)', () => {
    const detector = createEscapeFocusDetector(50);
    detector.press('Escape', 0);
    expect(detector.press('Escape', 80)).toBe(false);
  });
});
