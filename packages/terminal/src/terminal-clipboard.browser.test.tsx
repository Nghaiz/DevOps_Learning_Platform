import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTerminalCore, type TerminalCore } from './terminal-core.ts';

/**
 * H6 — phím copy/dán trên Windows/Linux.
 *
 * xterm 6 tự xử lý Cmd+C/Cmd+V trên macOS (sự kiện `copy`/`paste` gốc), nhưng
 * trên Windows/Linux nó biến MỌI tổ hợp Ctrl+chữ thành byte điều khiển và huỷ
 * sự kiện: Ctrl+C luôn là ^C, Ctrl+Shift+C là ^C (rồi Chrome mở DevTools),
 * Ctrl+Shift+V là ^V. Người học không có đường bàn phím nào để copy output.
 *
 * Hợp đồng:
 *   - Ctrl+C CÓ vùng chọn ⇒ copy, KHÔNG gửi ^C, xoá vùng chọn (Ctrl+C kế tiếp lại
 *     là ^C — đúng như Windows Terminal).
 *   - Ctrl+C KHÔNG có vùng chọn ⇒ vẫn là ^C. Đây là phím ngắt tiến trình, mất nó
 *     là mất cách dừng `ping`.
 *   - Ctrl+Shift+C ⇒ copy, và `preventDefault` để Chrome không mở DevTools.
 *   - Ctrl+Shift+V ⇒ KHÔNG gửi ^V, và KHÔNG `preventDefault`: trình duyệt tự
 *     chạy lệnh dán gốc, sự kiện `paste` đi vào xterm (bracketed paste,
 *     `disableStdin`, rồi C2 chia frame) — không cần quyền đọc clipboard.
 *
 * Sự kiện tổng hợp có `keyCode` thật (xterm đọc `keyCode` cho tổ hợp Ctrl), nên
 * nhánh ^C/^V của chính xterm chạy được — hai ô đối chứng dưới chứng minh điều đó.
 */

describe('H6 — Ctrl+C / Ctrl+Shift+C / Ctrl+Shift+V', () => {
  let container: HTMLDivElement;
  let core: TerminalCore;
  let data: string[];
  let writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;

  beforeEach(async () => {
    container = document.createElement('div');
    container.style.width = '640px';
    container.style.height = '320px';
    document.body.appendChild(container);
    data = [];
    writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);
    core = createTerminalCore({
      container,
      theme: 'dlp-dark',
      onData: (chunk) => data.push(chunk),
      onResize: () => {},
    });
    await new Promise<void>((resolve) => {
      core.terminal.write('hello world', resolve);
    });
  });

  afterEach(() => {
    core.dispose();
    container.remove();
    vi.restoreAllMocks();
  });

  function press(init: KeyboardEventInit & { keyCode: number }): KeyboardEvent {
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea.xterm-helper-textarea');
    expect(textarea).not.toBeNull();
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    // `keyCode` là thuộc tính chỉ-đọc trong dictionary chuẩn; Chromium bỏ qua nó
    // trong `KeyboardEventInit`, nên gán đè để xterm đọc đúng như sự kiện thật.
    Object.defineProperty(event, 'keyCode', { value: init.keyCode });
    textarea!.dispatchEvent(event);
    return event;
  }

  it('Ctrl+C CÓ vùng chọn ⇒ copy đúng chữ đã chọn, không gửi ^C, xoá vùng chọn', () => {
    core.terminal.select(0, 0, 5);
    const event = press({ key: 'c', code: 'KeyC', ctrlKey: true, keyCode: 67 });

    expect(writeText).toHaveBeenCalledExactlyOnceWith('hello');
    expect(data).toEqual([]);
    expect(event.defaultPrevented).toBe(true);
    expect(core.terminal.hasSelection()).toBe(false);
  });

  it('ĐỐI CHỨNG: Ctrl+C KHÔNG có vùng chọn ⇒ vẫn là ^C', () => {
    press({ key: 'c', code: 'KeyC', ctrlKey: true, keyCode: 67 });
    expect(data).toEqual(['\x03']);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('Ctrl+Shift+C ⇒ copy, không gửi byte nào, chặn mặc định (DevTools)', () => {
    core.terminal.select(6, 0, 5);
    const event = press({ key: 'C', code: 'KeyC', ctrlKey: true, shiftKey: true, keyCode: 67 });

    expect(writeText).toHaveBeenCalledExactlyOnceWith('world');
    expect(data).toEqual([]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Ctrl+Shift+V ⇒ không gửi ^V, và để trình duyệt chạy lệnh dán gốc', () => {
    const event = press({ key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true, keyCode: 86 });
    expect(data).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('ĐỐI CHỨNG: Ctrl+V (không Shift) giữ hành vi cũ của xterm — ^V', () => {
    press({ key: 'v', code: 'KeyV', ctrlKey: true, keyCode: 86 });
    expect(data).toEqual(['\x16']);
  });
});
