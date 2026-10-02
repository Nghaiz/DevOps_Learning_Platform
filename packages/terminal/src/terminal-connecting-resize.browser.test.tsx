import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TerminalSurface } from './terminal-surface.tsx';

/**
 * H1 — kích thước đổi trong lúc socket còn CONNECTING phải tới được pod.
 *
 * `connection.test.ts` gác cầu WS (resize trước `open` được gộp vào `init`).
 * File này gác DÂY NỐI mà test kia không thấy: `terminal-core` → `onResize` →
 * `Connection.sendResize` qua `TerminalSurface`, với `ResizeObserver` + FitAddon
 * thật. Đường thật của lỗi là lượt refit sau khi font tải xong; đổi kích thước
 * khung đi ĐÚNG đường đó (`notifyResize` → `onResize`), chỉ khác nguồn kích hoạt.
 */

class ControlledSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: ControlledSocket[] = [];

  readyState: number = ControlledSocket.CONNECTING;
  binaryType = 'blob';
  readonly sent: unknown[] = [];
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  constructor(readonly url: string) {
    ControlledSocket.instances.push(this);
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
  }
  removeEventListener(): void {}
  send(data: unknown): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = ControlledSocket.CLOSED;
  }
  open(): void {
    this.readyState = ControlledSocket.OPEN;
    for (const handler of this.listeners.get('open') ?? []) {
      handler({});
    }
  }
}

const realWebSocket = globalThis.WebSocket;

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('H1 — resize lúc CONNECTING đi vào `init`', () => {
  let mountPoint: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = ControlledSocket;
    ControlledSocket.instances = [];
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

  it('khung hẹp lại khi đang nối ⇒ `init` mang số cột của khung HẸP, không phải ảnh chụp lúc mở', async () => {
    act(() => {
      root.render(
        <TerminalSurface
          wsUrl="ws://localhost/ws/session/test"
          connectionKey={1}
          theme="dlp-dark"
          onControl={() => {}}
          onClose={() => {}}
        />,
      );
    });
    // Cho font + lượt `ResizeObserver` đầu tiên chạy xong ở 640px.
    await act(async () => {
      await document.fonts.ready;
      await settle(200);
    });
    const socket = ControlledSocket.instances.at(-1);
    expect(socket).toBeDefined();
    expect(socket!.readyState).toBe(ControlledSocket.CONNECTING);

    mountPoint.style.width = '400px';
    await act(async () => {
      await settle(200);
    });
    act(() => {
      socket!.open();
    });

    const controls = socket!.sent
      .filter((frame): frame is string => typeof frame === 'string')
      .map((frame) => JSON.parse(frame) as { type: string; cols: number; rows: number });
    expect(controls[0]?.type).toBe('init');
    // 640px ≈ 76–83 cột, 400px ≈ 47–52 cột với fontSize 14 (fallback lẫn font
    // thật). Khoảng [30, 60] tách được hai ca mà không gắn vào một metric font.
    expect(controls[0]?.cols).toBeGreaterThanOrEqual(30);
    expect(controls[0]?.cols).toBeLessThanOrEqual(60);
    // Không có `resize` nào đi TRƯỚC `init`, và không có `resize` thừa mang lại
    // đúng số `init` vừa gửi.
    expect(controls.filter((frame) => frame.type === 'resize')).toHaveLength(0);
  });
});
