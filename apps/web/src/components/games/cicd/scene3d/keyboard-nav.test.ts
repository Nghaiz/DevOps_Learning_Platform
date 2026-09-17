/**
 * Ghim điều hướng bàn phím của cảnh 3D (D.4.8 ở chế độ 3D).
 *
 * Ô nặng nhất là ô BẪY TIÊU ĐIỂM: `Tab` ở node cuối phải trả `handled: false` để
 * trình duyệt đưa tiêu điểm ra khỏi cảnh. Nuốt nó thì người dùng bàn phím vào
 * được cảnh mà không ra được — một lỗi a11y nặng hơn hẳn thứ nó định sửa, và là
 * loại lỗi không ai dùng chuột phát hiện ra.
 */
import { describe, expect, it } from 'vitest';

import { clampFocus, navIntentOf, resolveFocus } from './keyboard-nav';

describe('navIntentOf', () => {
  it.each([
    ['ArrowRight', 'next'],
    ['ArrowDown', 'next'],
    ['ArrowLeft', 'previous'],
    ['ArrowUp', 'previous'],
    ['Home', 'first'],
    ['End', 'last'],
    ['Enter', 'select'],
    [' ', 'select'],
    ['Escape', 'clear'],
  ])('đọc %s thành %s', (key, intent) => {
    expect(navIntentOf(key, false)).toBe(intent);
  });

  it('Tab đi tiếp, Shift+Tab đi lùi', () => {
    expect(navIntentOf('Tab', false)).toBe('next-or-exit');
    expect(navIntentOf('Tab', true)).toBe('previous-or-exit');
  });

  /*
   * Trả `null` là một hợp đồng, không phải một mặc định tiện tay: chỗ gọi dựa
   * vào nó để KHÔNG `preventDefault`. Nuốt một phím mình không xử lý là cách làm
   * hỏng mọi phím tắt của trình duyệt lẫn của ứng dụng, một cách âm thầm.
   */
  it.each(['a', 'F5', 'PageDown', 'Control', 'r', '/'])('không nhận phím %s', (key) => {
    expect(navIntentOf(key, false)).toBeNull();
  });
});

describe('resolveFocus — mũi tên quấn vòng', () => {
  it('đi tiếp từ node cuối về node đầu', () => {
    expect(resolveFocus(2, 3, 'next')).toEqual({ index: 0, handled: true });
  });

  it('đi lùi từ node đầu về node cuối', () => {
    expect(resolveFocus(0, 3, 'previous')).toEqual({ index: 2, handled: true });
  });

  it('chưa có tiêu điểm: đi tiếp vào node đầu, đi lùi vào node cuối', () => {
    expect(resolveFocus(null, 4, 'next')).toEqual({ index: 0, handled: true });
    expect(resolveFocus(null, 4, 'previous')).toEqual({ index: 3, handled: true });
  });

  it('Home và End nhảy thẳng tới hai đầu', () => {
    expect(resolveFocus(2, 5, 'first')).toEqual({ index: 0, handled: true });
    expect(resolveFocus(2, 5, 'last')).toEqual({ index: 4, handled: true });
  });
});

describe('resolveFocus — Tab KHÔNG bẫy tiêu điểm', () => {
  it('Tab ở node cuối nhả phím cho trình duyệt', () => {
    expect(resolveFocus(2, 3, 'next-or-exit')).toEqual({ index: 2, handled: false });
  });

  it('Shift+Tab ở node đầu nhả phím cho trình duyệt', () => {
    expect(resolveFocus(0, 3, 'previous-or-exit')).toEqual({ index: 0, handled: false });
  });

  it('Tab ở giữa thì vẫn đi tiếp trong cảnh', () => {
    expect(resolveFocus(1, 3, 'next-or-exit')).toEqual({ index: 2, handled: true });
    expect(resolveFocus(1, 3, 'previous-or-exit')).toEqual({ index: 0, handled: true });
  });

  /*
   * Đối chứng: mũi tên và Tab phải KHÁC NHAU ở đúng mép. Nếu ai đó gộp hai nhánh
   * lại thì hoặc mũi tên thôi quấn vòng, hoặc Tab thành cái bẫy — ô này đỏ ở cả
   * hai chiều.
   */
  it('cùng ở node cuối: mũi tên quấn vòng, Tab thì không', () => {
    expect(resolveFocus(2, 3, 'next').handled).toBe(true);
    expect(resolveFocus(2, 3, 'next').index).toBe(0);
    expect(resolveFocus(2, 3, 'next-or-exit').handled).toBe(false);
  });

  it('Tab vào một cảnh chưa có tiêu điểm thì bắt lấy node đầu', () => {
    expect(resolveFocus(null, 3, 'next-or-exit')).toEqual({ index: 0, handled: true });
  });
});

describe('resolveFocus — cảnh rỗng', () => {
  it('không nuốt phím nào khi không có node nào để trỏ tới', () => {
    for (const intent of ['next', 'previous', 'first', 'last', 'next-or-exit'] as const) {
      expect(resolveFocus(null, 0, intent)).toEqual({ index: null, handled: false });
    }
  });
});

describe('resolveFocus — select và clear không dời tiêu điểm', () => {
  it('`select` giữ nguyên chỗ đang đứng', () => {
    expect(resolveFocus(1, 3, 'select')).toEqual({ index: 1, handled: true });
  });

  it('`select` khi chưa trỏ vào đâu thì không nuốt phím', () => {
    expect(resolveFocus(null, 3, 'select')).toEqual({ index: null, handled: false });
  });

  it('`clear` nuốt phím kể cả khi chưa trỏ vào đâu — Escape luôn có nghĩa', () => {
    expect(resolveFocus(null, 3, 'clear').handled).toBe(true);
    expect(resolveFocus(1, 3, 'clear')).toEqual({ index: 1, handled: true });
  });
});

describe('clampFocus', () => {
  /*
   * Đồ thị đổi hình sau mỗi lượt chạy, nên một chỉ số hợp lệ ở lượt trước có thể
   * trỏ ra ngoài mảng ở lượt này. Không kẹp thì tiêu điểm biến mất mà không gì
   * báo — người dùng bàn phím mất chỗ đứng sau MỖI lần bấm chạy.
   */
  it('kéo chỉ số vượt trần về node cuối', () => {
    expect(clampFocus(9, 3)).toBe(2);
  });

  it('giữ nguyên chỉ số còn hợp lệ', () => {
    expect(clampFocus(1, 3)).toBe(1);
  });

  it('cảnh rỗng thì không có tiêu điểm nào', () => {
    expect(clampFocus(2, 0)).toBeNull();
  });

  it('chưa có tiêu điểm thì vẫn chưa có', () => {
    expect(clampFocus(null, 5)).toBeNull();
  });

  it('chỉ số âm về node đầu', () => {
    expect(clampFocus(-3, 4)).toBe(0);
  });
});
