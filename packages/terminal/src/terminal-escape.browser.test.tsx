import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalSurface } from './terminal-surface.tsx';

/**
 * Ô AC D10 — hai vế, và chúng KHÔNG thay thế được cho nhau:
 *
 *   (a) `Esc` ĐƠN vẫn tới được PTY. vim rời insert mode bằng phím này; nuốt nó
 *       là làm hỏng công cụ mà cả nền tảng tồn tại để dạy.
 *   (b) `Esc Esc` nhanh gọi `onEscapeFocus`.
 *
 * `escape-focus.test.ts` gác *thuật toán* (ngưỡng, chuỗi phím). File này gác
 * thứ mà thuật toán không thể biết: **listener có được đặt ở chỗ nhìn thấy phím
 * hay không**. Đo từ `@xterm/xterm@6.0.0`, `_keyDown` gọi `cancel(e, true)` =
 * `preventDefault() + stopPropagation()` — nên một listener ở pha BUBBLE sẽ
 * không bao giờ chạy, và một test chỉ gọi `detector.press(...)` trực tiếp vẫn
 * xanh trong khi tính năng chết hoàn toàn trên trình duyệt.
 *
 * Vì thế ở đây phím được BẮN THẬT vào `<textarea>` của xterm, và bằng chứng của
 * vế (a) là **byte đi vào WebSocket**, không phải một cờ nội bộ.
 */

/** Socket giả LUÔN Ở TRẠNG THÁI OPEN, ghi lại mọi frame đã gửi.
 *  `connection.sendInput` bỏ qua im lặng khi `readyState !== WebSocket.OPEN`
 *  (có chủ ý, xem connection.ts), nên một socket "đang nối" sẽ cho vế (a) xanh
 *  vì lý do sai: 0 byte gửi đi trông giống hệt 0 byte bị nuốt. */
class RecordingSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static sent: Uint8Array[] = [];
  static reset(): void {
    RecordingSocket.sent = [];
  }
  /** Chuỗi mọi byte đã gửi, để đếm số lần `\x1b` (0x1b) đi qua. */
  static get sentText(): string {
    return RecordingSocket.sent.map((chunk) => new TextDecoder().decode(chunk)).join('');
  }

  readyState: number = RecordingSocket.OPEN;
  binaryType = 'blob';

  constructor(readonly url: string) {}

  addEventListener(): void {}
  removeEventListener(): void {}
  send(data: unknown): void {
    if (data instanceof Uint8Array) {
      RecordingSocket.sent.push(data);
    }
  }
  close(): void {
    this.readyState = RecordingSocket.CLOSED;
  }
}

const realWebSocket = globalThis.WebSocket;

function Harness({ onEscapeFocus }: { onEscapeFocus: () => void }): React.ReactElement {
  const ref = useRef(null);
  void ref;
  return (
    <TerminalSurface
      wsUrl="ws://localhost/ws/session/test"
      connectionKey={1}
      theme="dlp-dark"
      ariaLabel="Terminal sandbox"
      onEscapeFocus={onEscapeFocus}
      onControl={() => {}}
      onClose={() => {}}
    />
  );
}

function pressEscape(target: HTMLElement): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe('D10 — Esc-Esc rời terminal, Esc đơn vẫn tới PTY', () => {
  let mountPoint: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = RecordingSocket;
    RecordingSocket.reset();

    mountPoint = document.createElement('div');
    mountPoint.style.width = '640px';
    mountPoint.style.height = '320px';
    document.body.appendChild(mountPoint);
    root = createRoot(mountPoint);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = realWebSocket;
    mountPoint.remove();
  });

  function mount(onEscapeFocus: () => void): { container: HTMLElement; textarea: HTMLElement } {
    act(() => {
      root.render(<Harness onEscapeFocus={onEscapeFocus} />);
    });
    const container = mountPoint.querySelector<HTMLElement>('[data-testid="dlp-terminal"]');
    expect(container).not.toBeNull();
    const textarea = container!.querySelector<HTMLElement>('textarea.xterm-helper-textarea');
    // Tiền đề của cảnh, khẳng định tường minh: nếu xterm đổi cấu trúc DOM và
    // textarea này biến mất, mọi assertion dưới sẽ "xanh" vì không có gì xảy ra.
    expect(textarea).not.toBeNull();
    return { container: container!, textarea: textarea! };
  }

  it('container có role/tabIndex/aria-label của D10', () => {
    const { container } = mount(() => {});
    expect(container.getAttribute('role')).toBe('application');
    expect(container.getAttribute('tabindex')).toBe('0');
    expect(container.getAttribute('aria-label')).toBe('Terminal sandbox');
  });

  it('Esc ĐƠN: không rời focus, và byte 0x1b VẪN đi vào WebSocket', () => {
    const onEscapeFocus = vi.fn();
    const { textarea } = mount(onEscapeFocus);
    RecordingSocket.reset();

    pressEscape(textarea);

    expect(onEscapeFocus).not.toHaveBeenCalled();
    // Vế (a). Đây là bằng chứng duy nhất không thể giả: nếu detector nuốt phím,
    // xterm không chạy `_keyDown`, `onData` không bắn, và chuỗi này rỗng.
    expect(RecordingSocket.sentText).toBe('\x1b');
  });

  it('Esc Esc nhanh: gọi onEscapeFocus ĐÚNG một lần — và CẢ HAI byte vẫn qua', () => {
    const onEscapeFocus = vi.fn();
    const { textarea } = mount(onEscapeFocus);
    RecordingSocket.reset();

    pressEscape(textarea);
    pressEscape(textarea);

    expect(onEscapeFocus).toHaveBeenCalledTimes(1);
    expect(RecordingSocket.sentText).toBe('\x1b\x1b');
  });

  it('phím thường KHÔNG gọi onEscapeFocus', () => {
    const onEscapeFocus = vi.fn();
    const { textarea } = mount(onEscapeFocus);

    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true, cancelable: true }),
    );

    expect(onEscapeFocus).not.toHaveBeenCalled();
  });
});
