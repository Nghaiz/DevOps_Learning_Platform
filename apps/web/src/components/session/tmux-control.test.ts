import { describe, expect, it } from 'vitest';
import {
  TMUX_WINDOW_BY_TAB,
  isTmuxControlledTab,
  tmuxNewWindowAt,
  tmuxSelectForTab,
  tmuxSelectWindow,
} from './tmux-control';

/**
 * C6 — chuỗi điều khiển tmux.
 *
 * Test này là lưới an toàn cho một thứ KHÔNG có lỗi khi sai: gõ nhầm chuỗi vào
 * PTY thì tmux im lặng bỏ qua (hoặc tệ hơn, gõ rác vào dòng lệnh của người
 * học). Không có ngoại lệ, không có log, không có gì trong network tab.
 */

describe('tmuxSelectWindow — prefix Ctrl-B + đúng một phím', () => {
  it('gửi \\x02 rồi chữ số', () => {
    expect(tmuxSelectWindow(1)).toBe('\x02' + '1');
    expect(tmuxSelectWindow(2)).toBe('\x02' + '2');
  });

  it('prefix đúng là 0x02 (Ctrl-B), không phải 0x01 (Ctrl-A)', () => {
    // Kiểm bằng mã ký tự chứ không bằng chuỗi escape: `'\x02'` và `''`
    // trông khác nhau trong mã nguồn nhưng là cùng một byte, còn `'\x01'`
    // (Ctrl-A — prefix của screen, và của rất nhiều bản .tmux.conf remap) thì
    // trông gần y hệt ở mọi diff.
    expect(tmuxSelectWindow(1).charCodeAt(0)).toBe(0x02);
    expect(tmuxSelectWindow(1)).toHaveLength(2);
  });

  it('ném khi chỉ số hai chữ số — tmux chỉ đọc MỘT phím sau prefix', () => {
    // Không ném thì `\x02` + "10" = "chọn window 1" rồi ký tự `0` rơi thẳng vào
    // shell của người học.
    expect(() => tmuxSelectWindow(10)).toThrow(RangeError);
    expect(() => tmuxSelectWindow(-1)).toThrow(RangeError);
    expect(() => tmuxSelectWindow(1.5)).toThrow(RangeError);
    expect(() => tmuxSelectWindow(Number.NaN)).toThrow(RangeError);
  });
});

describe('tmuxNewWindowAt — NÊU chỉ số, không dùng `prefix c`', () => {
  // Đây là ô gác chống một hồi quy IM LẶNG. `prefix c` cũng tạo được window và
  // nhìn thì "chạy", nhưng nó để tmux tự chọn chỉ số — nên khi người học đã tự
  // gõ `Ctrl-B c`, nút '+' tạo window 3 trong khi giao diện vẫn gõ `\x02 2`. Từ
  // đó mọi lệnh đi vào một window vô hình, không lỗi, không cảnh báo.
  it('đi qua dấu nhắc lệnh của tmux và kết bằng Enter', () => {
    expect(tmuxNewWindowAt(2)).toBe('\x02' + ':new-window -t 2' + '\r');
  });

  it('KHÔNG phát `prefix c` — chuỗi đó không mang chỉ số', () => {
    expect(tmuxNewWindowAt(2)).not.toBe('\x02' + 'c');
    expect(tmuxNewWindowAt(2)).toContain('-t 2');
  });

  it('thiếu Enter thì lệnh nằm im ở dấu nhắc — nên Enter phải có', () => {
    // Không có `\r` thì tmux mở dấu nhắc, nhận chữ, và chờ mãi. Người dùng
    // thấy một dòng lạ ở đáy terminal chứ không thấy window mới.
    expect(tmuxNewWindowAt(2).endsWith('\r')).toBe(true);
  });

  it('ném với chỉ số ngoài 0..9, cùng miền với tmuxSelectWindow', () => {
    expect(() => tmuxNewWindowAt(10)).toThrow(RangeError);
    expect(() => tmuxNewWindowAt(1.5)).toThrow(RangeError);
  });
});

describe('base-index 1 — window đầu tiên là 1, KHÔNG phải 0', () => {
  /**
   * `images/sandbox-base/skel/.tmux.conf:36` đặt `set -g base-index 1`. Nếu ai
   * đổi dòng đó mà không sửa `tmux-control.ts`, test này là thứ duy nhất trong
   * repo nói ra — chạy thật sẽ chỉ là "bấm tab không có phản ứng".
   */
  it('Terminal 1 → window 1, Terminal 2 → window 2', () => {
    expect(TMUX_WINDOW_BY_TAB['terminal-1']).toBe(1);
    expect(TMUX_WINDOW_BY_TAB['terminal-2']).toBe(2);
  });

  it('không tab nào ánh xạ về window 0', () => {
    expect(Object.values(TMUX_WINDOW_BY_TAB)).not.toContain(0);
  });
});

describe('tmuxSelectForTab', () => {
  it('trả chuỗi cho tab terminal', () => {
    expect(tmuxSelectForTab('terminal-1')).toBe('\x02' + '1');
    expect(tmuxSelectForTab('terminal-2')).toBe('\x02' + '2');
  });

  it('trả null cho tab Editor — chuyển sang Editor KHÔNG gửi gì vào PTY', () => {
    // Gửi một chuỗi tmux khi người dùng chỉ bấm sang khoang soạn mã sẽ đổi
    // window ngầm, và khi họ quay lại terminal thì nội dung đã khác chỗ.
    expect(tmuxSelectForTab('editor')).toBeNull();
  });

  it('trả null cho chuỗi lạ thay vì ném', () => {
    expect(tmuxSelectForTab('terminal-9')).toBeNull();
    expect(tmuxSelectForTab('')).toBeNull();
  });
});

describe('isTmuxControlledTab', () => {
  it('chỉ nhận tab terminal', () => {
    expect(isTmuxControlledTab('terminal-1')).toBe(true);
    expect(isTmuxControlledTab('terminal-2')).toBe(true);
    expect(isTmuxControlledTab('editor')).toBe(false);
  });

  it('không bị lừa bởi thuộc tính kế thừa từ Object.prototype', () => {
    // `'toString' in obj` là true cho MỌI object — một bản cài dùng `in` thay
    // vì `Object.hasOwn` sẽ coi 'toString' là một tab hợp lệ rồi tra ra
    // `undefined`, và `tmuxSelectWindow(undefined)` ném ở một chỗ không liên quan.
    expect(isTmuxControlledTab('toString')).toBe(false);
    expect(isTmuxControlledTab('constructor')).toBe(false);
  });
});
