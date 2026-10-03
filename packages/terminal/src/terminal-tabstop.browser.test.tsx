import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { TerminalSurface } from './terminal-surface.tsx';

/**
 * M8 — terminal là ĐÚNG MỘT điểm dừng Tab, và điểm dừng đó gõ được.
 *
 * Bản cũ: container `tabIndex=0` + textarea của xterm (xterm tự đặt
 * `tabIndex=0`) ⇒ HAI điểm dừng, điểm đầu chết — focus nằm ở một `<div>`, gõ
 * phím không đi đâu cả, phải Tab thêm lần nữa mới tới ô nhập thật.
 *
 * Tab bằng `userEvent.tab()` (CDP — điều hướng focus THẬT của Chromium): một
 * phép đếm `[tabindex]` trong DOM không nói được trình duyệt sẽ dừng ở đâu.
 */

class SilentSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState: number = SilentSocket.CONNECTING;
  binaryType = 'blob';
  constructor(readonly url: string) {}
  addEventListener(): void {}
  removeEventListener(): void {}
  send(): void {}
  close(): void {
    this.readyState = SilentSocket.CLOSED;
  }
}

const realWebSocket = globalThis.WebSocket;

describe('M8 — một điểm dừng Tab, rơi thẳng vào xterm', () => {
  let page: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = SilentSocket;
    page = document.createElement('div');
    page.innerHTML =
      '<button id="truoc">Trước</button><div id="khoang" style="width:640px;height:320px"></div><button id="sau">Sau</button>';
    document.body.appendChild(page);
    root = createRoot(page.querySelector('#khoang')!);
    act(() => {
      root.render(
        <TerminalSurface
          wsUrl="ws://localhost/ws/session/test"
          connectionKey={1}
          theme="dlp-dark"
          ariaLabel="Terminal sandbox"
          onControl={() => {}}
          onClose={() => {}}
        />,
      );
    });
    await document.fonts.ready;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = realWebSocket;
    page.remove();
  });

  function textarea(): HTMLElement {
    const element = page.querySelector<HTMLElement>('textarea.xterm-helper-textarea');
    expect(element).not.toBeNull();
    return element!;
  }

  it('Tab từ nút đứng trước ⇒ vào THẲNG textarea; Esc rồi Tab (M1, phím thật) ⇒ ra nút đứng sau', async () => {
    page.querySelector<HTMLButtonElement>('#truoc')!.focus();

    await userEvent.tab();
    expect(document.activeElement).toBe(textarea());

    // Trong terminal, Tab trần là hoàn tất lệnh của shell — nó PHẢI ở lại.
    await userEvent.tab();
    expect(document.activeElement).toBe(textarea());

    await userEvent.keyboard('{Escape}');
    await userEvent.tab();
    expect(document.activeElement?.id).toBe('sau');
  });

  it('Shift+Tab đi ngược cũng chỉ dừng MỘT lần trong terminal', async () => {
    page.querySelector<HTMLButtonElement>('#sau')!.focus();

    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(textarea());

    await userEvent.keyboard('{Escape}');
    await userEvent.tab({ shift: true });
    expect(document.activeElement?.id).toBe('truoc');
  });

  it('container vẫn mang role/aria-label (trình đọc màn hình đọc nó khi focus vào textarea con)', () => {
    const container = page.querySelector<HTMLElement>('[data-testid="dlp-terminal"]')!;
    expect(container.getAttribute('role')).toBe('application');
    expect(container.getAttribute('aria-label')).toBe('Terminal sandbox');
    expect(container.hasAttribute('tabindex')).toBe(false);
  });
});
