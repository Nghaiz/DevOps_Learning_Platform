import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESIZE_DEBOUNCE_MS, createTerminalCore, type TerminalCore } from './terminal-core.ts';

/**
 * Chạy trong Chromium THẬT, hai lần: project `gpu-on` (mặc định) và `gpu-off`
 * (`--disable-3d-apis`). Xem `vitest.config.ts` cho lý do chọn cờ đó thay vì
 * `--disable-gpu` — cờ kia vẫn cho WebGL2 qua SwiftShader nên nhánh fallback
 * KHÔNG chạy, và ô AC gọi tên đúng cảnh đó.
 *
 * `__EXPECT_WEBGL2__` do config tiêm vào theo project.
 */
declare const __EXPECT_WEBGL2__: boolean;

const FALLBACK_WARN = '[dlp-terminal] không khởi tạo được WebGL';

function webgl2Available(): boolean {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2', {
    antialias: false,
    depth: false,
    preserveDrawingBuffer: true,
  });
  return gl !== null;
}

/** Container có kích thước THẬT — `proposeDimensions()` trả undefined ở 0×0. */
function mountContainer(width = 640, height = 320): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  document.body.appendChild(el);
  return el;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('cảnh WebGL của project', () => {
  it('khớp với cờ launch đã cấu hình — tiền đề của mọi ca dưới', () => {
    // ⛔ Ca này là lưới an toàn cho CẢ FILE. Ngày một bản Chrome đổi hành vi
    // `--disable-3d-apis`, project `gpu-off` sẽ chạy CÓ WebGL và mọi ca "fallback"
    // bên dưới trở thành vô nghĩa mà vẫn xanh. Ca này đỏ trước khi điều đó xảy ra.
    expect(webgl2Available()).toBe(__EXPECT_WEBGL2__);
  });
});

describe('fallback renderer khi không có WebGL2 (AC §Terminal UX)', () => {
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

  it('createTerminalCore KHÔNG ném, dù có WebGL hay không', () => {
    expect(() => {
      core = createTerminalCore({
        container,
        theme: 'dlp-dark',
        onData: () => {},
        onResize: () => {},
      });
    }).not.toThrow();
  });

  it('terminal vẫn nhận và giữ được dữ liệu ở cả hai cảnh', async () => {
    core = createTerminalCore({
      container,
      theme: 'dlp-dark',
      onData: () => {},
      onResize: () => {},
    });

    await new Promise<void>((resolve) => {
      core!.terminal.write('xin chào 123', resolve);
    });

    // Đọc từ BUFFER chứ không từ DOM: WebGL renderer vẽ vào canvas nên
    // `textContent` rỗng ở cảnh `gpu-on`. Buffer là thứ duy nhất so sánh được
    // giữa hai renderer, và nó chứng minh terminal thật sự CHẠY.
    const line = core.terminal.buffer.active.getLine(0)?.translateToString(true);
    expect(line).toContain('xin chào 123');
  });

  it('cảnh không-WebGL: có console.warn fallback và KHÔNG có canvas WebGL', () => {
    core = createTerminalCore({
      container,
      theme: 'dlp-dark',
      onData: () => {},
      onResize: () => {},
    });

    const warnedFallback = warn.mock.calls.some(
      (args: unknown[]) => typeof args[0] === 'string' && args[0].startsWith(FALLBACK_WARN),
    );
    const webglCanvas = container.querySelector('.xterm-screen canvas');

    if (__EXPECT_WEBGL2__) {
      // Đối chứng dương. Không có vế này thì "có warn khi tắt WebGL" cũng đúng
      // với một hiện thực warn ở MỌI lần dựng.
      expect(warnedFallback).toBe(false);
      expect(webglCanvas).not.toBeNull();
    } else {
      expect(warnedFallback).toBe(true);
      // Vế phân biệt "terminal còn chạy" với "terminal còn chạy BẰNG DOM renderer".
      expect(webglCanvas).toBeNull();
      expect(container.querySelector('.xterm-rows')).not.toBeNull();
    }
  });
});

describe('debounce resize 50ms — contract §4, vế (a) của luật 5', () => {
  let container: HTMLDivElement;
  let core: TerminalCore | null = null;

  beforeEach(() => {
    container = mountContainer();
  });

  afterEach(() => {
    core?.dispose();
    core = null;
    container.remove();
  });

  it('mount rồi KHÔNG đổi gì ⇒ 0 frame resize (lượt đo đầu chỉ ghi, không phát)', async () => {
    const onResize = vi.fn();
    core = createTerminalCore({ container, theme: 'dlp-dark', onData: () => {}, onResize });
    core.measure();

    await sleep(RESIZE_DEBOUNCE_MS * 6);

    // ⛔ Ô AC này tồn tại vì bản trước ĐỎ ở đây: `lastNotified` seed bằng mặc
    // định 80×24 của xterm nên lượt bắn bắt buộc của ResizeObserver lúc
    // `observe()` thấy 78×16 ≠ 80×24 và phát một `resize` thừa ở MỌI lần mount —
    // mang đúng kích thước mà `init` vừa gửi. Đo 2026-08-13, xem 1.G-5 Q4.
    expect(onResize).not.toHaveBeenCalled();
  });

  it('nhiều lần đổi kích thước trong một cửa sổ debounce ⇒ onResize chạy ĐÚNG 1 lần', async () => {
    const onResize = vi.fn();
    core = createTerminalCore({ container, theme: 'dlp-dark', onData: () => {}, onResize });
    core.measure();

    // Cho transient lúc mount lắng hẳn TRƯỚC khi đo burst. Không có vế này thì
    // lượt bắn bắt buộc của RO lúc `observe()` trộn vào burst và ca này có thể
    // xanh nhờ một lượt phát KHÔNG PHẢI do burst sinh ra.
    await sleep(RESIZE_DEBOUNCE_MS * 6);
    expect(onResize).not.toHaveBeenCalled();

    // Đếm số lần ResizeObserver THẬT SỰ bắn. Không có con số này thì "5 lần đổi
    // ⇒ 1 lần gọi" là tautology: trình duyệt có thể gộp cả 5 thay đổi vào MỘT
    // lần bắn RO, và khi đó phép đo không kiểm debounce mà kiểm chính RO.
    let roFires = 0;
    const spyRo = new ResizeObserver(() => {
      roFires += 1;
    });
    spyRo.observe(container);
    await sleep(30);
    roFires = 0;

    for (let i = 0; i < 5; i += 1) {
      container.style.width = `${640 + (i + 1) * 40}px`;
      // Cách nhau ĐỦ để RO bắn riêng từng lần, nhưng vẫn DƯỚI 50ms nên mỗi lần
      // bắn phải reset đồng hồ debounce.
      await sleep(15);
    }
    await sleep(RESIZE_DEBOUNCE_MS * 4);
    spyRo.disconnect();

    expect(roFires).toBeGreaterThanOrEqual(3);
    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it('đối chứng: hai lần đổi CÁCH NHAU hơn 50ms ⇒ onResize chạy 2 lần', async () => {
    const onResize = vi.fn();
    core = createTerminalCore({ container, theme: 'dlp-dark', onData: () => {}, onResize });
    core.measure();

    // Cùng lý do như ca trên: lượt bắn bắt buộc của RO lúc `observe()` là lượt
    // đo ĐẦU TIÊN, và lượt đó chỉ ghi chứ không phát. Không settle trước thì
    // thay đổi đầu tiên của ca này rơi đúng vào lượt-chỉ-ghi và ca đếm được 1.
    await sleep(RESIZE_DEBOUNCE_MS * 6);
    expect(onResize).not.toHaveBeenCalled();

    container.style.width = '900px';
    await sleep(RESIZE_DEBOUNCE_MS * 4);
    container.style.width = '500px';
    await sleep(RESIZE_DEBOUNCE_MS * 4);

    // Không có ca này thì một hiện thực "chỉ gọi onResize đúng một lần mãi mãi"
    // vẫn qua được ca trên.
    expect(onResize).toHaveBeenCalledTimes(2);
  });

  it('cols/rows không đổi ⇒ KHÔNG phát resize (bảo vệ trần control 100/s của G8)', async () => {
    const onResize = vi.fn();
    core = createTerminalCore({ container, theme: 'dlp-dark', onData: () => {}, onResize });
    core.measure();

    // Đổi chiều cao 2px — nhỏ hơn một hàng, nên rows không đổi.
    container.style.height = '322px';
    await sleep(RESIZE_DEBOUNCE_MS * 4);

    expect(onResize).not.toHaveBeenCalled();
  });
});
