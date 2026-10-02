import { describe, expect, it } from 'vitest';
import { ESCAPE_FOCUS_WINDOW_MS, createEscapeFocusDetector } from './escape-focus.ts';

/**
 * Ô AC D10, sửa ở M1: cử chỉ rời terminal là **`Esc` rồi `Tab`** (hoặc
 * `Shift+Tab`) trong ≤500ms — KHÔNG còn là `Esc Esc`.
 *
 * Vì sao đổi: gõ Esc hai lần để chắc chắn đã về normal mode là thói quen vim phổ
 * biến nhất, và `Esc Esc` đá focus ra đúng giữa lúc đó. Phương án "bỏ qua khi
 * đang ở alternate screen" KHÔNG dùng được ở nền tảng này: gateway exec vào
 * `tmux new-session -A -s dlp` với `TERM=xterm-256color`, tmux bật alternate
 * screen của xterm ngay khi attach — tức terminal LUÔN ở alternate screen, và
 * phép chặn đó sẽ tắt cử chỉ vĩnh viễn (bẫy focus, đúng thứ D10 phải tránh).
 */
describe('createEscapeFocusDetector — D10/M1: Esc rồi Tab', () => {
  it('MỘT lần Esc KHÔNG kích hoạt (vim còn cần phím này)', () => {
    const detector = createEscapeFocusDetector();
    expect(detector.press('Escape', 0)).toBe(false);
  });

  it('Esc Esc nhanh KHÔNG kích hoạt nữa — thói quen vim không được đá focus ra', () => {
    const detector = createEscapeFocusDetector();
    expect(detector.press('Escape', 0)).toBe(false);
    expect(detector.press('Escape', 100)).toBe(false);
    expect(detector.press('Escape', 200)).toBe(false);
  });

  it('Esc rồi Tab trong cửa sổ ⇒ kích hoạt', () => {
    const detector = createEscapeFocusDetector();
    detector.press('Escape', 0);
    expect(detector.press('Tab', 120)).toBe(true);
  });

  it('ĐÚNG mốc 500ms vẫn kích hoạt — ngưỡng là ≤, không phải <', () => {
    const detector = createEscapeFocusDetector();
    detector.press('Escape', 1000);
    expect(detector.press('Tab', 1000 + ESCAPE_FOCUS_WINDOW_MS)).toBe(true);
  });

  it('quá 500ms một mili-giây ⇒ Tab là Tab thường (hoàn tất lệnh trong shell)', () => {
    const detector = createEscapeFocusDetector();
    detector.press('Escape', 0);
    expect(detector.press('Tab', ESCAPE_FOCUS_WINDOW_MS + 1)).toBe(false);
  });

  it('Tab KHÔNG có Esc đứng trước ⇒ không kích hoạt', () => {
    const detector = createEscapeFocusDetector();
    expect(detector.press('Tab', 0)).toBe(false);
  });

  it('phím Shift (để gõ Shift+Tab) KHÔNG phá chuỗi — keydown của modifier bị bỏ qua', () => {
    const detector = createEscapeFocusDetector();
    detector.press('Escape', 0);
    expect(detector.press('Shift', 60)).toBe(false);
    expect(detector.press('Tab', 120)).toBe(true);
  });

  it('phím thường xen giữa ⇒ KHÔNG kích hoạt', () => {
    const detector = createEscapeFocusDetector();
    detector.press('Escape', 0);
    detector.press(':', 50);
    expect(detector.press('Tab', 100)).toBe(false);
  });

  it('Esc lặp lại làm MỚI mốc: Esc(0) Esc(400) Tab(800) vẫn kích hoạt', () => {
    const detector = createEscapeFocusDetector();
    detector.press('Escape', 0);
    detector.press('Escape', 400);
    expect(detector.press('Tab', 800)).toBe(true);
  });

  it('sau khi kích hoạt thì hết treo — Tab kế tiếp là Tab thường', () => {
    const detector = createEscapeFocusDetector();
    detector.press('Escape', 0);
    detector.press('Tab', 10);
    expect(detector.press('Tab', 20)).toBe(false);
  });

  it('reset() quên lần Esc đang treo', () => {
    const detector = createEscapeFocusDetector();
    detector.press('Escape', 0);
    detector.reset();
    expect(detector.press('Tab', 10)).toBe(false);
  });

  it('cửa sổ tuỳ biến được (dùng cho test, không phải cho production)', () => {
    const detector = createEscapeFocusDetector(50);
    detector.press('Escape', 0);
    expect(detector.press('Tab', 51)).toBe(false);
  });
});
