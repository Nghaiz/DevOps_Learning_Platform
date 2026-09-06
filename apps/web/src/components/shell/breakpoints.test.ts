import { describe, expect, it } from 'vitest';
import {
  DESKTOP_TARGET_MIN_PX,
  NAV_COLLAPSE_MAX_PX,
  TERMINAL_MIN_WIDTH_PX,
  meetsTerminalWidth,
} from './breakpoints';

describe('hợp đồng điểm ngắt (13.B mục 8 / C6)', () => {
  /**
   * Bất biến thật, không phải một hằng số chép lại: ba mốc phải xếp đúng thứ tự
   * để hạ cấp có nghĩa. Đổi một số sao cho nav thu SAU khi terminal đã tắt (hay
   * mục tiêu desktop hẹp hơn mức mở được terminal) là một bố cục tự mâu thuẫn,
   * và nó sẽ trông "gần đúng" trên máy người sửa.
   */
  it('nav thu trước khi terminal tắt, và cả hai dưới mục tiêu desktop', () => {
    expect(NAV_COLLAPSE_MAX_PX).toBeLessThan(TERMINAL_MIN_WIDTH_PX);
    expect(TERMINAL_MIN_WIDTH_PX).toBeLessThanOrEqual(DESKTOP_TARGET_MIN_PX);
  });

  it('giữ đúng ba con số hợp đồng C6/plan', () => {
    expect(NAV_COLLAPSE_MAX_PX).toBe(768);
    expect(TERMINAL_MIN_WIDTH_PX).toBe(1024);
    expect(DESKTOP_TARGET_MIN_PX).toBe(1280);
  });

  it('meetsTerminalWidth bao gồm chính mốc, loại một pixel dưới mốc', () => {
    expect(meetsTerminalWidth(TERMINAL_MIN_WIDTH_PX)).toBe(true);
    expect(meetsTerminalWidth(TERMINAL_MIN_WIDTH_PX - 1)).toBe(false);
    expect(meetsTerminalWidth(1920)).toBe(true);
    expect(meetsTerminalWidth(360)).toBe(false);
  });
});
