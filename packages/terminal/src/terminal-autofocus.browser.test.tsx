import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TerminalSurface } from './terminal-surface.tsx';

/**
 * M9 — terminal KHÔNG được tự giật focus lúc mount, trừ khi người gọi xin.
 *
 * Bản cũ gọi `core.focus()` vô điều kiện sau khi font tải xong, nên MỖI lần
 * mount (đổi bố cục hẹp↔rộng, mở lại trang có phiên đang sống) kéo focus khỏi
 * chỗ người dùng đang đứng — kể cả giữa lúc họ đang gõ ở ô khác. `autoFocus`
 * là lựa chọn của trang, giống thuộc tính `autofocus` của HTML: chỉ có tác dụng
 * lúc mount.
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

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('M9 — autoFocus', () => {
  let page: HTMLDivElement;
  let root: Root;
  let outside: HTMLInputElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = SilentSocket;
    page = document.createElement('div');
    page.innerHTML =
      '<input id="ghi-chu" /><div id="khoang" style="width:640px;height:320px"></div>';
    document.body.appendChild(page);
    outside = page.querySelector<HTMLInputElement>('#ghi-chu')!;
    outside.focus();
    root = createRoot(page.querySelector('#khoang')!);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = realWebSocket;
    page.remove();
  });

  async function mount(autoFocus?: boolean): Promise<void> {
    act(() => {
      root.render(
        <TerminalSurface
          wsUrl="ws://localhost/ws/session/test"
          connectionKey={1}
          theme="dlp-dark"
          {...(autoFocus === undefined ? {} : { autoFocus })}
          onControl={() => {}}
          onClose={() => {}}
        />,
      );
    });
    // Lượt focus cũ chạy SAU `waitForFonts()` — chờ qua mốc đó rồi mới đo.
    await act(async () => {
      await document.fonts.ready;
      await settle(100);
    });
  }

  it('mặc định ⇒ focus ở NGUYÊN chỗ người dùng đang đứng', async () => {
    await mount();
    expect(document.activeElement).toBe(outside);
  });

  it('autoFocus={true} ⇒ focus vào textarea của xterm sau khi font tải xong (đối chứng dương)', async () => {
    await mount(true);
    expect(document.activeElement).toBe(page.querySelector('textarea.xterm-helper-textarea'));
  });
});
