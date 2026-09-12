/**
 * 13.H mục 25 (nửa bàn phím) + mục 26 / D10 — đi hết luồng chính bằng Tab/Enter,
 * focus THẤY ĐƯỢC, và đường thoát khỏi terminal.
 *
 * ══ Vì sao file này tồn tại tách khỏi `a11y.spec.ts` ════════════════════════
 *
 * axe KHÔNG kiểm được cái nào trong ba thứ dưới đây, và điều đó đã được ghi
 * tường minh ở đầu `a11y.spec.ts`:
 *   - **thứ tự** duyệt Tab (axe chỉ thấy DOM tĩnh, không bấm phím);
 *   - **dấu focus có nhìn thấy được không** — `color-contrast` của axe chỉ so
 *     màu CHỮ với nền; một vòng focus `outline: none` đi qua axe SẠCH;
 *   - **bẫy focus có lối ra không** — `role="application"` của terminal là một
 *     bẫy focus HỢP LỆ theo ARIA; thứ biến nó thành lỗi a11y là việc KHÔNG có
 *     đường thoát, và không luật tĩnh nào thấy được điều đó.
 *
 * Nên "axe 0 lỗi serious/critical" và file này KHÔNG thay thế nhau: cái trước
 * là sàn cho cấu trúc tĩnh, cái sau là bằng chứng cho hành vi.
 *
 * ══ Ba nhóm ô, ba điều kiện chạy KHÁC NHAU ═════════════════════════════════
 *
 *   1. thứ tự Tab + focus thấy được  → chạy ở BẤT KỲ đâu app được phục vụ
 *      (kể cả `next start` cục bộ, không cần sandbox).
 *   2. đi luồng chính bằng Tab/Enter → như trên, cần đăng nhập + có nội dung.
 *   3. D10 (Esc trong terminal)      → cần một **phiên sandbox THẬT đang chạy**,
 *      tức cụm. Không có cụm thì các ô đó `skip` — và `E2E_REQUIRE_SESSION=1`
 *      biến mọi lượt skip đó thành ĐỎ, theo đúng khuôn `E2E_REQUIRE_ROLES` của
 *      `a11y.spec.ts`. Một suite skip sạch không phải một suite xanh.
 */

import type { APIRequestContext, ElementHandle, Page } from '@playwright/test';
import { expect, firstItemId, test } from './fixtures/api';
import { openScreen, resolvePath, settle } from './fixtures/nav';
import type { Screen } from './routes';

/**
 * Màn hình để đo thứ tự Tab + dấu focus.
 *
 * ⛔ Cố ý KHÔNG dùng cả 32 màn hình của `routes.ts`: mỗi điểm dừng Tab tốn HAI
 * ảnh chụp (xem `focusIndicatorChanges`), nên quét toàn bộ là đổi một phép đo
 * sắc nét lấy một suite chạy hàng chục phút.
 *
 * ── P16 §16.I mục 2: từ 4 lên 10, và cái giá của nó ─────────────────────────
 *
 * Bốn màn cũ phủ bốn hình dạng bố cục (form, lưới thẻ, danh sách, form cài
 * đặt). Sáu màn thêm không phải để cho đủ số: mỗi màn mang một hình dạng mà
 * bốn màn kia KHÔNG có.
 *
 * | thêm | hình dạng chưa được phủ |
 * |---|---|
 * | `/register` | form nhiều trường có xác nhận mật khẩu (16.B dựng mới) |
 * | `/lessons/:id` | **bắt buộc theo mục 2** — trang có KHOANG TERMINAL |
 * | `/labs` | lưới thẻ có bộ lọc |
 * | `/labs/:id` | **bắt buộc theo mục 2** — khoang lab, bố cục hai cột |
 * | `/problems` | bảng dữ liệu nhiều cột (16.C dựng mới) |
 * | `/paths` | danh sách lộ trình, thẻ lồng thẻ |
 *
 * Cái giá phải nói ra: ba ô × 10 màn thay vì × 4, và ô dấu-focus chụp tới 2×18
 * ảnh mỗi màn. Khối này chạy chậm hơn ~2,5 lần bản trước. Đó là phần đổi lấy
 * việc `/lessons/:id` và `/labs/:id` — hai màn phức tạp nhất, và là hai màn duy
 * nhất có bẫy focus THẬT (terminal) — cuối cùng cũng được đo.
 *
 * Hai màn `:id` phải đi qua `resolvePath` như mọi màn động khác. Thêm màn hình
 * thì thêm ở đây, và sàn dưới phải tăng theo — nếu không, rút danh sách xuống
 * một dòng vẫn cho "0 lỗi focus".
 */
const KEYBOARD_SCREENS: Screen[] = [
  { path: '/login', auth: 'anon' },
  { path: '/register', auth: 'anon' },
  { path: '/lessons', auth: 'user' },
  { path: '/lessons/:id', auth: 'user', idFrom: 'lessons.list' },
  { path: '/labs', auth: 'user' },
  { path: '/labs/:id', auth: 'user', idFrom: 'labs.list' },
  { path: '/paths', auth: 'user' },
  { path: '/problems', auth: 'user' },
  { path: '/me', auth: 'user' },
  { path: '/settings', auth: 'user' },
];
const MIN_KEYBOARD_SCREENS = 10;

/**
 * Hai màn mà §16.I mục 2 nêu ĐÍCH DANH.
 *
 * Tách khỏi `MIN_KEYBOARD_SCREENS` có chủ ý: một phép đếm ≥10 được thoả bởi mười
 * màn BẤT KỲ, kể cả mười trang tĩnh không màn nào có terminal — tức đúng thứ ô
 * AC dựng ra để bắt lại lọt qua. Đây là phép kiểm theo DANH TÍNH, không theo số
 * lượng (`pinned-baseline-test-companion`).
 */
const REQUIRED_KEYBOARD_PATHS = ['/labs/:id', '/lessons/:id'] as const;

/**
 * Trần số điểm dừng Tab kiểm mỗi màn. Nói ra chứ không giấu: đây là một phép đo
 * MẪU, không phải phép đo đầy đủ. Một trang có 60 điểm dừng thì ô này chỉ nói
 * về 18 điểm đầu — và câu đó phải nằm trong báo cáo, không nằm trong đầu người
 * viết test.
 */
const MAX_TAB_STOPS_CHECKED = 18;

/** D10 — cửa sổ Esc-Esc. Chép từ `packages/terminal/src/escape-focus.ts`. */
const ESCAPE_WINDOW_MS = 500;

/** Byte Escape đi vào PTY. Bằng chứng "phím thật vẫn tới nơi" của vế (a) D10. */
const ESC_BYTE = 0x1b;

// ══════════════════════════════════════════════════════════════════ tiện ích

type ActiveInfo = {
  /** Đường dẫn CSS ổn định — dùng làm DANH TÍNH để phát hiện bẫy focus. */
  path: string;
  tag: string;
  label: string;
  href: string | null;
  /** Nằm TRONG container terminal (`role="application"`) hay không. */
  inTerminal: boolean;
};

/**
 * Đọc phần tử đang có focus.
 *
 * Trả `null` khi focus rơi về `<body>` — nghĩa là chuỗi Tab đã đi hết vòng của
 * trang và sang thanh công cụ trình duyệt. Đó là một trạng thái HỢP LỆ, không
 * phải lỗi, nên nó phải phân biệt được với "có một phần tử đang focus".
 */
async function activeInfo(page: Page): Promise<ActiveInfo | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el === null || el === document.body || el === document.documentElement) {
      return null;
    }
    // Danh tính theo VỊ TRÍ trong cây, không theo text: hai nút "Mở" cạnh nhau
    // có cùng nhãn, và một phép so theo nhãn sẽ đọc "Tab đi tiếp" thành "Tab
    // đứng yên" — tức báo bẫy focus ở một trang hoàn toàn lành.
    const segments: string[] = [];
    for (let node: Element | null = el; node !== null; node = node.parentElement) {
      const parent: Element | null = node.parentElement;
      if (parent === null) {
        segments.unshift(node.tagName.toLowerCase());
        break;
      }
      const index = Array.prototype.indexOf.call(parent.children, node);
      segments.unshift(`${node.tagName.toLowerCase()}:${index}`);
    }
    return {
      path: segments.join('>'),
      tag: el.tagName.toLowerCase(),
      label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 60),
      href: el.getAttribute('href'),
      inTerminal: el.closest('[data-testid="dlp-terminal"]') !== null,
    };
  });
}

/** Handle tới phần tử đang focus, để đo hộp bao. `null` khi focus ở body. */
async function activeHandle(page: Page): Promise<ElementHandle<HTMLElement> | null> {
  const handle = await page.evaluateHandle(() => {
    const el = document.activeElement as HTMLElement | null;
    return el === null || el === document.body ? null : el;
  });
  const element = handle.asElement();
  return element === null ? null : (element as ElementHandle<HTMLElement>);
}

/**
 * Dấu focus có NHÌN THẤY ĐƯỢC không — đo bằng pixel, không bằng CSS.
 *
 * ⚠ Vì sao không đọc `getComputedStyle(el).outlineStyle`: dự án dùng Tailwind
 * `focus-visible:ring-2`, và `ring` là một `box-shadow`, không phải `outline`.
 * Một phép kiểm "outline khác none" sẽ ĐỎ trên toàn bộ cây dù mọi thứ đều đúng;
 * một phép kiểm "outline hoặc box-shadow khác rỗng" thì lại XANH cho một
 * `box-shadow` màu trong suốt. Cả hai đều đang đo tên thuộc tính, không đo thứ
 * người dùng thấy.
 *
 * Nên: chụp vùng quanh phần tử LÚC ĐANG FOCUS, blur, chụp lại CÙNG vùng đó, so
 * byte. Khác nhau ⇒ có gì đó đã thay đổi trên màn hình khi focus tới. Giống hệt
 * ⇒ focus tới mà màn hình không nói gì.
 *
 * Hộp bao được đo LÚC ĐANG FOCUS và dùng cho CẢ HAI ảnh, vì có phần tử đổi bố
 * cục khi focus (liên kết "Bỏ qua điều hướng" là `sr-only` cho tới khi được
 * focus). Đo hai lần hai hộp sẽ so hai vùng khác nhau và luôn "khác".
 *
 * `animations: 'disabled'` + `caret: 'hide'`: không có chúng, một `transition-
 * colors` đang chạy dở hoặc một con trỏ nhấp nháy trong ô input sẽ làm hai ảnh
 * khác nhau vì lý do chẳng liên quan gì tới focus — ô AC khi đó xanh vì nhiễu.
 */
async function focusIndicatorChanges(
  page: Page,
): Promise<'changed' | 'identical' | 'unmeasurable'> {
  const handle = await activeHandle(page);
  if (handle === null) {
    return 'unmeasurable';
  }
  const box = await handle.boundingBox();
  if (box === null || box.width === 0 || box.height === 0) {
    // Phần tử focus-được nhưng không có hộp (display:none qua Tab là không thể,
    // nhưng `width:0` thì có). Không đo được ≠ đạt — người gọi phải xử lý.
    return 'unmeasurable';
  }

  const viewport = page.viewportSize();
  const pad = 10;
  const left = Math.max(0, box.x - pad);
  const top = Math.max(0, box.y - pad);
  const right = Math.min(viewport?.width ?? box.x + box.width + pad, box.x + box.width + pad);
  const bottom = Math.min(viewport?.height ?? box.y + box.height + pad, box.y + box.height + pad);
  if (right - left < 2 || bottom - top < 2) {
    return 'unmeasurable';
  }
  const clip = { x: left, y: top, width: right - left, height: bottom - top };

  const focused = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(120);
  const blurred = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });

  return focused.equals(blurred) ? 'identical' : 'changed';
}

/** Chuột ra khỏi đường đi: hover cũng đổi pixel, và nó KHÔNG phải dấu focus. */
async function parkMouse(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
}

// ═══════════════════════════════════════════════════ cổng của chính danh sách

test('danh sách màn hình bàn phím không bị rút ngắn', () => {
  expect(KEYBOARD_SCREENS.length).toBeGreaterThanOrEqual(MIN_KEYBOARD_SCREENS);
  expect(new Set(KEYBOARD_SCREENS.map((s) => s.path)).size).toBe(KEYBOARD_SCREENS.length);

  // Vế DANH TÍNH — xem khối chú thích của `REQUIRED_KEYBOARD_PATHS`.
  const paths = new Set(KEYBOARD_SCREENS.map((s) => s.path));
  const missing = REQUIRED_KEYBOARD_PATHS.filter((p) => !paths.has(p));
  expect(
    missing,
    `§16.I mục 2 nêu đích danh ${REQUIRED_KEYBOARD_PATHS.join(' và ')} vì đó là hai ` +
      `màn duy nhất có khoang terminal, tức hai màn duy nhất có bẫy focus THẬT. ` +
      `Thiếu: ${missing.join(', ')}. Đếm đủ 10 màn tĩnh không thay được điều đó.`,
  ).toEqual([]);

  // Mỗi màn động phải có nguồn id, nếu không `resolvePath` ném GIỮA lượt chạy
  // chứ không ở đây — và một lỗi cấu hình phải đỏ ở ô rẻ nhất.
  for (const screen of KEYBOARD_SCREENS) {
    if (screen.path.includes(':')) {
      expect(screen.idFrom, `${screen.path} có đoạn động nhưng thiếu idFrom`).toBeDefined();
    }
  }
});

// ════════════════════════════════════════════════════ thứ tự Tab & dấu focus

test.describe('bàn phím — thứ tự và dấu focus', () => {
  for (const screen of KEYBOARD_SCREENS) {
    test(`không có tabindex dương trên ${screen.path}`, async ({ api, page }) => {
      const path = await resolvePath(api, screen);
      if (screen.auth === 'anon') await page.context().clearCookies();
      await openScreen(page, path, screen.auth);

      // `tabindex` dương là cách DUY NHẤT làm thứ tự Tab lệch khỏi thứ tự tài
      // liệu. Kiểm nó là kiểm nguyên nhân, không phải kiểm triệu chứng — và nó
      // rẻ, xác định, không phụ thuộc render.
      const positives = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[tabindex]'))
          .filter((el) => Number(el.getAttribute('tabindex')) > 0)
          .map((el) => `${el.tagName.toLowerCase()}[tabindex="${el.getAttribute('tabindex')}"]`),
      );
      expect(
        positives,
        `tabindex dương làm thứ tự Tab lệch khỏi thứ tự đọc của trang ${screen.path}`,
      ).toEqual([]);
    });

    test(`mọi điểm dừng Tab trên ${screen.path} có dấu focus nhìn thấy được`, async ({
      api,
      page,
    }) => {
      const path = await resolvePath(api, screen);
      if (screen.auth === 'anon') await page.context().clearCookies();
      await openScreen(page, path, screen.auth);
      await parkMouse(page);

      const invisible: string[] = [];
      const unmeasurable: string[] = [];
      let checked = 0;

      for (let i = 0; i < MAX_TAB_STOPS_CHECKED; i += 1) {
        await page.keyboard.press('Tab');
        const info = await activeInfo(page);
        if (info === null) {
          // Đã ra khỏi vòng của trang (thanh công cụ trình duyệt). Dừng.
          break;
        }
        const verdict = await focusIndicatorChanges(page);
        if (verdict === 'identical') {
          invisible.push(`${info.tag} «${info.label}» (${info.path})`);
        } else if (verdict === 'unmeasurable') {
          unmeasurable.push(`${info.tag} «${info.label}»`);
        } else {
          checked += 1;
        }
        // `blur()` trong `focusIndicatorChanges` đưa focus về body, nên lần Tab
        // kế tiếp sẽ bắt đầu lại từ ĐẦU tài liệu chứ không đi tiếp. Đặt lại
        // focus vào đúng phần tử vừa xét để chuỗi Tab tiếp tục đúng chỗ.
        await page.evaluate((path: string) => {
          const segments = path.split('>');
          let node: Element | null = document.documentElement;
          for (const segment of segments.slice(1)) {
            const index = Number(segment.split(':')[1]);
            node = node?.children.item(index) ?? null;
            if (node === null) break;
          }
          (node as HTMLElement | null)?.focus();
        }, info.path);
      }

      // Tiền đề của chính phép đo: đã thật sự có điểm dừng nào được đo chưa.
      // Không có dòng này thì một trang mà Tab không đi tới đâu (hoặc một lỗi
      // trong helper) đọc ra y hệt "mọi điểm dừng đều đạt".
      expect(
        checked + invisible.length,
        `không đo được điểm dừng Tab nào trên ${screen.path} — hoặc trang không có ` +
          `phần tử focus-được nào, hoặc helper hỏng. "0 lỗi" ở đây không chứng minh gì.`,
      ).toBeGreaterThan(0);

      expect(
        invisible,
        `${invisible.length} điểm dừng Tab trên ${screen.path} KHÔNG đổi gì trên màn hình ` +
          `khi nhận focus — người dùng bàn phím không biết mình đang ở đâu. ` +
          `(đo mẫu ${MAX_TAB_STOPS_CHECKED} điểm đầu; ${unmeasurable.length} điểm không đo được: ` +
          `${unmeasurable.join(', ') || 'không có'})`,
      ).toEqual([]);
    });

    test(`không có bẫy bàn phím trên ${screen.path}`, async ({ api, page }) => {
      const path = await resolvePath(api, screen);
      if (screen.auth === 'anon') await page.context().clearCookies();
      await openScreen(page, path, screen.auth);
      await parkMouse(page);

      const visited: string[] = [];
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press('Tab');
        const info = await activeInfo(page);
        if (info === null) break;
        // Bẫy = Tab hai lần liên tiếp mà focus không nhúc nhích. Đây là hình
        // dạng THẬT của một bẫy (dialog tự bắt lại focus, widget nuốt Tab), và
        // nó phân biệt được với vòng lặp hợp lệ khi Tab quay về đầu trang.
        const previous = visited[visited.length - 1];
        expect(
          info.path,
          `Tab không rời khỏi ${info.tag} «${info.label}» trên ${screen.path} — bẫy bàn phím.`,
        ).not.toBe(previous);
        visited.push(info.path);
      }
      expect(visited.length, `Tab không tới được phần tử nào trên ${screen.path}`).toBeGreaterThan(
        0,
      );
    });
  }

  /**
   * Đối chứng dương của `focusIndicatorChanges`.
   *
   * Không có ô này, "0 điểm dừng nào thiếu dấu focus" ở trên có thể chỉ nghĩa
   * là hai ảnh chụp LUÔN khác nhau vì một lý do nào khác (con trỏ nhấp nháy,
   * animation, ảnh lazy vừa tải). Ở đây ta CỐ Ý tắt mọi dấu focus rồi đòi phép
   * kiểm phải nói `identical` — tức chứng minh nó biết kêu.
   *
   * Quy tắc CSS được chèn qua `addStyleTag`. CSP của sản phẩm cho phép
   * `style-src 'self' 'unsafe-inline'`, nên đây KHÔNG phải một chỗ nới lỏng
   * bảo mật để test chạy — nó là hành vi sản phẩm sẵn có.
   */
  test('đối chứng dương — tắt hết dấu focus thì phép kiểm PHẢI báo "identical"', async ({
    page,
  }) => {
    await page.context().clearCookies();
    await openScreen(page, '/login', 'anon');
    await parkMouse(page);

    await page.addStyleTag({
      content: `*, *::before, *::after {
        outline: none !important;
        box-shadow: none !important;
        border-color: inherit !important;
        background-image: none !important;
      }`,
    });

    // Ô input của form đăng nhập: có border, có ring khi focus — tức là một
    // phần tử mà phép kiểm PHẢI thấy "changed" ở trạng thái bình thường.
    await page.locator('input[type="email"]').focus();
    const verdict = await focusIndicatorChanges(page);

    expect(
      verdict,
      'Đã tắt outline + box-shadow toàn trang mà phép kiểm vẫn thấy focus "thay đổi ' +
        'màn hình". Vậy nó đang đo một thứ khác (animation? caret? ảnh vừa tải?), ' +
        'và mọi ô "focus thấy được" ở trên không chứng minh gì.',
    ).toBe('identical');
  });
});

// ══════════════════════════════════════════════ đi luồng chính bằng Tab/Enter

test.describe('bàn phím — đi hết luồng chính', () => {
  test('liên kết "Bỏ qua điều hướng" là điểm dừng Tab đầu tiên và Enter đưa focus vào <main>', async ({
    page,
  }) => {
    await openScreen(page, '/lessons', 'user');
    await parkMouse(page);

    await page.keyboard.press('Tab');
    const first = await activeInfo(page);
    expect(
      first?.label,
      'điểm dừng Tab đầu tiên không phải liên kết bỏ qua điều hướng — người dùng bàn ' +
        'phím phải đi qua toàn bộ thanh điều hướng ở MỌI trang trước khi tới nội dung.',
    ).toContain('Bỏ qua điều hướng');
    expect(first?.href).toBe('#noi-dung');

    // Vế thứ hai, và là vế hay bị bỏ: một liên kết bỏ-qua trỏ đúng chỗ nhưng
    // đích không nhận được focus (thiếu `tabIndex={-1}` trên `<main>`) thì
    // người dùng bấm Enter, thanh cuộn nhảy, mà focus VẪN ở thanh điều hướng —
    // lần Tab kế tiếp lại quay về menu. Hỏng đúng theo kiểu trông như đã chạy.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const landed = await page.evaluate(() => document.activeElement?.id ?? '');
    expect(
      landed,
      'Enter trên liên kết bỏ-qua không đưa focus vào <main id="noi-dung">. ' +
        'Nhiều khả năng <main> thiếu tabIndex={-1}.',
    ).toBe('noi-dung');
  });

  /**
   * Sáu mục điều hướng chính (`components/shell/nav.ts` PRIMARY_NAV).
   *
   * Chép tay ở đây chứ không import: `nav.ts` nằm trong `src/` và là mã SẢN
   * PHẨM do lane khác sở hữu. Nếu spec import chính hằng của sản phẩm thì một
   * lần xoá nhầm mục "Quiz" khỏi `PRIMARY_NAV` sẽ làm spec quét ít hơn mà vẫn
   * xanh — cùng lớp lỗi với "để cảnh tự khai báo chính nó" ở `routes.ts`.
   */
  const PRIMARY_NAV: { label: string; path: string }[] = [
    { label: 'Bài học', path: '/lessons' },
    { label: 'Lab', path: '/labs' },
    { label: 'Playground', path: '/playgrounds' },
    { label: 'Lộ trình', path: '/paths' },
    { label: 'Quiz', path: '/quiz' },
    { label: 'Của tôi', path: '/me' },
  ];

  for (const item of PRIMARY_NAV) {
    test(`điều hướng tới ${item.path} chỉ bằng bàn phím`, async ({ page }) => {
      await openScreen(page, '/me', 'user');
      await parkMouse(page);

      const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
      const link = nav.getByRole('link', { name: item.label, exact: true });
      await expect(link, `không thấy mục "${item.label}" trong điều hướng chính`).toBeVisible();

      // Tab tới ĐÚNG mục đó thay vì `.click()`: cả điểm của ô này là chứng minh
      // mục đến được BẰNG BÀN PHÍM. `.focus()` rồi Enter cũng bỏ qua đúng thứ
      // cần đo (nó có nằm trong vòng Tab không).
      let reached = false;
      for (let i = 0; i < 30 && !reached; i += 1) {
        await page.keyboard.press('Tab');
        const info = await activeInfo(page);
        if (info === null) break;
        reached = info.href === item.path;
      }
      expect(
        reached,
        `Tab 30 lần từ đầu /me vẫn không tới được liên kết ${item.path}. Mục điều ` +
          `hướng nằm ngoài vòng Tab (hoặc bị che sau một phần tử nuốt phím).`,
      ).toBe(true);

      await page.keyboard.press('Enter');
      await page.waitForURL(`**${item.path}`, { timeout: 20_000 });
      expect(new URL(page.url()).pathname).toBe(item.path);
    });
  }

  test('ô tìm kiếm chỉ đưa control đang hiện vào vòng Tab khi mở và đóng', async ({ page }) => {
    await openScreen(page, '/lessons', 'user');
    await parkMouse(page);
    const search = page.getByRole('search');
    const opener = search.getByRole('button', { name: 'Mở ô tìm kiếm', exact: true });
    const close = search.getByRole('button', { name: 'Đóng ô tìm kiếm', exact: true });
    await expect(opener).toBeVisible();
    await expect(close).toHaveCount(0);
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab');
      if ((await activeInfo(page))?.label === 'Mở ô tìm kiếm') break;
    }
    await expect(opener).toBeFocused();
    await page.keyboard.press('Enter');
    const input = search.getByRole('textbox', { name: 'Ô nhập từ khoá', exact: true });
    await expect(input).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(input).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(opener).toBeFocused();
    await expect(close).toHaveCount(0);
    await page.keyboard.press('Tab');
    const next = await activeInfo(page);
    expect(next).not.toBeNull();
    expect(next?.label).not.toMatch(/Đóng ô tìm kiếm|Ô nhập từ khoá/);
  });

  test('mở bài học đầu tiên từ /lessons chỉ bằng bàn phím', async ({ page }) => {
    await openScreen(page, '/lessons', 'user');

    /*
      Chờ THẺ BÀI HỌC xuất hiện trước khi bắt đầu gõ Tab, và tách hai nguyên
      nhân ra khỏi nhau.

      `openScreen` chỉ khẳng định trang có >20 ký tự text — mà tiêu đề "Bài học"
      cộng câu mô tả đã vượt ngưỡng đó TRONG KHI lưới còn là skeleton: danh mục
      nạp bằng tRPC ở client, `CatalogGridSkeleton` không mang chữ nào. Không có
      dòng chờ này, một lượt chạy chậm hơn `settle()` sẽ rơi vào nhánh "Tab 40
      lần không tới được thẻ nào" — thông báo đó đổ lỗi cho khả năng focus của
      thẻ, trong khi sự thật là dữ liệu chưa về. Chờ ở đây làm ba trường hợp
      tách hẳn: chưa kịp tải (đỏ ở dòng này, nói đúng chuyện), danh mục rỗng
      (cũng đỏ ở đây), thẻ không focus-được (đỏ ở vòng Tab bên dưới).
    */
    const anyCard = page.locator('a[href^="/lessons/"]').first();
    await expect(
      anyCard,
      'không có thẻ bài học nào trên /lessons sau khi trang lặng. Danh mục rỗng ' +
        '(nội dung nạp từ image) hoặc truy vấn danh mục hỏng — chưa phải chuyện bàn phím.',
    ).toBeVisible({ timeout: 30_000 });

    await parkMouse(page);

    let target: string | null = null;
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      const info = await activeInfo(page);
      if (info === null) break;
      if (info.href !== null && /^\/lessons\/[^/]+$/.test(info.href)) {
        target = info.href;
        break;
      }
    }
    expect(
      target,
      'Tab 40 lần trên /lessons không tới được thẻ bài học nào. Danh mục rỗng, hay ' +
        'thẻ bài học không phải phần tử focus-được (một `<div onClick>` chẳng hạn)?',
    ).not.toBeNull();

    await page.keyboard.press('Enter');
    await page.waitForURL(`**${target}`, { timeout: 30_000 });
    await settle(page);
    expect(new URL(page.url()).pathname).toBe(target);
  });
});

// ═══════════════════════════════════════════════════ D10 — Esc trong terminal

test.describe('D10 — thoát terminal bằng Esc Esc', () => {
  test.afterEach(async ({ page }) => {
    // Only end the session this test opened. Leaving it alive consumes a real
    // sandbox slot and makes a later test depend on this test's cleanup.
    const end = page.getByRole('button', { name: 'Kết thúc phiên', exact: true });
    if (await end.isVisible()) {
      await end.press('Enter');
      await expect(end).toBeHidden({ timeout: 60_000 });
    }
  });
  /**
   * ⚠⚠ TIỀN ĐỀ CỦA TOÀN BỘ NHÓM NÀY — đọc trước khi tin bất kỳ ô nào bên dưới.
   *
   * `escape-focus.ts` so `event.timeStamp` của hai lần nhấn. Với một
   * `new KeyboardEvent('keydown', …)` do script dựng, `timeStamp` là **thời
   * điểm KHỞI TẠO đối tượng**, không phải thời điểm phát — nên hai sự kiện tổng
   * hợp dựng cách nhau 600ms vẫn có thể mang hiệu số ~0 nếu chúng được dựng gần
   * nhau, và `isTrusted` của chúng là `false`. Một spec dùng `dispatchEvent`
   * KHÔNG kiểm được ngưỡng 500ms: nó chỉ kiểm chính con số nó vừa bịa.
   *
   * `page.keyboard.press()` thì khác — nó đi qua CDP `Input.dispatchKeyEvent`,
   * tức tầng input THẬT của trình duyệt: `isTrusted === true` và `timeStamp`
   * lấy từ đồng hồ của lần nhấn.
   *
   * Ô này KHẲNG ĐỊNH điều đó thay vì giả định nó. Nếu Chromium/Playwright đổi
   * hành vi, ô này đỏ với đúng lý do — thay vì để ô ">500ms" bên dưới xanh vĩnh
   * viễn vì hai timeStamp luôn bằng nhau (một assertion không bao giờ đỏ được
   * là một ô trang trí).
   */
  test('tiền đề: phím do Playwright gõ là phím THẬT, và timeStamp của nó đo được', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __escStamps: { t: number; trusted: boolean }[] }).__escStamps = [];
      document.addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'Escape') {
            (
              window as unknown as { __escStamps: { t: number; trusted: boolean }[] }
            ).__escStamps.push({ t: e.timeStamp, trusted: e.isTrusted });
          }
        },
        true,
      );
    });

    await page.context().clearCookies();
    await openScreen(page, '/login', 'anon');

    // Cặp 1: hai lần nhấn liền nhau ⇒ PHẢI nằm trong cửa sổ 500ms.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    // Cặp 2: cách nhau 700ms ⇒ PHẢI ra ngoài cửa sổ.
    await page.waitForTimeout(700);
    await page.keyboard.press('Escape');

    const stamps = await page.evaluate(
      () => (window as unknown as { __escStamps: { t: number; trusted: boolean }[] }).__escStamps,
    );

    expect(stamps.length, 'listener pha capture không thấy phím Escape nào').toBe(3);
    expect(
      stamps.every((s) => s.trusted),
      'phím do Playwright gõ KHÔNG được đánh dấu isTrusted — nó không đi qua tầng ' +
        'input thật, và mọi kết luận về ngưỡng thời gian bên dưới đều vô nghĩa.',
    ).toBe(true);

    const fast = stamps[1]!.t - stamps[0]!.t;
    const slow = stamps[2]!.t - stamps[1]!.t;
    expect(
      fast,
      `hai lần nhấn liền nhau cách ${fast}ms — không nằm trong cửa sổ D10`,
    ).toBeLessThanOrEqual(ESCAPE_WINDOW_MS);
    expect(
      slow,
      `hai lần nhấn cách nhau 700ms thật nhưng timeStamp chỉ chênh ${slow}ms. ` +
        `Ngưỡng ${ESCAPE_WINDOW_MS}ms KHÔNG kiểm được ở tầng trình duyệt bằng cách này.`,
    ).toBeGreaterThan(ESCAPE_WINDOW_MS);
  });

  /**
   * Mở một phiên sandbox THẬT trên `/playgrounds/:id`.
   *
   * Vì sao playground chứ không phải lesson: playground là trình học duy nhất
   * mà terminal là toàn bộ nội dung, nên không có khoang thứ hai nào cạnh tranh
   * focus và "rời khỏi terminal" có một nghĩa duy nhất.
   *
   * Trả `null` khi không mở được phiên (không có orchestrator — chạy cục bộ
   * bằng `next start` là đúng cảnh này). Người gọi phải `skip` tường minh, và
   * `E2E_REQUIRE_SESSION=1` biến lượt skip đó thành đỏ.
   */
  async function openTerminal(page: Page, api: APIRequestContext): Promise<'ok' | 'no-session'> {
    const id = await firstItemId(api, 'playgrounds.list');
    if (id === null) {
      throw new Error('playgrounds.list trả 0 mục — không có sân chơi nào để mở terminal.');
    }
    await openScreen(page, `/playgrounds/${encodeURIComponent(id)}`, 'user');

    const start = page.getByRole('button', { name: 'Bắt đầu' });
    await expect(
      start,
      'không thấy nút "Bắt đầu" — trang playground đã đổi hình dạng?',
    ).toBeVisible();
    await start.press('Enter');

    const terminal = page.getByTestId('dlp-terminal');
    try {
      await terminal.waitFor({ state: 'visible', timeout: 120_000 });
    } catch {
      return 'no-session';
    }
    // xterm dựng `<textarea>` nội bộ SAU khi container xuất hiện. Không chờ nó
    // thì phím Escape đi vào một container chưa có ai nghe, và ô sẽ đỏ vì lý do
    // sai ("Esc không tới PTY" trong khi PTY chưa từng được nối).
    await terminal.locator('textarea').first().waitFor({ state: 'attached', timeout: 30_000 });
    // A textarea also exists while the WebSocket is connecting or rejected.
    // The READY control frame is the observable proof of the real gateway
    // handshake; the slow Esc case must not pass on a disconnected terminal.
    await expect(
      page.locator('[aria-live="polite"]').getByText('Sandbox sẵn sàng', { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    return 'ok';
  }

  function requireSession(): boolean {
    return process.env.E2E_REQUIRE_SESSION === '1';
  }

  test('Esc ĐƠN vẫn tới PTY, và Esc Esc rời khỏi terminal', async ({ page, api }, testInfo) => {
    test.setTimeout(240_000);

    // Bắt frame WebSocket TRƯỚC khi phiên mở. Đây là bằng chứng duy nhất không
    // giả được cho vế (a) của D10: nếu detector nuốt phím thì xterm không chạy
    // `_keyDown`, `onData` không bắn, và không byte nào đi qua dây.
    // (`terminal-escape.browser.test.tsx` khẳng định đúng điều này ở tầng unit
    // bằng một socket giả; ở đây là dây thật.)
    const sentEscapes: number[] = [];
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => {
        const payload = frame.payload;
        if (typeof payload === 'string') return;
        for (const byte of payload) {
          if (byte === ESC_BYTE) sentEscapes.push(Date.now());
        }
      });
    });

    const opened = await openTerminal(page, api);
    test.skip(
      opened === 'no-session' && !requireSession(),
      'không mở được phiên sandbox (cần cụm có orchestrator + gateway). ' +
        'Đặt E2E_REQUIRE_SESSION=1 ở lượt nghiệm thu để lượt skip này thành lỗi.',
    );
    expect(opened, 'E2E_REQUIRE_SESSION=1 nhưng phiên sandbox không mở được').toBe('ok');

    const terminal = page.getByTestId('dlp-terminal');

    /*
      ── Vế (c) của D10: container tự nói ra đường thoát ──────────────────────

      Gộp vào ô này chứ không tách ô riêng, vì mỗi ô riêng là thêm MỘT phiên
      sandbox thật: cụm lab có trần ~20 pod (P12) và suite chạy `workers: 1`,
      nên ba phiên nối tiếp chỉ để khẳng định ba thuộc tính tĩnh là trả giá
      bằng vài phút mỗi lượt chạy mà không mua thêm phép đo nào.

      Vì sao ba thứ này KHÔNG được để axe gác hộ: `role="application"` tắt chế
      độ duyệt của trình đọc màn hình. Một container `application` thiếu tên,
      thiếu `tabIndex`, hoặc có tên nhưng KHÔNG nói cách ra, vẫn qua mọi luật
      tĩnh — vì theo ARIA nó hợp lệ. Thứ biến nó thành lỗi là ngữ cảnh, và
      ngữ cảnh thì phải khẳng định bằng tay.
    */
    const surface = await terminal.evaluate((el) => ({
      role: el.getAttribute('role'),
      tabIndex: el.getAttribute('tabindex'),
      ariaLabel: el.getAttribute('aria-label') ?? '',
    }));
    expect(surface.role, 'container terminal thiếu role="application" (D10)').toBe('application');
    expect(
      surface.tabIndex,
      'container terminal không có tabindex="0" — nó nằm ngoài vòng Tab, nên người ' +
        'dùng bàn phím không vào được terminal ngay cả khi mọi thứ khác đúng.',
    ).toBe('0');
    // Khớp Ý (có nhắc Esc), không khớp CHUỖI. Một phép so bằng nguyên văn sẽ
    // đỏ mỗi lần ai đó sửa câu chữ, và cái sửa đó không phải hồi quy — trong
    // khi thứ D10 thật sự đòi là nhãn PHẢI nêu được đường ra.
    expect(
      surface.ariaLabel,
      `aria-label của terminal («${surface.ariaLabel}») không nhắc tới Esc. ` +
        `role="application" tắt chế độ duyệt, nên câu đầu tiên người dùng nghe ` +
        `phải nói được cách thoát — nếu không, terminal là một bẫy đối với họ.`,
    ).toMatch(/esc/i);

    // Gợi ý nhìn thấy được (D10: "khi terminal có focus hiện gợi ý"). Trong bản
    // dựng hiện tại dòng này LUÔN hiện và chỉ đậm lên khi focus — cố ý, vì một
    // dòng chữ nhảy ra lúc focus sẽ đổi chiều cao khoang và bắt xterm fit lại.
    // Nên ô này khẳng định "có gợi ý", không khẳng định "gợi ý chỉ hiện khi focus".
    await expect(
      page.getByText(/Esc\s*Esc\s*để rời khỏi terminal/i),
      'không thấy gợi ý "Esc Esc để rời khỏi terminal" cạnh terminal — người dùng ' +
        'chuột/bàn phím không có cách nào đoán ra cử chỉ này.',
    ).toBeVisible();

    await terminal.locator('textarea').first().focus();
    expect((await activeInfo(page))?.inTerminal, 'focus không vào được terminal').toBe(true);

    // ── Vế (a): Esc ĐƠN ─────────────────────────────────────────────────────
    const before = sentEscapes.length;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    expect(
      sentEscapes.length - before,
      'Nhấn Esc một lần mà KHÔNG có byte 0x1b nào đi vào WebSocket. Detector D10 ' +
        'đang nuốt phím Escape — vim sẽ không rời được insert mode.',
    ).toBeGreaterThan(0);
    expect(
      (await activeInfo(page))?.inTerminal,
      'Esc ĐƠN đã đá focus ra khỏi terminal. D10 chốt một lần Esc là phím của ' +
        'terminal, không phải cử chỉ rời đi.',
    ).toBe(true);

    // ── Vế (b): Esc Esc nhanh ───────────────────────────────────────────────
    // Chờ qua cửa sổ để lần Esc ở trên không ghép cặp với lần đầu của cặp mới.
    await page.waitForTimeout(ESCAPE_WINDOW_MS + 200);
    const beforePair = sentEscapes.length;
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    expect(
      (await activeInfo(page))?.inTerminal ?? false,
      'Esc Esc nhanh KHÔNG đưa focus ra khỏi terminal. `role="application"` mà ' +
        'không có lối ra là một bẫy focus — nặng hơn lỗi a11y mà nó định chữa.',
    ).toBe(false);
    expect(
      sentEscapes.length - beforePair,
      'D10 chốt CẢ HAI byte Esc vẫn được thả cho PTY (một \\x1b thừa là vô hại ở ' +
        'mọi TUI, còn một nhánh code có quyền huỷ sự kiện thì sớm muộn sẽ huỷ nhầm).',
    ).toBeGreaterThanOrEqual(2);
    await testInfo.attach('terminal-escape-evidence.json', {
      contentType: 'application/json',
      body: Buffer.from(
        JSON.stringify(
          {
            realGatewayReady: true,
            singleEscapeBytes: beforePair - before,
            fastPairEscapeBytes: sentEscapes.length - beforePair,
            focusOutsideTerminal: !((await activeInfo(page))?.inTerminal ?? false),
            escapeWindowMs: ESCAPE_WINDOW_MS,
          },
          null,
          2,
        ),
      ),
    });
    await page.screenshot({ path: testInfo.outputPath('terminal-escape.png') });
  });

  test(`Esc … hơn ${ESCAPE_WINDOW_MS}ms … Esc thì KHÔNG rời terminal`, async ({ page, api }) => {
    test.setTimeout(240_000);

    const opened = await openTerminal(page, api);
    test.skip(
      opened === 'no-session' && !requireSession(),
      'không mở được phiên sandbox (cần cụm). Đặt E2E_REQUIRE_SESSION=1 ở lượt nghiệm thu.',
    );
    expect(opened, 'E2E_REQUIRE_SESSION=1 nhưng phiên sandbox không mở được').toBe('ok');

    const terminal = page.getByTestId('dlp-terminal');
    await terminal.locator('textarea').first().focus();
    expect((await activeInfo(page))?.inTerminal).toBe(true);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(ESCAPE_WINDOW_MS + 200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    expect(
      (await activeInfo(page))?.inTerminal,
      `Hai lần Esc cách nhau hơn ${ESCAPE_WINDOW_MS}ms vẫn rời terminal. Cửa sổ D10 ` +
        `không được thực thi — người đang gõ vim sẽ bị đá ra khỏi terminal ở lần Esc ` +
        `thứ hai bất kỳ, bao lâu sau cũng vậy.`,
    ).toBe(true);
  });
});
