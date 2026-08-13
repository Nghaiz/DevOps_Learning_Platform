import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TerminalSurface } from './terminal-surface.tsx';

/**
 * Ô AC: *"StrictMode dev: mount/unmount 3 lần → chỉ còn **1** WebSocket sống."*
 *
 * ⛔ **`connection.test.ts` KHÔNG phủ ô này dù có một ca tên gần giống.** Ca
 * `'mở rồi đóng 3 lần liên tiếp ⇒ 0 socket còn sống (AC StrictMode)'` chạy trên
 * `openConnection` với socket giả và **không dựng React** — nó gác `connection.ts`.
 * Ô AC hỏi về `terminal-surface.tsx`: deps của `useEffect`, thứ tự cleanup, và
 * việc `coreRef` còn sống khi effect kết nối chạy. Một lỗi deps mở hai socket sẽ
 * không chạm ca kia.
 */

/** Đếm ở `globalThis.WebSocket` chứ không tiêm `socketFactory`: `TerminalSurface`
 *  gọi `openConnection` KHÔNG truyền factory, nên đường production đọc đúng biến
 *  toàn cục. Tiêm factory là đo một đường mà component không đi. */
class CountingSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static constructed = 0;
  static closed = 0;
  static reset(): void {
    CountingSocket.constructed = 0;
    CountingSocket.closed = 0;
  }
  static get alive(): number {
    return CountingSocket.constructed - CountingSocket.closed;
  }

  readyState: number = CountingSocket.CONNECTING;
  binaryType = 'blob';

  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
  ) {
    CountingSocket.constructed += 1;
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  send(): void {}

  close(): void {
    if (this.readyState === CountingSocket.CLOSED) {
      return;
    }
    this.readyState = CountingSocket.CLOSED;
    CountingSocket.closed += 1;
  }
}

const realWebSocket = globalThis.WebSocket;

function renderOnce(root: Root, container: HTMLElement): void {
  root.render(
    <StrictMode>
      <TerminalSurface
        wsUrl="ws://localhost/ws/session/test"
        connectionKey={1}
        theme="dlp-dark"
        onControl={() => {}}
        onClose={() => {}}
      />
    </StrictMode>,
  );
  void container;
}

describe('vòng đời WebSocket dưới StrictMode', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = CountingSocket;
    CountingSocket.reset();

    host = document.createElement('div');
    host.style.width = '640px';
    host.style.height = '320px';
    document.body.appendChild(host);
  });

  afterEach(() => {
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = realWebSocket;
    host.remove();
  });

  it('mount/unmount 3 lần ⇒ dựng 6 · đóng 5 · còn sống ĐÚNG 1', async () => {
    let root: Root | null = null;

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      const mountPoint = document.createElement('div');
      mountPoint.style.width = '640px';
      mountPoint.style.height = '320px';
      host.appendChild(mountPoint);

      root = createRoot(mountPoint);
      await act(async () => {
        renderOnce(root!, mountPoint);
      });

      // Sau MỖI lần mount, StrictMode đã chạy effect mount→cleanup→mount ⇒
      // đúng 1 socket sống. Kiểm ở đây chứ không chỉ ở cuối: một hiện thực rò
      // 1 socket mỗi lần mount vẫn cho "còn 1" ở cuối nếu ta chỉ đo cuối.
      expect(CountingSocket.alive).toBe(1);

      if (cycle < 3) {
        await act(async () => {
          root!.unmount();
        });
        expect(CountingSocket.alive).toBe(0);
      }
    }

    // ⛔ Ba con số, không phải một. Chỉ assert `alive === 1` thì một cảnh KHÔNG
    // double-invoke (StrictMode không bật, hoặc React chạy bản production) cũng
    // cho `alive === 1` — và khi đó test khẳng định đúng cái nó không kiểm.
    // `constructed === 6` là vế DUY NHẤT chứng minh cảnh StrictMode đã dựng thật.
    expect(CountingSocket.constructed).toBe(6);
    expect(CountingSocket.closed).toBe(5);
    expect(CountingSocket.alive).toBe(1);

    await act(async () => {
      root!.unmount();
    });
    expect(CountingSocket.alive).toBe(0);
  });

  it('unmount cuối cùng đóng nốt socket còn lại — không rò qua biên test', async () => {
    const mountPoint = document.createElement('div');
    mountPoint.style.width = '640px';
    mountPoint.style.height = '320px';
    host.appendChild(mountPoint);

    const root = createRoot(mountPoint);
    await act(async () => {
      renderOnce(root, mountPoint);
    });
    expect(CountingSocket.alive).toBe(1);

    await act(async () => {
      root.unmount();
    });
    expect(CountingSocket.alive).toBe(0);
    expect(CountingSocket.closed).toBe(CountingSocket.constructed);
  });
});
