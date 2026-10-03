import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { TerminalSurface, type TerminalHandle } from './terminal-surface.tsx';

/**
 * H2 — `TerminalHandle.setInputEnabled(false)` chặn người dùng GÕ vào PTY.
 *
 * FE cần nó để khoá bàn phím mỗi khi pha ≠ `ready`: gõ lúc đang nối lại thì byte
 * đi vào hàng đợi H5 rồi bắn ra hàng loạt khi socket mở — người học thấy lệnh tự
 * chạy mà không nhớ đã gõ. Gõ được tiếp sau `exited`/`error` thì là gõ vào hư vô.
 *
 * Phím gõ bằng `userEvent.keyboard` (CDP — sự kiện THẬT): một `KeyboardEvent`
 * tổng hợp thiếu `keyCode` bị xterm bỏ qua ở `evaluateKeyboardEvent`, nên ô
 * "không có byte nào" sẽ xanh vì phím không bao giờ được xử lý, không vì cổng.
 * Đối chứng dương (bật lại ⇒ byte tới) là thứ chứng minh phím đã tới xterm.
 */

class OpenSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static sent: Uint8Array[] = [];
  static get sentText(): string {
    return OpenSocket.sent.map((chunk) => new TextDecoder().decode(chunk)).join('');
  }

  readyState: number = OpenSocket.OPEN;
  binaryType = 'blob';

  constructor(readonly url: string) {}

  addEventListener(type: string, handler: (event: unknown) => void): void {
    if (type === 'open') {
      handler({});
    }
  }
  removeEventListener(): void {}
  send(data: unknown): void {
    if (data instanceof Uint8Array) {
      OpenSocket.sent.push(data);
    }
  }
  close(): void {
    this.readyState = OpenSocket.CLOSED;
  }
}

const realWebSocket = globalThis.WebSocket;

describe('H2 — setInputEnabled', () => {
  let mountPoint: HTMLDivElement;
  let root: Root;
  let handle: TerminalHandle | null;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = OpenSocket;
    OpenSocket.sent = [];
    handle = null;
    mountPoint = document.createElement('div');
    mountPoint.style.width = '640px';
    mountPoint.style.height = '320px';
    document.body.appendChild(mountPoint);
    root = createRoot(mountPoint);
    act(() => {
      root.render(
        <TerminalSurface
          wsUrl="ws://localhost/ws/session/test"
          connectionKey={1}
          theme="dlp-dark"
          onControl={() => {}}
          onClose={() => {}}
          onReady={(next) => {
            handle = next;
          }}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = realWebSocket;
    mountPoint.remove();
  });

  function textarea(): HTMLTextAreaElement {
    const element = mountPoint.querySelector<HTMLTextAreaElement>('textarea.xterm-helper-textarea');
    expect(element).not.toBeNull();
    return element!;
  }

  it('tắt ⇒ gõ phím KHÔNG gửi byte nào; bật lại ⇒ gõ tới PTY (đối chứng dương)', async () => {
    expect(handle).not.toBeNull();
    textarea().focus();

    handle!.setInputEnabled(false);
    await userEvent.keyboard('ls');
    expect(OpenSocket.sentText).toBe('');

    handle!.setInputEnabled(true);
    await userEvent.keyboard('pwd');
    expect(OpenSocket.sentText).toBe('pwd');
  });

  it('tắt ⇒ dán (sự kiện paste) cũng không tới PTY', () => {
    handle!.setInputEnabled(false);
    const data = new DataTransfer();
    data.setData('text/plain', 'rm -rf /tmp/x\r');
    textarea().dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
    expect(OpenSocket.sentText).toBe('');
  });

  it('tắt KHÔNG chặn `sendInput` của handle — đó là đường `{{exec}}`, FE tự quyết khi nào gọi', () => {
    handle!.setInputEnabled(false);
    handle!.sendInput('echo exec\r');
    expect(OpenSocket.sentText).toBe('echo exec\r');
  });
});
