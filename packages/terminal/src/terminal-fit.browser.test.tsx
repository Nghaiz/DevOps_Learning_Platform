import { FitAddon } from '@xterm/addon-fit';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RESIZE_DEBOUNCE_MS,
  createTerminalCore,
  type TerminalCore,
  type TerminalDimensions,
} from './terminal-core.ts';
import { TerminalSurface, type TerminalHandle } from './terminal-surface.tsx';

/**
 * Contract §C3 — `fit()`.
 *
 * Ô cần gác: terminal sắp nằm trong TAB, và tab không hoạt giữ MOUNTED rồi ẩn
 * bằng `display:none` (contract §C5 — unmount là đóng WebSocket, mất phiên).
 * xterm đo được 0×0 trên một phần tử như thế, nên khi tab hiện lại phải có ai đó
 * gọi `fit()`; không thì terminal vẽ bằng số cột đo từ lúc còn ẩn.
 *
 * ⛔ Vế NGUY HIỂM không phải "quên fit" mà là "fit quá sớm". Xem ca đối chứng
 * đầu tiên: ở container 0×0, `FitAddon.proposeDimensions()` KHÔNG trả 0 — nó trả
 * về sàn `MINIMUM_COLS`/`MINIMUM_ROWS` của chính nó. Một guard `cols < 1` vì thế
 * không bao giờ bắt được ca này, terminal bị ép về sàn đó, và frame `resize`
 * mang số sàn đi thẳng lên `ioctl(TIOCSWINSZ)` của pod.
 */

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Đủ để lượt bắn bắt buộc của `ResizeObserver` lúc `observe()` lắng hẳn. */
const SETTLE_MS = RESIZE_DEBOUNCE_MS * 6;

function makeBox(css: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, css);
  document.body.appendChild(el);
  return el;
}

describe('TerminalCore.fit()', () => {
  let box: HTMLDivElement;
  let core: TerminalCore | null = null;

  beforeEach(() => {
    box = makeBox({ width: '640px', height: '320px' });
  });

  afterEach(() => {
    core?.dispose();
    core = null;
    box.remove();
  });

  function create(onResize: (size: TerminalDimensions) => void): TerminalCore {
    return createTerminalCore({ container: box, theme: 'dlp-dark', onData: () => {}, onResize });
  }

  it('đối chứng: ở container 0×0, FitAddon trả SÀN 2×1 chứ không trả 0', () => {
    // Ca này là lý do tồn tại của phép kiểm `clientWidth/clientHeight` trong
    // `tryMeasure`. Nó đo HÀNH VI CỦA VENDOR, nên nếu một bản FitAddon sau này
    // đổi sàn (hoặc trả `undefined` ở đây) thì ca này đỏ và ta biết ngay guard
    // nào cần đọc lại — thay vì để nó âm thầm thành trang trí.
    box.style.width = '0px';
    box.style.height = '0px';
    core = create(() => {});

    const probe = new FitAddon();
    core.terminal.loadAddon(probe);
    const proposed = probe.proposeDimensions();

    expect(proposed).toEqual({ cols: 2, rows: 1 });
  });

  it('container 0×0: fit() KHÔNG ném, KHÔNG phát resize, KHÔNG ép terminal về sàn', async () => {
    box.style.width = '0px';
    box.style.height = '0px';
    const onResize = vi.fn<(size: TerminalDimensions) => void>();
    core = create(onResize);
    await sleep(SETTLE_MS);

    expect(() => core!.fit()).not.toThrow();

    expect(onResize).not.toHaveBeenCalled();
    // Vế sắc nhất của ca này: không có nó thì một hiện thực "fit() ép terminal
    // về 2×1 rồi nuốt frame resize" vẫn qua được assertion ở trên — hỏng y hệt,
    // chỉ là hỏng im lặng hơn.
    expect(core.terminal.cols).toBeGreaterThan(2);
  });

  it('tab bị ẩn SAU khi đã hiện (display:none): fit() vẫn KHÔNG phát resize', async () => {
    // Khác ca trên ở chỗ terminal đã đo được bề rộng ô lúc còn hiện, nên
    // `proposeDimensions()` ở đây KHÔNG rơi vào nhánh `undefined` — đây đúng là
    // hình dạng thật của một tab bị chuyển đi.
    const onResize = vi.fn<(size: TerminalDimensions) => void>();
    core = create(onResize);
    await sleep(SETTLE_MS);
    const colsWhileVisible = core.terminal.cols;

    box.style.display = 'none';
    await sleep(SETTLE_MS);
    onResize.mockClear();

    expect(() => core!.fit()).not.toThrow();
    expect(onResize).not.toHaveBeenCalled();
    expect(core.terminal.cols).toBe(colsWhileVisible);
  });

  it('tab hiện lại: fit() phát resize NGAY, đúng MỘT lần, và RO không phát trùng', async () => {
    box.style.display = 'none';
    const onResize = vi.fn<(size: TerminalDimensions) => void>();
    core = create(onResize);
    await sleep(SETTLE_MS);
    expect(onResize).not.toHaveBeenCalled();

    box.style.display = 'block';
    // Ép trình duyệt tính lại layout trước khi đo — không có dòng này thì
    // `clientWidth` có thể còn là 0 và ca đo chính mình chứ không đo `fit()`.
    void box.offsetHeight;

    core.fit();

    // ĐỒNG BỘ, ngay sau lời gọi: `ResizeObserver` bất đồng bộ VÀ còn 50ms
    // debounce, nên lượt phát này chắc chắn của `fit()` chứ không của RO. Đây là
    // vế phân biệt "fit() tự phát" với "fit() chỉ đo rồi chờ RO phát hộ" — vế
    // sau trễ ít nhất 50ms và người dùng thấy prompt nhảy cột.
    expect(onResize).toHaveBeenCalledTimes(1);
    const firstCall = onResize.mock.calls[0];
    expect(firstCall).toBeDefined();
    const size = firstCall![0];
    expect(size.cols).toBeGreaterThan(2);
    expect(size.rows).toBeGreaterThan(1);
    expect(core.terminal.cols).toBe(size.cols);
    expect(core.terminal.rows).toBe(size.rows);

    // Lượt RO bắn kèm (đổi `display` cũng làm RO bắn) KHÔNG được phát trùng.
    // Đây là vế chứng minh `fit()` đi CHUNG đường phát với RO thay vì mở đường
    // thứ hai — một đường thứ hai sẽ vượt mặt phép dedup theo giá trị và đốt
    // thêm một frame control mỗi lần đổi tab.
    await sleep(SETTLE_MS);
    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it('sau dispose: fit() no-op im lặng', async () => {
    const onResize = vi.fn<(size: TerminalDimensions) => void>();
    const disposed = create(onResize);
    await sleep(SETTLE_MS);

    disposed.dispose();
    onResize.mockClear();

    expect(() => disposed.fit()).not.toThrow();
    expect(onResize).not.toHaveBeenCalled();
  });

  it('ghim hành vi vendor: measure() sau dispose KHÔNG ném, trả về số đo cuối', async () => {
    // ⚠ Ca này ban đầu được viết ngược lại — khẳng định `measure()` NÉM sau
    // dispose, để biện minh rằng cờ `disposed` trong `fit()` chặn một cú ném có
    // thật. Lượt chạy đầu tiên bác bỏ điều đó (gpu-on lẫn gpu-off): xterm 6.0.0
    // gỡ `terminal.element` khỏi DOM khi dispose, nên `proposeDimensions()` rơi
    // vào nhánh `!element.parentElement` và trả `undefined` — im lặng, không ném.
    //
    // Nên nói cho đúng: cờ `disposed` KHÔNG chặn một cú ném đã đo được; nó là
    // một chốt tường minh và rẻ, đặt trước cả đường đo. Giá trị thật của ca này
    // là ghim hành vi vendor mà `measure()` (không có cờ) đang dựa vào: ngày
    // xterm đổi ý và ném, ca này đỏ và ta biết phải thêm cờ cho `measure()` nữa.
    const onResize = vi.fn<(size: TerminalDimensions) => void>();
    const dead = create(onResize);
    await sleep(SETTLE_MS);
    const lastSize = dead.measure();
    dead.dispose();

    expect(() => dead.measure()).not.toThrow();
    expect(dead.measure()).toEqual(lastSize);
  });
});

/**
 * Ổ cắm giả cho tầng `TerminalSurface`.
 *
 * Ghi đè `globalThis.WebSocket` chứ không tiêm `socketFactory`: `TerminalSurface`
 * gọi `openConnection` KHÔNG truyền factory, nên đường production đọc đúng biến
 * toàn cục (cùng lý do đã ghi ở `terminal-surface.browser.test.tsx`).
 *
 * `connection.ts` so `socket.readyState !== WebSocket.OPEN` — đọc hằng số TĨNH
 * trên lớp toàn cục, tức trên LỚP NÀY. Nên bốn hằng static dưới là bắt buộc,
 * không phải trang trí cho giống thật.
 */
class FakeSocket extends EventTarget {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;
  public static last: FakeSocket | null = null;

  public readyState: number = FakeSocket.CONNECTING;
  public binaryType = 'blob';
  public readonly sent: unknown[] = [];

  public constructor(
    public readonly url: string,
    public readonly protocols?: string | string[],
  ) {
    super();
    FakeSocket.last = this;
  }

  public send(data: unknown): void {
    this.sent.push(data);
  }

  public close(): void {
    if (this.readyState === FakeSocket.CLOSED) {
      return;
    }
    this.readyState = FakeSocket.CLOSED;
    this.dispatchEvent(new CloseEvent('close', { code: 1000 }));
  }

  public simulateOpen(): void {
    this.readyState = FakeSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  /** Frame control là JSON dạng TEXT (protocol.ts); stdin đi đường binary. */
  public controlFrames(): Array<Record<string, unknown>> {
    return this.sent
      .filter((frame): frame is string => typeof frame === 'string')
      .map((frame) => JSON.parse(frame) as Record<string, unknown>);
  }
}

describe('TerminalHandle.fit() — dây nối tới connection', () => {
  const realWebSocket = globalThis.WebSocket;
  let pane: HTMLDivElement;
  let mountPoint: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
    FakeSocket.last = null;

    // Tab ẩn = giữ mounted + `display:none` (contract §C5).
    pane = makeBox({ display: 'none' });
    mountPoint = document.createElement('div');
    pane.appendChild(mountPoint);
  });

  afterEach(async () => {
    if (root !== null) {
      const r = root;
      root = null;
      await act(async () => {
        r.unmount();
      });
    }
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = realWebSocket;
    pane.remove();
  });

  it('pane ẩn ⇒ 0 frame resize; pane hiện + fit() ⇒ đúng 1 frame resize', async () => {
    // Hộp chứ không phải biến rời: TS thôi thu hẹp kiểu về `null` khi giá trị
    // được gán từ trong callback, và `handle!.fit()` sau đó không còn biên dịch.
    const captured: { handle: TerminalHandle | null } = { handle: null };

    root = createRoot(mountPoint);
    const currentRoot = root;
    await act(async () => {
      currentRoot.render(
        <TerminalSurface
          wsUrl="ws://localhost/ws/session/test"
          connectionKey={1}
          theme="dlp-dark"
          onControl={() => {}}
          onClose={() => {}}
          onReady={(handle) => {
            captured.handle = handle;
          }}
        />,
      );
    });

    const socket = FakeSocket.last;
    expect(socket).not.toBeNull();
    await act(async () => {
      socket!.simulateOpen();
    });

    // Tiền đề: handshake xong và `init` đã đi. Không khẳng định vế này thì một
    // ca "0 frame resize" cũng đúng với một socket chưa bao giờ mở — tức nó
    // khẳng định đúng cái nó không kiểm.
    expect(socket!.controlFrames().map((frame) => frame.type)).toEqual(['init']);
    expect(captured.handle).not.toBeNull();

    // `TerminalSurface` đặt `h-full w-full` (Tailwind), mà harness không nạp CSS
    // của app — nên cho container một kích thước tường minh, đúng thứ layout
    // thật cấp cho nó. Không có dòng này thì ca đo chiều cao auto của chính
    // xterm chứ không đo `fit()`.
    const surfaceEl = mountPoint.querySelector<HTMLElement>('[data-testid="dlp-terminal"]');
    expect(surfaceEl).not.toBeNull();
    surfaceEl!.style.width = '640px';
    surfaceEl!.style.height = '320px';

    // Vế ÂM: pane còn ẩn ⇒ gọi hớ cũng không được đẻ frame nào.
    expect(() => captured.handle!.fit()).not.toThrow();
    expect(socket!.controlFrames().filter((frame) => frame.type === 'resize')).toHaveLength(0);

    // Vế DƯƠNG: pane hiện lại ⇒ đúng một frame `resize` mang số thật.
    pane.style.display = 'block';
    void pane.offsetHeight;
    act(() => {
      captured.handle!.fit();
    });

    const resizes = socket!.controlFrames().filter((frame) => frame.type === 'resize');
    expect(resizes).toHaveLength(1);
    const frame = resizes[0];
    expect(frame).toBeDefined();
    expect(frame!.cols).toBeGreaterThan(2);
    expect(frame!.rows).toBeGreaterThan(1);
  });
});
