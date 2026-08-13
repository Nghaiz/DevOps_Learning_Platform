import { WebglAddon } from '@xterm/addon-webgl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTerminalCore, type TerminalCore } from './terminal-core.ts';

/**
 * 1.G-6 R1 — gác nhánh **Safari < 16** của `@xterm/addon-webgl@0.19.0`.
 *
 * Chạy trong project `safari15`: Chromium `--disable-3d-apis` + `userAgent` giả
 * Safari 15.6.1. Đó là tổ hợp DUY NHẤT thoả cả ba điều kiện của nhánh ném trong
 * constructor (xem docblock `safariProject()` ở `vitest.config.ts`).
 *
 * Vì sao cần một project riêng thay vì thêm ca vào `terminal-core.browser.test.tsx`:
 * UA giả đổi nhánh code của chính xterm, nên để nó rò sang `gpu-on`/`gpu-off` là
 * đo hai project kia ở một cảnh không ai chủ ý.
 *
 * ⛔ Trước ô này, bản vá Q5 của 1.G-5 (`new WebglAddon()` chuyển vào trong `try`)
 * KHÔNG có gì gác: harness khi đó là Chromium mặc định, mà Chrome đi nhánh ném
 * KHÁC (`"WebGL2 not supported"` bên trong `activate()`, vốn đã được `try` bọc).
 */

const FALLBACK_WARN = '[dlp-terminal] không khởi tạo được WebGL';

/** Sao chép nguyên văn phép dò của addon — cùng options, nếu không là đo thứ khác. */
function webgl2Available(): boolean {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2', {
    antialias: false,
    depth: false,
    preserveDrawingBuffer: true,
  });
  return gl !== null;
}

function mountContainer(width = 640, height = 320): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  document.body.appendChild(el);
  return el;
}

describe('tiền đề của cảnh safari15 — phải là ASSERTION, không phải giả định', () => {
  it('userAgent qua được đúng hai phép kiểm mà addon dùng', () => {
    const ua = navigator.userAgent;
    // Hai biểu thức dưới CHÉP TỪ dist của addon, không phải xấp xỉ: nếu chép sai
    // thì ca này xanh trong khi addon vẫn đọc ra "không phải Safari".
    expect(/^((?!chrome|android).)*safari/i.test(ua)).toBe(true);
    const version = ua.match(/Version\/(\d+)/);
    expect(version).not.toBeNull();
    expect(Number.parseInt(version![1]!, 10)).toBeLessThan(16);
  });

  it('WebGL2 vắng — vế thứ BA của nhánh ném', () => {
    // Bản ghi 1.G-5 nói nhánh này chỉ gác bằng `isSafari && version < 16`. Sai:
    // còn một phép dò webgl2 BÊN TRONG, nên Safari 15 mà vẫn có WebGL2 thì
    // KHÔNG ném. Thiếu ca này thì cảnh có thể hụt vế ba mà không ai biết.
    expect(webgl2Available()).toBe(false);
  });

  it('nhánh ném của vendor THẬT SỰ chạy được ở cảnh này', () => {
    // ⛔ Đây là lưới an toàn cho CẢ FILE. Không có nó thì ngày UA-spoof hoặc cờ
    // launch ngừng tác dụng, mọi ca dưới vẫn XANH — vì `createTerminalCore`
    // vốn không ném ở cảnh Chrome bình thường. Test khi đó khẳng định đúng cái
    // nó không kiểm, đúng họ "suite xanh vì mọi test đều skip".
    expect(() => new WebglAddon()).toThrow(/Safari 16 and above/);
  });
});

describe('Safari < 16: createTerminalCore rơi về DOM renderer thay vì chết (AC §Terminal UX)', () => {
  let container: HTMLDivElement;
  let core: TerminalCore | null = null;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = mountContainer();
    warn = vi.spyOn(console, 'warn');
  });

  afterEach(() => {
    core?.dispose();
    core = null;
    container.remove();
    warn.mockRestore();
  });

  it('KHÔNG ném — đây là ô đỏ nếu ai đưa `new WebglAddon()` ra ngoài khối try', () => {
    expect(() => {
      core = createTerminalCore({
        container,
        theme: 'dlp-dark',
        onData: () => {},
        onResize: () => {},
      });
    }).not.toThrow();
  });

  it('có console.warn fallback', () => {
    core = createTerminalCore({
      container,
      theme: 'dlp-dark',
      onData: () => {},
      onResize: () => {},
    });

    const warnedFallback = warn.mock.calls.some(
      (args: unknown[]) => typeof args[0] === 'string' && args[0].startsWith(FALLBACK_WARN),
    );
    expect(warnedFallback).toBe(true);
  });

  it('terminal vẫn ghi được chữ, và vẫn vẽ bằng DOM renderer', async () => {
    core = createTerminalCore({
      container,
      theme: 'dlp-dark',
      onData: () => {},
      onResize: () => {},
    });

    await new Promise<void>((resolve) => {
      core!.terminal.write('xin chào 123', resolve);
    });

    // Đọc từ buffer: đây là vế "terminal thật sự CHẠY", không phải "dựng xong".
    const line = core.terminal.buffer.active.getLine(0)?.translateToString(true);
    expect(line).toContain('xin chào 123');

    // Và vế phân biệt "còn chạy" với "còn chạy BẰNG DOM renderer" — thiếu nó thì
    // một hiện thực im lặng dựng canvas WebGL vẫn qua được ca trên.
    expect(container.querySelector('.xterm-screen canvas')).toBeNull();
    expect(container.querySelector('.xterm-rows')).not.toBeNull();
  });
});
