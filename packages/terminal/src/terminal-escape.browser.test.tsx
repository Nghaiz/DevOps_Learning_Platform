import { act } from 'react';
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

  /**
   * Phát `open` NGAY khi `openConnection` đăng ký listener — đồng bộ, vì các test
   * dưới bấm phím ngay sau `act()` mà không nhường lượt cho microtask. Từ H5,
   * `connection.ts` mở cổng stdin theo sự kiện `open` chứ không theo
   * `readyState`: một fake chỉ đặt `readyState = OPEN` mà không phát `open` sẽ
   * khiến mọi byte nằm im trong hàng đợi, và vế (a) đỏ vì fake chứ không vì mã.
   */
  addEventListener(type: string, handler: (event: unknown) => void): void {
    if (type === 'open') {
      handler({});
    }
  }
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

function Harness({
  onEscapeFocus,
}: {
  onEscapeFocus?: (direction: 'forward' | 'backward') => void;
}): React.ReactElement {
  return (
    <TerminalSurface
      wsUrl="ws://localhost/ws/session/test"
      connectionKey={1}
      theme="dlp-dark"
      ariaLabel="Terminal sandbox"
      {...(onEscapeFocus === undefined ? {} : { onEscapeFocus })}
      onControl={() => {}}
      onClose={() => {}}
    />
  );
}

/** Sự kiện tổng hợp + `keyCode` gán đè: xterm đọc `keyCode` để ra `	`/``. */
function pressKey(
  target: HTMLElement,
  init: KeyboardEventInit & { key: string; keyCode: number },
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'keyCode', { value: init.keyCode });
  target.dispatchEvent(event);
  return event;
}

function pressEscape(target: HTMLElement): void {
  pressKey(target, { key: 'Escape', code: 'Escape', keyCode: 27 });
}

function pressTab(target: HTMLElement, shiftKey = false): KeyboardEvent {
  return pressKey(target, { key: 'Tab', code: 'Tab', keyCode: 9, shiftKey });
}

describe('D10/M1 — Esc rồi Tab rời terminal, Esc đơn và Esc Esc vẫn tới PTY', () => {
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

  function mount(onEscapeFocus?: (direction: 'forward' | 'backward') => void): {
    container: HTMLElement;
    textarea: HTMLElement;
  } {
    act(() => {
      root.render(<Harness {...(onEscapeFocus === undefined ? {} : { onEscapeFocus })} />);
    });
    const container = mountPoint.querySelector<HTMLElement>('[data-testid="dlp-terminal"]');
    expect(container).not.toBeNull();
    const textarea = container!.querySelector<HTMLElement>('textarea.xterm-helper-textarea');
    // Tiền đề của cảnh, khẳng định tường minh: nếu xterm đổi cấu trúc DOM và
    // textarea này biến mất, mọi assertion dưới sẽ "xanh" vì không có gì xảy ra.
    expect(textarea).not.toBeNull();
    return { container: container!, textarea: textarea! };
  }

  it('container có role/aria-label của D10, và KHÔNG là điểm dừng Tab (M8)', () => {
    const { container } = mount(() => {});
    expect(container.getAttribute('role')).toBe('application');
    expect(container.hasAttribute('tabindex')).toBe(false);
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
    expect(RecordingSocket.sentText).toBe('');
  });

  it('M1 — Esc Esc nhanh KHÔNG rời focus (thói quen vim), và cả hai byte vẫn qua', () => {
    const onEscapeFocus = vi.fn();
    const { textarea } = mount(onEscapeFocus);
    RecordingSocket.reset();

    pressEscape(textarea);
    pressEscape(textarea);

    expect(onEscapeFocus).not.toHaveBeenCalled();
    expect(RecordingSocket.sentText).toBe('');
  });

  it('M1 — Esc rồi Tab: gọi onEscapeFocus("forward") ĐÚNG một lần; Esc tới PTY, Tab thì KHÔNG', () => {
    const onEscapeFocus = vi.fn();
    const { textarea } = mount(onEscapeFocus);
    RecordingSocket.reset();

    pressEscape(textarea);
    const tab = pressTab(textarea);

    expect(onEscapeFocus).toHaveBeenCalledExactlyOnceWith('forward');
    expect(RecordingSocket.sentText).toBe('');
    // Có người nhận cử chỉ ⇒ chặn Tab gốc, nếu không focus bị dời HAI lần.
    expect(tab.defaultPrevented).toBe(true);
  });

  it('M1 — Esc rồi Shift+Tab ⇒ onEscapeFocus("backward")', () => {
    const onEscapeFocus = vi.fn();
    const { textarea } = mount(onEscapeFocus);

    pressEscape(textarea);
    pressTab(textarea, true);

    expect(onEscapeFocus).toHaveBeenCalledExactlyOnceWith('backward');
  });

  it('M1 — KHÔNG có onEscapeFocus ⇒ Tab gốc của trình duyệt được giữ (không preventDefault), và \t không tới PTY', () => {
    const { textarea } = mount();
    RecordingSocket.reset();

    pressEscape(textarea);
    const tab = pressTab(textarea);

    expect(tab.defaultPrevented).toBe(false);
    expect(RecordingSocket.sentText).toBe('');
  });

  it('ĐỐI CHỨNG: Tab KHÔNG có Esc trước ⇒ là \t của shell, không rời focus', () => {
    const onEscapeFocus = vi.fn();
    const { textarea } = mount(onEscapeFocus);
    RecordingSocket.reset();

    pressTab(textarea);

    expect(onEscapeFocus).not.toHaveBeenCalled();
    expect(RecordingSocket.sentText).toBe('	');
  });
});
