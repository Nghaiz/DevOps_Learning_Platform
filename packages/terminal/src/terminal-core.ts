import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import { ImageAddon } from '@xterm/addon-image';
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
  /**
   * Ảnh nội tuyến (sixel + IIP). MẶC ĐỊNH TẮT — đọc khối lý do ở chỗ nạp
   * `ImageAddon` trong `createTerminalCore` TRƯỚC khi bật, ở đó có điều kiện
   * cụ thể phải xong trước (CSP `script-src` cần `'wasm-unsafe-eval'`).
   */
  readonly enableImages?: boolean;
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
  /**
   * Contract §C3 — đo lại kích thước và fit. BẮT BUỘC gọi khi tab chứa terminal
   * chuyển từ ẩn sang hiện: xterm đo được 0×0 trên phần tử `display:none`, nên
   * nếu không gọi thì terminal hiện ra với số cột sai.
   *
   * An toàn khi gọi hớ: container còn 0×0 ⇒ KHÔNG ném và KHÔNG phát `resize`;
   * terminal đã `dispose()` ⇒ no-op im lặng. Lý do đầy đủ ở chỗ hiện thực.
   */
  fit(): void;
  setTheme(name: ThemeName): void;
  search(query: string): void;
  write(chunk: Uint8Array): void;
  focus(): void;
  dispose(): void;
}

/**
 * F2 — nạp addon theo thứ tự fit → unicode11 → webgl → image (tuỳ chọn, mặc
 * định TẮT) → search/web-links/clipboard.
 *
 * Thứ tự KHÔNG tuỳ tiện:
 * - `fit` trước để `proposeDimensions()` có sẵn khi ai đó đo sớm.
 * - `unicode11` phải đứng **trước** renderer: nó đổi bảng chiều-rộng-ký-tự, và
 *   renderer cache atlas glyph theo bảng đó. Nạp sau thì atlas dựng bằng bảng
 *   Unicode 6 cũ và glyph Nerd Font (rộng 2 ô) vẽ đè lên ký tự bên cạnh.
 * - `webgl` trước các addon phụ để `onContextLoss` gắn được ngay, không lỡ mất
 *   sự kiện mất context xảy ra trong lúc còn đang nạp addon khác.
 * - `image` SAU `webgl`: nó vá `_renderService.setRenderer` để gỡ canvas layer
 *   của mình mỗi lần renderer bị đổi, và lượt đổi có thật ở file này chính là
 *   `onContextLoss` → `webgl.dispose()` → xterm quay về DOM renderer.
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
  let webgl: WebglAddon | null = null;
  try {
    // ⛔ `new WebglAddon()` phải nằm TRONG try. Constructor của
    // `@xterm/addon-webgl@0.19.0` có đúng một nhánh ném — `isSafari &&
    // safariVersion < 16` → `throw new Error("Webgl2 is only supported on Safari
    // 16 and above")` (đọc từ dist, không suy đoán). Để nó ngoài try thì trên
    // Safari 15 `createTerminalCore` NÉM và cả terminal không dựng được, chứ
    // không phải "rơi về DOM renderer" như ý định của khối này.
    //
    // Chrome đi nhánh khác: nó ném `"WebGL2 not supported"` bên trong
    // `activate()`, tức bên trong `loadAddon` ngay dưới — nhánh đó try này vốn
    // đã bọc. Nên đây là một cảnh harness Chromium KHÔNG dựng được, và ta nói
    // thẳng thay vì để ô AC ngụ ý đã phủ.
    webgl = new WebglAddon();
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

  // Ảnh nội tuyến (sixel + IIP) — nạp SAU webgl, và MẶC ĐỊNH TẮT.
  //
  // ⛔ MẶC ĐỊNH TẮT là một phép đo, không phải sự dè dặt. `ImageAddon.activate()`
  // dựng `SixelHandler`, và constructor của handler đó gọi `DecoderAsync(...)`
  // ⇒ `new WebAssembly.Module(...)` NGAY lúc nạp addon (đọc từ
  // `@xterm/addon-image@0.9.0/src/SixelHandler.ts`; `terminal-image.browser.test.tsx`
  // đo lại điều đó bằng đối chứng âm). CSP của apps/web là
  // `script-src 'self' 'nonce-…' 'strict-dynamic'`
  // (apps/web/src/server/security/headers.ts) — KHÔNG có `'wasm-unsafe-eval'`,
  // nên trình duyệt CHẶN lượt biên dịch đó.
  //
  // Bật mù thì hỏng theo kiểu khó thấy nhất: chuỗi `.then()` trong
  // `SixelHandler` không có `.catch`, nên mỗi lần mount terminal đẻ một
  // unhandled promise rejection và sixel chết câm — trong khi harness test
  // KHÔNG có CSP nên mọi test vẫn xanh.
  //
  // ĐIỀU KIỆN BẬT: `script-src` có `'wasm-unsafe-eval'`. Bật rồi thì kèm hai
  // đổi hành vi cần biết trước — DA1 trả `\x1b[?62;4;9;22c` (khai có sixel) và
  // `windowOptions` bật ba báo cáo CSI t (14/16/18), tức terminal tự gửi byte
  // lên PTY khi ứng dụng hỏi kích thước.
  if (options.enableImages === true) {
    terminal.loadAddon(new ImageAddon());
  }

  const searchAddon = new SearchAddon();
  terminal.loadAddon(searchAddon);
  terminal.loadAddon(new WebLinksAddon());
  terminal.loadAddon(new ClipboardAddon());

  const dataListener = terminal.onData(options.onData);

  let lastSize: TerminalDimensions = { cols: terminal.cols, rows: terminal.rows };
  /** `null` = chưa phát lượt `resize` nào. Xem khối lý do trong callback dưới. */
  let lastNotified: TerminalDimensions | null = null;
  let disposed = false;

  /**
   * Đo THẬT, hoặc `null` khi container chưa có kích thước dùng được
   * (`display:none`, mount trước layout).
   *
   * Vế `null` là phần đúng-sai, không phải kiểu trả về cho đẹp: `measure()` trả
   * KÍCH THƯỚC CŨ khi đo hỏng, nên hai ca "đo hỏng" và "đo được, trùng số cũ"
   * không phân biệt được từ giá trị trả về. `fit()` bắt buộc phải phân biệt —
   * ca đầu phải im lặng, ca sau có thể phát.
   *
   * Fit ở trạng thái không đo được là ép terminal về kích thước rác rồi gửi
   * `resize` sai lên PTY — nên đọc trước, chỉ `fit()` khi có số thật. Cách nhận
   * biết 'không đo được' KHÔNG hiển nhiên: xem khối lý do trong thân hàm.
   */
  function tryMeasure(): TerminalDimensions | null {
    // Đo cái HỘP trước, và ĐỪNG tin con số `proposeDimensions()` trả về để phát
    // hiện "chưa có kích thước".
    //
    // Đọc từ `@xterm/addon-fit@0.11.0/src/FitAddon.ts`: nó kẹp SÀN
    // `MINIMUM_COLS = 2` / `MINIMUM_ROWS = 1` bằng `Math.max`. Nên một container
    // 0×0 KHÔNG trả về 0×0 — nó trả về **2×1**, một cặp số hợp lệ về hình thức
    // mà mọi guard kiểu `cols < 1` không bao giờ bắt được. Hậu quả nếu tin nó:
    // terminal bị ép về 2 cột và frame `resize` 2×1 đó đi thẳng lên PTY của pod.
    // `terminal-fit.browser.test.tsx` có đối chứng đo lại đúng cặp 2×1 này.
    const { clientWidth, clientHeight } = options.container;
    if (clientWidth < 1 || clientHeight < 1) {
      return null;
    }
    const proposed = fitAddon.proposeDimensions();
    // `undefined` = terminal chưa mở, hoặc chưa đo được bề rộng ô. NaN = hộp cha
    // có `display:none` mà bề rộng ô vẫn còn cache: FitAddon `parseInt` một giá
    // trị computed không phải pixel ⇒ NaN, rồi `Math.max(2, NaN)` **cũng là NaN**
    // — và `NaN < 1` là `false`, tức một guard chỉ so sánh sẽ cho nó lọt.
    if (
      proposed === undefined ||
      !Number.isFinite(proposed.cols) ||
      !Number.isFinite(proposed.rows) ||
      proposed.cols < 1 ||
      proposed.rows < 1
    ) {
      return null;
    }
    fitAddon.fit();
    lastSize = { cols: terminal.cols, rows: terminal.rows };
    return lastSize;
  }

  function measure(): TerminalDimensions {
    return tryMeasure() ?? lastSize;
  }

  /**
   * ĐƯỜNG PHÁT `resize` DUY NHẤT — cả `ResizeObserver` lẫn `fit()` đi qua đây.
   *
   * Gộp lại chứ không để mỗi bên tự phát: `ResizeObserver` bắn cả khi chỉ đổi
   * chiều cao vài pixel dưới một hàng, nên phép dedup theo GIÁ TRỊ là bắt buộc
   * (mỗi frame control thừa là một lần chạm rate-limit của G8 mà không mang tin
   * gì). Hai đường phát song song là chỗ để một bên quên phép dedup đó.
   *
   * Chưa từng phát lần nào (`lastNotified === null`) thì PHÁT. Vế này chỉ với
   * tới từ `fit()`: đường RO tự chặn lượt đo đầu tiên tại call-site của nó (xem
   * khối lý do dưới), còn `fit()` là hành động tường minh của người vừa mở tab —
   * nuốt nó thì kích thước mới không bao giờ tới PTY, đúng thứ `fit()` sinh ra
   * để tránh.
   */
  function notifyResize(size: TerminalDimensions): void {
    if (
      lastNotified !== null &&
      size.cols === lastNotified.cols &&
      size.rows === lastNotified.rows
    ) {
      return;
    }
    lastNotified = size;
    options.onResize(size);
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const resizeObserver = new ResizeObserver(() => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const size = measure();
      if (lastNotified === null) {
        // ⛔ Lượt đo ĐẦU TIÊN chỉ GHI, KHÔNG phát — đúng hợp đồng đã ghi ở
        // docblock của `onResize` ("KHÔNG gọi cho lần đo đầu tiên").
        //
        // `ResizeObserver` LUÔN bắn một lượt ngay khi `observe()`, nên nếu seed
        // `lastNotified` bằng `lastSize` (= mặc định 80×24 của xterm lúc dựng,
        // TRƯỚC mọi phép đo thật) thì lượt bắn đó thấy 78×16 ≠ 80×24 và phát một
        // `resize` thừa ở MỌI lần mount — mang đúng kích thước mà `init` vừa gửi
        // xong (contract §3 bước 4). Đo được 2026-08-13 ở 1.G-5: mount rồi không
        // đổi gì vẫn ra đúng một lượt `onResize({cols:78,rows:16})`.
        //
        // Seed bằng `measure()` lúc dựng thì hỏng chỗ khác: nó ép `fit()` chạy
        // TRƯỚC khi font tải xong, đúng thứ F4 cấm.
        lastNotified = size;
        return;
      }
      notifyResize(size);
    }, RESIZE_DEBOUNCE_MS);
  });

  resizeObserver.observe(options.container);

  return {
    terminal,

    measure,

    /**
     * Contract §C3. Đo lại + fit + phát `resize` nếu số cột/hàng thật sự đổi.
     *
     * Người gọi: tab chứa terminal vừa từ ẩn sang hiện. Không gọi thì xterm giữ
     * nguyên số cột đo được lúc còn `display:none` và prompt vẽ sai bề rộng.
     *
     * Hai vế an toàn, cả hai đều đúng-sai chứ không phải phòng thủ thừa:
     *
     * 1. Đã `dispose()` ⇒ no-op. Ca có thật: tab đóng trong lúc hiệu ứng chuyển
     *    tab còn chạy, lượt fit bay tới sau khi terminal đã bị huỷ.
     * 2. Container vẫn 0×0 ⇒ KHÔNG phát `resize`. Không có gì chặn hộ ở tầng
     *    dưới: `clampDimension` kéo 0 LÊN `MIN_DIMENSION` = 1 (protocol.ts), nên
     *    frame đó tới `ioctl(TIOCSWINSZ)` của pod thành terminal RỘNG 1 CỘT và
     *    mọi TUI đang chạy vỡ layout tới tận lần resize sau.
     */
    fit(): void {
      if (disposed) {
        return;
      }
      const size = tryMeasure();
      if (size === null) {
        return;
      }
      // Cố ý KHÔNG đi qua debounce: lượt này là hệ quả của một hành động rời rạc
      // (đổi tab), không phải chuỗi `ResizeObserver` bắn liên tục lúc kéo cửa
      // sổ. Đổi hiển thị cũng làm RO bắn, nhưng phép dedup theo giá trị trong
      // `notifyResize` đã đủ để lượt đó không phát trùng.
      notifyResize(size);
    },

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
      // Cờ bật TRƯỚC mọi thứ khác: một `fit()` bay tới sau lượt này phải no-op
      // chứ không được chạm `fitAddon` của terminal đã huỷ.
      disposed = true;
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
