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
  /**
   * Contract §C3 — đo lại kích thước và fit. BẮT BUỘC gọi khi tab chứa terminal
   * chuyển từ ẩn sang hiện: xterm đo được 0×0 trên phần tử `display:none`, nên
   * nếu không gọi thì terminal hiện ra với số cột sai.
   *
   * An toàn khi gọi hớ: container còn 0×0 ⇒ KHÔNG ném và KHÔNG phát `resize`;
   * terminal đã `dispose()` ⇒ no-op im lặng. Lý do đầy đủ ở chỗ hiện thực.
   */
  fit(): void;
  /**
   * F4 — đo lại SAU KHI FONT TẢI XONG. Ép xterm bỏ metric ô chữ đã cache từ lúc
   * `terminal.open()`, fit lại, và phát `resize` CHỈ KHI số cột/hàng thật sự đổi.
   *
   * BẮT BUỘC gọi sau `waitForFonts()`, và `measure()` KHÔNG thay thế được: xterm
   * không theo dõi `document.fonts` (grep bản dist 6.0.0: 0 kết quả), nên không
   * gọi thì terminal giữ số cột tính theo metric FONT FALLBACK vĩnh viễn — đo
   * được là 81×18 thay vì 76×20 ở khung 640×320.
   *
   * An toàn khi gọi hớ: đã `dispose()` ⇒ no-op; container 0×0 ⇒ KHÔNG phát;
   * kích thước không đổi ⇒ KHÔNG phát.
   */
  refitAfterFontLoad(): void;
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

  // ⛔ KHÔNG nạp `@xterm/addon-image`. Đường ảnh nội tuyến (sixel) đã được ĐO là
  // không đi được, ở BA tầng độc lập — mỗi tầng tự nó đủ chặn:
  //
  //   1. `fastfetch --logo-type sixel` KHÔNG phát byte sixel nào. Đo trên cụm
  //      2026-09-07, KHÔNG có tmux trong đường đi: 0 chuỗi mở DCS (`ESC P`),
  //      output là ASCII art, và **stderr rỗng** — nó rơi về im lặng.
  //   2. tmux nuốt DCS. Cùng lượt đo, payload sixel hợp lệ gõ thủ công: 1 chuỗi
  //      `ESC P` khi không qua tmux, **0** khi qua tmux, trong khi text thường
  //      vẫn tới nơi (nên không phải đường bắt byte hỏng).
  //   3. CSP chặn WASM. `ImageAddon.activate()` dựng `SixelHandler`, mà
  //      constructor của nó gọi `DecoderAsync(...)` ⇒ `new WebAssembly.Module(...)`
  //      NGAY lúc nạp addon, không phải lúc gặp sixel đầu tiên. `script-src` của
  //      apps/web (`'self' 'nonce-…' 'strict-dynamic'`) không có `'wasm-unsafe-eval'`.
  //      Chuỗi `.then()` trong `SixelHandler` lại không có `.catch`, nên bật mù sẽ
  //      đẻ một unhandled rejection ở MỖI lần mount — mà harness test không có CSP
  //      nên mọi test vẫn xanh.
  //
  // Giá của việc giữ nó: **+20 KB gzip trả ở MỌI lượt tải**, kể cả khi cờ tắt —
  // `if (cờ)` là điều kiện lúc chạy nên không bundler nào tree-shake được một
  // import tĩnh. Trả 20 KB cho một đường bị chặn ở ba chỗ là không mua được gì.
  //
  // Muốn mở lại thì phải gỡ CẢ BA, theo thứ tự: (1) một nguồn phát sixel thật,
  // (2) tmux chuyển tiếp được DCS, (3) CSP cho phép biên dịch WASM. Gỡ một hoặc
  // hai tầng không đủ, và mỗi tầng đều hỏng IM LẶNG.

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

  /**
   * Ép xterm ĐO LẠI bề rộng ô chữ.
   *
   * ⛔ Đây là API NỘI BỘ của xterm, và nó là cần câu DUY NHẤT còn lại. Bảng đo
   * trên `@xterm/xterm@6.0.0` (Chromium headless, 2026-09-08), container
   * 640×320, fontFamily `"DLPTerminalNF", monospace`, fontSize 14:
   *
   *   mở terminal TRƯỚC khi FontFace có      cell 7.7 → 81×18  (metric fallback)
   *   nạp FontFace xong, KHÔNG làm gì        cell 7.7 → 81×18  ← xterm không tự đo lại
   *   gán lại CÙNG `options.fontFamily`      cell 7.7          ← options dedup theo giá trị
   *   gán lại CÙNG `options.fontSize`        cell 7.7          ← như trên
   *   `_core._charSizeService.measure()`     cell 8.2 → 76×20
   *   đối chứng: terminal MỚI mở SAU đó      cell 8.2 → 76×20  ← trùng khớp
   *
   * Bản dist 6.0.0 không có một tham chiếu nào tới `document.fonts` /
   * `onloadingdone` (grep: 0 kết quả), nên nó KHÔNG bao giờ tự biết font đã đổi.
   * Không API công khai nào ép được: cả hai đường `options.*` đều bị chính xterm
   * dedup theo giá trị, nên gán lại giá trị cũ là no-op — đã đo, không suy đoán.
   *
   * Rủi ro đã cân: bản xterm sau đổi tên trường nội bộ ⇒ `measure` biến mất ⇒ ta
   * CẢNH BÁO rồi đi tiếp (fit vẫn chạy, chỉ bằng metric cũ), không ném và không
   * nuốt im lặng. `terminal-font-refit.browser.test.tsx` ghim đúng bảng trên, nên
   * lần đổi đó đỏ ở test chứ không hỏng im lặng trên cụm.
   */
  function remeasureCharSize(): void {
    const charSizeService = (
      terminal as unknown as {
        _core?: { _charSizeService?: { measure?: () => void } };
      }
    )._core?._charSizeService;
    if (typeof charSizeService?.measure !== 'function') {
      console.warn(
        '[dlp-terminal] không ép được xterm đo lại bề rộng ô sau khi font tải xong ' +
          '(_core._charSizeService.measure vắng mặt). Terminal vẫn chạy nhưng số cột ' +
          'tính theo metric font fallback.',
      );
      return;
    }
    charSizeService.measure();
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

    /**
     * F4 — đo lại sau khi font tải xong, phát `resize` nếu số cột/hàng đổi.
     *
     * Vì sao KHÔNG dùng `measure()` ở đây (đây là lỗi A5, và nó có HAI vế chứ
     * không phải một như bản ghi 2026-09-07 mô tả):
     *
     *   vế 1 — `measure()` không bao giờ phát `onResize`. Chỉ nhánh
     *          `ResizeObserver` phát, mà RO theo dõi CÁI HỘP còn `fit()` chỉ đổi
     *          số cột/hàng BÊN TRONG hộp, nên RO không có cớ bắn.
     *   vế 2 — và kể cả có phát thì cũng KHÔNG CÓ GÌ ĐỂ PHÁT: `measure()` gọi
     *          `fitAddon.fit()`, mà `proposeDimensions()` chia kích thước hộp cho
     *          `_renderService.dimensions.css.cell` — tức metric ĐÃ CACHE từ lúc
     *          `terminal.open()`. Font tải xong không chạm vào con số đó.
     *
     * Nên vá vế 1 một mình là vá vào chỗ không bao giờ chạy — và đó mới là lý do
     * thật khiến lỗi này latent, chứ không phải "7/7 lượt tình cờ trùng số".
     * Thứ tự dưới bắt buộc: đo lại metric TRƯỚC, rồi mới fit.
     *
     * So với `terminal.cols/rows` NGAY TRƯỚC lượt đo lại, không so với
     * `lastNotified`: con số đó chính là thứ frame `init` vừa mang đi (contract
     * §3 — `initialSize` là kết quả `measure()`, mà `measure()` đã fit). Phát vô
     * điều kiện thì mỗi lần mount với font nằm sẵn trong cache trình duyệt sẽ đẻ
     * một frame `resize` thừa mang đúng con số `init` vừa gửi, và mỗi frame
     * control thừa là một lần chạm rate-limit của G8 mà không mang tin gì.
     */
    refitAfterFontLoad(): void {
      if (disposed) {
        return;
      }
      const beforeRemeasure: TerminalDimensions = { cols: terminal.cols, rows: terminal.rows };
      remeasureCharSize();
      const size = tryMeasure();
      if (size === null) {
        return;
      }
      if (size.cols === beforeRemeasure.cols && size.rows === beforeRemeasure.rows) {
        return;
      }
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
