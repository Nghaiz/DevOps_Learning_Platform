import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RESIZE_DEBOUNCE_MS,
  TERMINAL_FONT_FAMILY,
  createTerminalCore,
  type TerminalCore,
  type TerminalDimensions,
} from './terminal-core.ts';

/**
 * A5 — lượt đo lại SAU KHI FONT TẢI XONG phải tới được server.
 *
 * Bản ghi 2026-09-07 mô tả lỗi một vế: "`measure()` gọi `fitAddon.fit()` nhưng
 * không bao giờ phát `onResize` … nếu phép đo trước-font khác sau-font thì server
 * giữ kích thước cũ vĩnh viễn", latent vì "cả 7 lượt hai phép đo ra cùng số".
 *
 * Đo lại thì lỗi có HAI vế lồng nhau, và vá một vế là vá vào chỗ không chạy:
 *
 *   vế 1 (đã ghi)    `measure()` không phát `onResize`. Chỉ nhánh ResizeObserver
 *                    phát, mà RO theo dõi CÁI HỘP còn `fit()` chỉ đổi số cột/hàng
 *                    BÊN TRONG hộp, nên RO không có cớ bắn.
 *   vế 2 (CHƯA ghi)  và thường cũng KHÔNG CÓ số mới để phát: `proposeDimensions()`
 *                    chia kích thước hộp cho `_renderService.dimensions.css.cell`
 *                    — metric ô chữ ĐÃ CACHE từ lúc `terminal.open()`. xterm 6.0.0
 *                    không có một tham chiếu nào tới `document.fonts` (grep bản
 *                    dist: 0 kết quả), nên font tải xong không chạm con số đó.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PHẠM VI ĐÃ CHỨNG MINH ĐƯỢC, và phần CHƯA — đọc trước khi tin vào màu xanh.
 *
 * CHỨNG MINH ĐƯỢC (ba ca đầu):
 *   · vế 2 ở tầng vendor: nạp webfont xong, xterm giữ nguyên metric; hai đường
 *     `options.*` công khai đều là no-op; chỉ `_charSizeService.measure()` đổi
 *     được, và đổi thành ĐÚNG giá trị của một terminal mở sau khi font đã có.
 *   · vế 1 ở tầng `TerminalCore`: metric đổi thật ⇒ `measure()` trả số MỚI mà
 *     KHÔNG phát gì; `refitAfterFontLoad()` phát đúng một lượt.
 *
 * CHƯA CHỨNG MINH ĐƯỢC — nói thẳng: KHÔNG dựng được ca đi trọn đường thật
 * (nạp webfont ⇒ `createTerminalCore` đổi số cột). Ba lý do độc lập, mỗi lý do
 * tự nó đủ để nuốt delta, đều đo được ngày 2026-09-08:
 *
 *   1. `TERMINAL_FONT_FAMILY` CÓ CHỦ Ý để `"CaskaydiaCove Nerd Font Mono"` và
 *      `"Cascadia Mono"` ngay sau webfont. Máy nào cài sẵn Cascadia — mọi máy
 *      Windows có Windows Terminal — thì metric trước-font BẰNG sau-font.
 *      `shadowLocalFallbacks()` dưới đây che hai font đó nên ca test không phụ
 *      thuộc máy; không có nó thì suite xanh/đỏ tuỳ máy cài font gì.
 *   2. Renderer WebGL LÀM TRÒN bề rộng ô về số nguyên px: đo cùng một trang,
 *      cùng lớp che font — terminal trần cho `_charSizeService.width` 7.697 và
 *      cell 7.7 (81 cột), còn `createTerminalCore` (đủ addon) cho 8.203 và cell
 *      **8** (78 cột). Chênh lệch metric dưới 1px bị nuốt trọn ở dpr 1.
 *   3. Chưa root-cause được vì sao chính `_charSizeService.width` của
 *      `createTerminalCore` đã là 8.203 trong khi terminal trần cùng stack font
 *      cho 7.697. Nghi WebglAddon, CHƯA chứng minh.
 *
 * Nên bản vá KHÔNG được đọc là "đã sửa lỗi xuống dòng sai chỗ". Nó đóng hai vế
 * hỏng có thật và đo được, và ca "số không đổi ⇒ không phát" chứng minh nó không
 * đánh đổi bằng một frame `resize` thừa mỗi lần mount. Đường font-tải-xong có
 * thật sự đổi số cột trên máy người dùng hay không thì phải đo trên cụm, ở dpr
 * thật, trên máy KHÔNG cài Cascadia.
 */

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Đủ để lượt bắn bắt buộc của `ResizeObserver` lúc `observe()` lắng hẳn. */
const SETTLE_MS = RESIZE_DEBOUNCE_MS * 6;

const BOX_W = 640;
const BOX_H = 320;

/** Tên family của webfont tự host — phải TRÙNG với `TERMINAL_FONT_FAMILY`. */
const FONT_FAMILY = 'DLPTerminalNF';

/** Hai font CỤC BỘ trong `TERMINAL_FONT_FAMILY` phải che đi — xem lý do 1 ở trên. */
const LOCAL_FALLBACKS = ['CaskaydiaCove Nerd Font Mono', 'Cascadia Mono'];

/** Cỡ chữ khởi tạo là 14 (`terminal-core.ts`); 24 đủ xa để số cột chắc chắn đổi. */
const FONT_SIZE_CHANGED = 24;

/**
 * `new URL(..., import.meta.url)` chứ không `import ... from '...?url'`: dạng
 * `?url` là cú pháp riêng của vite và KHÔNG có khai báo kiểu ở gói này, nên
 * `tsc --noEmit` đỏ (TS2307) dù test chạy được. Dạng URL là chuẩn ESM, vite vẫn
 * xử lý asset như thường, và typecheck không cần một file `.d.ts` chỉ để phục vụ
 * một dòng import.
 */
const fontUrl = new URL('./assets/dlp-terminal-nf.woff2', import.meta.url).href;

let fontData: ArrayBuffer;

function makeBox(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = `${BOX_W}px`;
  el.style.height = `${BOX_H}px`;
  document.body.appendChild(el);
  return el;
}

/** Bề rộng ký tự thật của một stack font, đo bằng canvas — độc lập với xterm. */
function advanceOf(fontStack: string): number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (ctx === null) {
    throw new Error('không lấy được canvas 2d context');
  }
  ctx.font = `14px ${fontStack}`;
  return ctx.measureText('M'.repeat(10)).width / 10;
}

/**
 * Che các font cục bộ để `TERMINAL_FONT_FAMILY` rơi xuống `monospace` chung cho
 * tới khi `DLPTerminalNF` được nạp.
 *
 * Cách làm: khai `@font-face` TRÙNG TÊN với font đã cài, trỏ vào nguồn hỏng. Một
 * khai báo `@font-face` đè font hệ thống cùng tên, và khi mọi nguồn của nó tải
 * hỏng thì họ font đó coi như KHÔNG TỒN TẠI ⇒ phép so khớp đi tiếp xuống mục kế.
 */
function shadowLocalFallbacks(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = LOCAL_FALLBACKS.map(
    (family) =>
      `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,AAAA) format('woff2');}`,
  ).join('\n');
  document.head.appendChild(style);
  return style;
}

describe('A5 — đo lại sau khi font tải xong', () => {
  let box: HTMLDivElement;
  let core: TerminalCore | null = null;
  let face: FontFace | null = null;
  let shadow: HTMLStyleElement | null = null;

  beforeAll(async () => {
    expect(TERMINAL_FONT_FAMILY).toContain(FONT_FAMILY);
    for (const family of LOCAL_FALLBACKS) {
      expect(TERMINAL_FONT_FAMILY).toContain(family);
    }
    fontData = await fetch(fontUrl).then((r) => r.arrayBuffer());
    expect(fontData.byteLength).toBeGreaterThan(1000);
  });

  beforeEach(() => {
    shadow = shadowLocalFallbacks();
    box = makeBox();
  });

  afterEach(() => {
    core?.dispose();
    core = null;
    box.remove();
    // BẮT BUỘC: `document.fonts` và `<head>` là trạng thái TOÀN CỤC của trang
    // test. Không gỡ thì ca sau chạy với font đã nạp sẵn, tiền đề "mở TRƯỚC khi
    // font có" sai, và ca đó xanh vì lý do khác hẳn thứ nó định gác.
    if (face !== null) {
      document.fonts.delete(face);
      face = null;
    }
    shadow?.remove();
    shadow = null;
  });

  /** Nạp webfont THẬT của gói vào trang, đúng như trình duyệt làm lúc chạy thật. */
  async function loadRealFont(): Promise<void> {
    const loaded = new FontFace(FONT_FAMILY, fontData);
    await loaded.load();
    document.fonts.add(loaded);
    face = loaded;
    await document.fonts.ready;
    await sleep(150);
  }

  function create(onResize: (size: TerminalDimensions) => void): TerminalCore {
    return createTerminalCore({ container: box, theme: 'dlp-dark', onData: () => {}, onResize });
  }

  it('đối chứng vendor: xterm KHÔNG tự đo lại khi webfont tải xong, và không API công khai nào ép được', async () => {
    // Terminal TRẦN (không qua `createTerminalCore`) để ca này đo ĐÚNG hành vi
    // vendor, không lẫn với addon/renderer của ta.
    const terminal = new Terminal({
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: 14,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(box);
    await sleep(250);

    const internals = terminal as unknown as {
      _core: {
        _renderService: { dimensions: { css: { cell: { width: number } } } };
        _charSizeService: { measure: () => void };
      };
    };
    const cellWidth = (): number => internals._core._renderService.dimensions.css.cell.width;

    const cellFallback = cellWidth();
    const colsFallback = fit.proposeDimensions()?.cols;

    await loadRealFont();

    // TIỀN ĐỀ của cả ca, đo bằng canvas chứ không qua xterm: webfont phải có bề
    // rộng ký tự KHÁC `monospace` chung. Nếu một ngày máy chạy CI có `monospace`
    // trùng metric với CaskaydiaCove thì ca này đỏ ngay ở đây với thông điệp rõ
    // ràng, thay vì xanh giả ở các assertion dưới.
    expect(advanceOf(`"${FONT_FAMILY}"`)).not.toBeCloseTo(advanceOf('monospace'), 2);

    // (1) Nạp font xong, KHÔNG làm gì ⇒ metric đứng yên. Đây là vế 2 của lỗi.
    expect(cellWidth()).toBe(cellFallback);

    // (2) Gán lại CÙNG giá trị option ⇒ vẫn đứng yên: xterm dedup theo giá trị,
    //     nên hai đường công khai duy nhất đều là no-op.
    terminal.options.fontFamily = TERMINAL_FONT_FAMILY;
    terminal.options.fontSize = 14;
    await sleep(150);
    expect(cellWidth()).toBe(cellFallback);

    // (3) API nội bộ ⇒ metric ĐỔI. Đây là cần câu bản vá đang dùng.
    internals._core._charSizeService.measure();
    await sleep(150);
    const cellReal = cellWidth();
    expect(cellReal).not.toBe(cellFallback);
    expect(fit.proposeDimensions()?.cols).not.toBe(colsFallback);

    // (4) Đối chứng dương cho (3): số vừa đo phải TRÙNG với một terminal mở SAU
    //     khi font đã có. Thiếu vế này thì (3) chỉ chứng minh "có gì đó đổi",
    //     chứ không chứng minh nó đổi thành ĐÚNG giá trị.
    const freshBox = makeBox();
    const fresh = new Terminal({
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: 14,
      allowProposedApi: true,
    });
    fresh.loadAddon(new FitAddon());
    fresh.open(freshBox);
    await sleep(250);
    const freshInternals = fresh as unknown as {
      _core: { _renderService: { dimensions: { css: { cell: { width: number } } } } };
    };
    expect(freshInternals._core._renderService.dimensions.css.cell.width).toBe(cellReal);

    fresh.dispose();
    freshBox.remove();
    terminal.dispose();
  });

  it('vế 1 — metric ô chữ đổi: measure() trả số MỚI nhưng KHÔNG phát resize', async () => {
    // Đây là đối chứng dương cho chính cái bug, và là ca duy nhất chứng minh
    // `measure()` nuốt một thay đổi CÓ THẬT. Cần câu là `options.fontSize`: đo
    // trên `@xterm/addon-fit@0.11.0`, `proposeDimensions()` chia kích thước hộp
    // cho `_renderService.dimensions.css.cell`, và đổi cỡ chữ là cách xác định
    // duy nhất đổi được đại lượng đó mà KHÔNG đụng cái hộp (nạp webfont thì
    // KHÔNG đổi — xem ca trên và khối lý do đầu file).
    const onResize = vi.fn<(size: TerminalDimensions) => void>();
    core = create(onResize);
    await sleep(SETTLE_MS);
    onResize.mockClear();

    const before = core.measure();

    core.terminal.options.fontSize = FONT_SIZE_CHANGED;
    await sleep(SETTLE_MS);

    const after = core.measure();

    // Tiền đề: thiếu vế này thì assertion dưới xanh vì hai số TRÙNG nhau chứ
    // không vì code đúng — đúng cái bẫy đã giấu lỗi này khỏi 7/7 lượt đo cụm.
    expect(after).not.toEqual(before);
    // Cái hộp KHÔNG đổi ⇒ ResizeObserver không có cớ bắn, tức không ai đỡ hộ.
    expect(box.clientWidth).toBe(BOX_W);
    expect(box.clientHeight).toBe(BOX_H);

    // ← LỖI: số đã đổi, terminal đã fit theo số mới, mà server không hề biết.
    expect(onResize).not.toHaveBeenCalled();
    await sleep(SETTLE_MS);
    expect(onResize).not.toHaveBeenCalled();
  });

  it('refitAfterFontLoad(): metric đổi ⇒ phát đúng MỘT lượt resize mang số mới', async () => {
    const onResize = vi.fn<(size: TerminalDimensions) => void>();
    core = create(onResize);
    await sleep(SETTLE_MS);
    onResize.mockClear();

    const before = core.measure();

    core.terminal.options.fontSize = FONT_SIZE_CHANGED;
    await sleep(SETTLE_MS);

    // ⛔ KHÔNG gọi `measure()` trước lời gọi này: `measure()` tự fit, nên nó sẽ
    // ăn mất chính thay đổi mà `refitAfterFontLoad()` phải phát hiện, và ca test
    // sẽ xanh-hoá-đỏ vì lý do sai.
    core.refitAfterFontLoad();

    const after: TerminalDimensions = { cols: core.terminal.cols, rows: core.terminal.rows };
    expect(after).not.toEqual(before);

    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(after);

    // RO có bắn kèm cũng không được phát trùng — cùng phép dedup theo giá trị mà
    // `fit()` khi đổi tab đã dựa vào.
    await sleep(SETTLE_MS);
    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it('refitAfterFontLoad(): metric KHÔNG đổi ⇒ KHÔNG phát resize nào', async () => {
    // Vế NGƯỢC, và là vế đắt: một bản vá "phát vô điều kiện sau khi font tải
    // xong" vẫn qua được ca trên, nhưng sẽ đốt một frame `resize` thừa ở MỌI lần
    // mount — mang đúng con số mà frame `init` vừa gửi xong. Mỗi frame control
    // thừa là một lần chạm rate-limit của G8 mà không mang tin gì.
    //
    // Chạy đúng đường thật: webfont tải xong nhưng metric không đổi. Đó chính là
    // trạng thái 7/7 lượt đo trên cụm, nên ca này gác đúng ca phổ biến nhất.
    const onResize = vi.fn<(size: TerminalDimensions) => void>();
    core = create(onResize);
    await sleep(SETTLE_MS);
    onResize.mockClear();

    const initSize = core.measure();
    await loadRealFont();
    core.refitAfterFontLoad();

    expect({ cols: core.terminal.cols, rows: core.terminal.rows }).toEqual(initSize);
    expect(onResize).not.toHaveBeenCalled();

    await sleep(SETTLE_MS);
    expect(onResize).not.toHaveBeenCalled();
  });

  it('sau dispose: refitAfterFontLoad() no-op im lặng', async () => {
    // Ca có thật: người dùng đóng tab trong lúc `waitForFonts()` còn đang chờ,
    // rồi promise mới resolve. Cùng lý do cờ `cancelled` tồn tại ở effect terminal.
    const onResize = vi.fn<(size: TerminalDimensions) => void>();
    const dead = create(onResize);
    await sleep(SETTLE_MS);
    dead.dispose();
    onResize.mockClear();

    expect(() => dead.refitAfterFontLoad()).not.toThrow();
    expect(onResize).not.toHaveBeenCalled();
  });

  it('container 0×0: refitAfterFontLoad() KHÔNG phát resize', async () => {
    // Tab giữ mounted nhưng `display:none` (contract §C5) trong lúc font tải xong.
    // Thiếu chốt này thì `clampDimension` kéo 0 lên 1 và một frame resize rộng
    // 1 CỘT đi thẳng lên `ioctl(TIOCSWINSZ)` của pod.
    box.style.width = '0px';
    box.style.height = '0px';
    const onResize = vi.fn<(size: TerminalDimensions) => void>();
    core = create(onResize);
    await sleep(SETTLE_MS);
    onResize.mockClear();

    await loadRealFont();
    expect(() => core!.refitAfterFontLoad()).not.toThrow();
    expect(onResize).not.toHaveBeenCalled();
  });
});
