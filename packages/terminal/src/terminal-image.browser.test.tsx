import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTerminalCore, type TerminalCore } from './terminal-core.ts';

/**
 * `@xterm/addon-image` — đường nạp, MẶC ĐỊNH TẮT.
 *
 * File này gác đúng một câu hỏi: *bật cờ lên thì có nạp được cạnh webgl không, và
 * cái giá của việc bật là gì?* Câu trả lời "giá" không đọc được từ README — nó là
 * một lượt **biên dịch WebAssembly ngay lúc activate**, và CSP hiện tại của
 * apps/web (`script-src 'self' 'nonce-…' 'strict-dynamic'`, không có
 * `'wasm-unsafe-eval'`) chặn đúng lượt đó.
 *
 * ⛔ Harness KHÔNG có CSP. Nên hai ca WASM dưới đây KHÔNG chứng minh được là
 * production chạy hay không chạy — chúng chỉ đóng đinh rằng lượt biên dịch CÓ
 * XẢY RA và xảy ra lúc nào. Đó là vế mà một phép đo trong harness còn nói được;
 * vế còn lại phải đo trên trang thật (`apps/web/e2e/csp.spec.ts`), không phải ở đây.
 */

declare const __EXPECT_WEBGL2__: boolean;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface WasmSpy {
  compiles: number;
  restore(): void;
}

/**
 * Đếm mọi cửa vào WebAssembly. Đếm CẢ BA (`Module`, `compile`, `instantiate`) vì
 * `inwasm` — lớp bọc mà bản dựng của addon dùng — chọn cửa theo cờ lúc đóng gói,
 * nên bám vào đúng một cửa là cách để phép đếm âm thầm về 0 ở bản sau.
 */
function spyWasm(): WasmSpy {
  const realModule = WebAssembly.Module;
  const realCompile = WebAssembly.compile;
  const realInstantiate = WebAssembly.instantiate;
  const target = WebAssembly as unknown as Record<string, unknown>;

  const spy: WasmSpy = {
    compiles: 0,
    restore(): void {
      target.Module = realModule;
      target.compile = realCompile;
      target.instantiate = realInstantiate;
    },
  };

  target.Module = new Proxy(realModule, {
    construct(ctor, args: unknown[]): object {
      spy.compiles += 1;
      return Reflect.construct(ctor, args) as object;
    },
  });
  target.compile = (...args: unknown[]): unknown => {
    spy.compiles += 1;
    return (realCompile as (...a: unknown[]) => unknown)(...args);
  };
  target.instantiate = (...args: unknown[]): unknown => {
    spy.compiles += 1;
    return (realInstantiate as (...a: unknown[]) => unknown)(...args);
  };

  return spy;
}

describe('@xterm/addon-image — nạp sau webgl, mặc định TẮT', () => {
  let container: HTMLDivElement;
  let core: TerminalCore | null = null;
  let wasm: WasmSpy | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '640px';
    container.style.height = '320px';
    document.body.appendChild(container);
  });

  afterEach(() => {
    core?.dispose();
    core = null;
    wasm?.restore();
    wasm = null;
    container.remove();
  });

  function create(enableImages: boolean): TerminalCore {
    return createTerminalCore({
      container,
      theme: 'dlp-dark',
      onData: () => {},
      onResize: () => {},
      ...(enableImages ? { enableImages: true } : {}),
    });
  }

  it('mặc định (không truyền cờ): KHÔNG có lượt biên dịch WASM nào', async () => {
    // Đối chứng ÂM của ca dưới. Không có nó thì "bật cờ ⇒ có WASM" cũng đúng với
    // một cảnh mà thứ gì khác trong xterm biên dịch WASM, và kết luận về CSP sẽ
    // trỏ nhầm thủ phạm.
    wasm = spyWasm();
    core = create(false);
    await sleep(300);

    expect(wasm.compiles).toBe(0);
  });

  it('bật cờ: nạp được, KHÔNG ném, và CÓ biên dịch WASM ngay lúc activate', async () => {
    wasm = spyWasm();

    expect(() => {
      core = create(true);
    }).not.toThrow();

    // `SixelHandler` gọi `DecoderAsync(...)` trong constructor của nó, tức trong
    // `activate()` — không phải lúc gặp sequence sixel đầu tiên. Vì thế cái giá
    // CSP phải trả ngay ở lần mount terminal, kể cả khi không ai in ảnh.
    await sleep(300);
    expect(wasm.compiles).toBeGreaterThanOrEqual(1);

    // Terminal vẫn phải CHẠY sau khi nạp thêm addon — đọc từ buffer chứ không từ
    // DOM (WebGL vẽ vào canvas nên `textContent` rỗng ở cảnh `gpu-on`).
    await new Promise<void>((resolve) => {
      core!.terminal.write('xin chào ảnh', resolve);
    });
    expect(core!.terminal.buffer.active.getLine(0)?.translateToString(true)).toContain(
      'xin chào ảnh',
    );
  });

  it('bật cờ ở CẢ hai cảnh WebGL: không ném, và fit() vẫn hoạt động', async () => {
    // Chạy ở `gpu-on` lẫn `gpu-off`. Cảnh `gpu-off` là đường mà `WebglAddon` ném
    // và `terminal-core.ts` rơi về DOM renderer — addon ảnh phải nạp được ở đó
    // y như ở cảnh có WebGL, nếu không thì máy tắt hardware acceleration mất
    // terminal chứ không chỉ mất ảnh.
    core = create(true);
    await sleep(100);

    expect(() => core!.fit()).not.toThrow();
    expect(core.terminal.cols).toBeGreaterThan(2);
  });

  it.runIf(__EXPECT_WEBGL2__)(
    'chỉ gpu-on: mất WebGL context trong lúc bật ảnh ⇒ đổi renderer KHÔNG ném',
    async () => {
      // Đây là đường thứ hai mà brief bắt kiểm: `onContextLoss` →
      // `webgl.dispose()` → xterm quay về DOM renderer. `ImageAddon` vá
      // `_renderService.setRenderer` để gỡ canvas layer của nó ở đúng lượt đổi
      // này (`ImageRenderer._open`), nên nếu bản vá đó không chịu được thì hỏng
      // xảy ra TẠI ĐÂY chứ không phải lúc nạp.
      core = create(true);
      await sleep(100);

      // KHÔNG bám `.xterm-screen canvas` (lượt chạy đầu cho thấy canvas đầu tiên
      // ở đó trả `null` cho `getContext('webgl2')`, tức nó là một lớp canvas
      // khác). Quét hết rồi lấy cái nào thật sự cấp được context WebGL2.
      const canvases = Array.from(container.querySelectorAll('canvas'));
      const glCanvas = canvases.find((c) => c.getContext('webgl2') !== null);
      // So bằng object để thông báo lỗi in ra luôn SỐ canvas tìm thấy — một
      // `toBeDefined()` trần chỉ nói 'không thấy' mà không nói thấy những gì.
      expect({ canvasCount: canvases.length, foundWebgl: glCanvas !== undefined }).toEqual({
        canvasCount: canvases.length,
        foundWebgl: true,
      });
      const gl = glCanvas!.getContext('webgl2');
      const loseContext = gl!.getExtension('WEBGL_lose_context');
      expect(loseContext).not.toBeNull();

      loseContext!.loseContext();
      await sleep(200);

      // Terminal còn sống và còn ghi được sau khi renderer bị tráo.
      await new Promise<void>((resolve) => {
        core!.terminal.write('sau khi mất context', resolve);
      });
      expect(core.terminal.buffer.active.getLine(0)?.translateToString(true)).toContain(
        'sau khi mất context',
      );
      expect(() => core!.fit()).not.toThrow();
    },
  );
});
