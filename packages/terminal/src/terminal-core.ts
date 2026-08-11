import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { THEMES, type ThemeName } from './themes.ts';

/**
 * F3 — font self-host. `DLPTerminalNF` là alias nội bộ trỏ vào bản subset của
 * **CaskaydiaCove Nerd Font Mono** (xem `style.css` + `scripts/build-font.mjs`).
 *
 * `CaskaydiaCove Nerd Font Mono` đứng thứ hai để máy đã cài sẵn font gốc dùng
 * được ngay cả trước khi woff2 tải xong; `monospace` là lưới an toàn cuối. KHÔNG
 * đặt font tỉ lệ nào trong stack — một fallback không-monospace làm FitAddon
 * tính sai số cột và mọi thứ lệch cột.
 */
export const TERMINAL_FONT_FAMILY =
  '"DLPTerminalNF", "CaskaydiaCove Nerd Font Mono", "Cascadia Mono", monospace';

export interface TerminalDimensions {
  readonly cols: number;
  readonly rows: number;
}

export interface TerminalCoreOptions {
  readonly container: HTMLElement;
  readonly theme: ThemeName;
  /** Gọi mỗi khi người dùng gõ/dán — chuỗi thô của xterm. */
  readonly onData: (data: string) => void;
  /** Gọi sau debounce khi kích thước đổi. KHÔNG gọi cho lần đo đầu tiên. */
  readonly onResize: (size: TerminalDimensions) => void;
}

/** Contract §4 — "FE debounce ~50ms". SSOT là contract, không phải plan (bản plan cũ ghi 100ms). */
export const RESIZE_DEBOUNCE_MS = 50;

export interface TerminalCore {
  readonly terminal: Terminal;
  /**
   * Đo lại và trả kích thước hiện tại. Gọi được nhiều lần; an toàn khi container
   * đang có kích thước 0 (trả về kích thước cũ thay vì 0×0).
   */
  measure(): TerminalDimensions;
  setTheme(name: ThemeName): void;
  search(query: string): void;
  write(chunk: Uint8Array): void;
  focus(): void;
  dispose(): void;
}

/**
 * F2 — nạp addon theo thứ tự fit → unicode11 → webgl → search/web-links/clipboard.
 *
 * Thứ tự KHÔNG tuỳ tiện:
 * - `fit` trước để `proposeDimensions()` có sẵn khi ai đó đo sớm.
 * - `unicode11` phải đứng **trước** renderer: nó đổi bảng chiều-rộng-ký-tự, và
 *   renderer cache atlas glyph theo bảng đó. Nạp sau thì atlas dựng bằng bảng
 *   Unicode 6 cũ và glyph Nerd Font (rộng 2 ô) vẽ đè lên ký tự bên cạnh.
 * - `webgl` trước các addon phụ để `onContextLoss` gắn được ngay, không lỡ mất
 *   sự kiện mất context xảy ra trong lúc còn đang nạp addon khác.
 */
export function createTerminalCore(options: TerminalCoreOptions): TerminalCore {
  const terminal = new Terminal({
    // BẮT BUỘC cho unicode11: `Terminal.unicode` là API EXPERIMENTAL, và truy cập
    // nó khi cờ này tắt sẽ NÉM. Không có nó thì addon nạp xong vẫn vô tác dụng.
    allowProposedApi: true,
    fontFamily: TERMINAL_FONT_FAMILY,
    fontSize: 14,
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback: 5_000,
    theme: THEMES[options.theme],
    // Server đã gộp stderr vào stdout vì `TTY: true` (contract §1) và PTY tự
    // dịch \n → \r\n. Bật convertEol ở client là dịch LẦN HAI cho byte đã đúng.
    convertEol: false,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  const unicode11 = new Unicode11Addon();
  terminal.loadAddon(unicode11);
  terminal.unicode.activeVersion = '11';

  terminal.open(options.container);

  // F2 — v6 đã bỏ canvas renderer, chỉ còn DOM + WebGL. Nên fallback phải TỰ
  // code: mất context ⇒ dispose addon ⇒ xterm tự quay về DOM renderer.
  let webgl: WebglAddon | null = new WebglAddon();
  try {
    terminal.loadAddon(webgl);
    webgl.onContextLoss(() => {
      // errors-over-silent-fallback: rơi về DOM là hành vi ĐÚNG, nhưng người
      // vận hành phải thấy nó xảy ra. Không nuốt.
      console.warn(
        '[dlp-terminal] mất WebGL context — chuyển sang DOM renderer. Terminal vẫn chạy, chỉ chậm hơn khi output dày.',
      );
      webgl?.dispose();
      webgl = null;
    });
  } catch (error) {
    // Máy tắt hardware acceleration / driver không cấp WebGL2 ⇒ constructor hoặc
    // activate() ném. Đây là ca AC "tắt hardware acceleration → vẫn chạy".
    console.warn('[dlp-terminal] không khởi tạo được WebGL, dùng DOM renderer:', error);
    webgl = null;
  }

  const searchAddon = new SearchAddon();
  terminal.loadAddon(searchAddon);
  terminal.loadAddon(new WebLinksAddon());
  terminal.loadAddon(new ClipboardAddon());

  const dataListener = terminal.onData(options.onData);

  let lastSize: TerminalDimensions = { cols: terminal.cols, rows: terminal.rows };

  function measure(): TerminalDimensions {
    // `proposeDimensions()` trả `undefined` khi container chưa có kích thước
    // (display:none, hoặc mount trước layout). `fit()` trong trạng thái đó ép
    // terminal về kích thước rác rồi gửi `resize` sai lên PTY — nên đọc trước,
    // chỉ fit khi có số thật.
    const proposed = fitAddon.proposeDimensions();
    if (proposed === undefined || proposed.cols < 1 || proposed.rows < 1) {
      return lastSize;
    }
    fitAddon.fit();
    lastSize = { cols: terminal.cols, rows: terminal.rows };
    return lastSize;
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const resizeObserver = new ResizeObserver(() => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const size = measure();
      if (size.cols === lastNotified.cols && size.rows === lastNotified.rows) {
        // Không phát `resize` khi số không đổi: `ResizeObserver` bắn cả khi chỉ
        // đổi chiều cao vài pixel dưới một hàng, và mỗi frame control thừa là
        // một lần chạm rate-limit của G8 mà không mang tin gì.
        return;
      }
      lastNotified = size;
      options.onResize(size);
    }, RESIZE_DEBOUNCE_MS);
  });

  let lastNotified: TerminalDimensions = lastSize;
  resizeObserver.observe(options.container);

  return {
    terminal,

    measure,

    setTheme(name: ThemeName): void {
      terminal.options.theme = THEMES[name];
    },

    search(query: string): void {
      searchAddon.findNext(query);
    },

    write(chunk: Uint8Array): void {
      // Contract §1 bẫy 2 — ghi thẳng Uint8Array, KHÔNG TextDecoder trước.
      // Một glyph Nerd Font 3–4 byte bị cắt qua ranh giới hai frame sẽ thành ký
      // tự hỏng nếu decode từng frame; xterm tự ghép byte dở dang.
      terminal.write(chunk);
    },

    focus(): void {
      terminal.focus();
    },

    dispose(): void {
      // Thứ tự: gỡ nguồn sự kiện TRƯỚC, huỷ terminal SAU. Ngược lại thì một
      // callback đang bay có thể chạm terminal đã dispose và ném trong lúc
      // unmount — đúng ca StrictMode dev chạy effect hai lần.
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      resizeObserver.disconnect();
      dataListener.dispose();
      webgl?.dispose();
      webgl = null;
      // `terminal.dispose()` tự dispose mọi addon còn lại đã loadAddon.
      terminal.dispose();
    },
  };
}

/**
 * F4 — "FitAddon chỉ đúng **sau khi font đã load**".
 *
 * Đo trước khi font metric có thật thì `proposeDimensions()` chia theo bề rộng
 * ký tự của font fallback, và prompt oh-my-posh vẽ ở số cột sai rồi nhảy khi
 * font thật tới. `document.fonts` vắng mặt (jsdom, trình duyệt rất cũ) ⇒ trả
 * luôn, đo bằng metric hiện có còn hơn treo mãi.
 */
export async function waitForFonts(): Promise<void> {
  const fonts = (globalThis as { document?: { fonts?: { ready?: Promise<unknown> } } }).document
    ?.fonts;
  if (fonts?.ready === undefined) {
    return;
  }
  await fonts.ready;
}
