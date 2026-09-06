/**
 * 13.H mục 28 — 0 vi phạm CSP mới, CÓ ĐỐI CHỨNG DƯƠNG.
 *
 * ══ Vì sao một phép kiểm CSP ngây thơ luôn xanh ═════════════════════════════
 *
 * Vi phạm CSP KHÔNG ném. Không có exception nào ở constructor, không promise
 * nào reject, `page.goto()` vẫn resolve bình thường. Trình duyệt chặn tài
 * nguyên rồi bắn sự kiện `securitypolicyviolation` BẤT ĐỒNG BỘ trên
 * `document`. Nghĩa là:
 *
 *   - một spec chỉ `goto()` rồi `expect(errors).toEqual([])` sẽ XANH trên một
 *     trang có đầy vi phạm, vì nó chưa từng đăng ký chỗ nghe nào;
 *   - đăng ký chỗ nghe SAU `goto()` cũng xanh, vì các vi phạm lúc tải trang đã
 *     bắn xong trước khi listener tồn tại. Đây là chỗ dễ sai nhất: mã TRÔNG
 *     như đang thu thập.
 *
 * Nên listener phải được cài bằng `addInitScript` (chạy trước mọi script của
 * trang, qua CDP nên không chịu CSP), và bản thân cái máy thu ĐÓ phải được
 * chứng minh là kêu được — `zero-violation-needs-negative-control`.
 *
 * Ba nguồn thu song song, vì không nguồn nào đủ một mình:
 *   1. sự kiện DOM `securitypolicyviolation` — chính xác nhất, có
 *      `effectiveDirective`, nhưng chỉ bắn trong document đã có listener.
 *   2. CDP `Log.entryAdded` — bắt cả vi phạm ở iframe/worker mà listener DOM
 *      của document cha không thấy.
 *   3. `page.on('console')` — lưới cuối; một số bản Chromium chỉ log.
 */

import type { CDPSession, Page, Response } from '@playwright/test';
import { expect, test } from './fixtures/api';
import { openScreen, resolvePath, settle } from './fixtures/nav';
import { SCREENS, roleSatisfies, screenLabel } from './routes';

type Violation = { source: 'dom' | 'cdp-log' | 'console'; directive: string; detail: string };

declare global {
  interface Window {
    __cspViolations?: { directive: string; blockedURI: string; sample: string }[];
    __cspPwned?: boolean;
  }
}

/**
 * Cài máy thu TRƯỚC khi trang có script nào chạy.
 *
 * `addInitScript` đi qua CDP `Page.addScriptToEvaluateOnNewDocument`, KHÔNG qua
 * thẻ `<script>` — nên chính nó không bị CSP chặn, và nó không cần nonce. Đó là
 * lý do máy thu không tự làm bẩn phép đo của mình.
 */
async function installCollector(page: Page): Promise<{ cdp: CDPSession; seen: Violation[] }> {
  const seen: Violation[] = [];

  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations?.push({
        directive: e.effectiveDirective || e.violatedDirective,
        blockedURI: e.blockedURI,
        sample: e.sample ?? '',
      });
    });
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Log.enable');
  // ⚠ Tên sự kiện PHẢI có tiền tố domain: 'Log.entryAdded', không phải
  // 'entryAdded'. Bản đầu viết thiếu tiền tố — TypeScript bắt được (CDPSession
  // không có sự kiện tên 'entryAdded'), nhưng nếu file này không được typecheck
  // thì listener chỉ đơn giản KHÔNG BAO GIỜ chạy: không lỗi, không cảnh báo, và
  // một trong ba nguồn thu im lặng biến mất khỏi phép đo.
  cdp.on('Log.entryAdded', ({ entry }) => {
    const text = entry.text ?? '';
    if (/content security policy/i.test(text)) {
      seen.push({ source: 'cdp-log', directive: guessDirective(text), detail: text.slice(0, 300) });
    }
  });

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error' && /content security policy/i.test(text)) {
      seen.push({ source: 'console', directive: guessDirective(text), detail: text.slice(0, 300) });
    }
  });

  return { cdp, seen };
}

function guessDirective(text: string): string {
  return /"([a-z-]+)"/.exec(text)?.[1] ?? /directive: '([^']+)'/.exec(text)?.[1] ?? 'unknown';
}

/** Gộp ba nguồn. Đọc sự kiện DOM ra khỏi trang ở thời điểm gọi. */
async function collect(page: Page, seen: Violation[]): Promise<Violation[]> {
  const dom = await page.evaluate(() => window.__cspViolations ?? []);
  return [
    ...dom.map((v): Violation => ({
      source: 'dom',
      directive: v.directive,
      detail: `${v.blockedURI} ${v.sample}`.trim(),
    })),
    ...seen,
  ];
}

// ══════════════════════════════════════════════════ ĐỐI CHỨNG DƯƠNG của máy thu

test.describe('đối chứng dương — máy thu CSP phải biết kêu', () => {
  /**
   * ⚠⚠ HAI PHÉP ĐO 2026-09-06 LẬT NGƯỢC ĐỐI CHỨNG DƯƠNG "HIỂN NHIÊN" ⚠⚠
   *
   * (1) `document.createElement('script')` + `appendChild`, không nonce, KHÔNG
   *     sinh vi phạm nào — và script đó CHẠY THẬT. Đúng định nghĩa của
   *     `'strict-dynamic'`: chỉ thị này cố ý TRUYỀN LÒNG TIN cho script được
   *     chèn bằng DOM API từ mã đã được tin (để bundler chèn chunk được).
   *
   * (2) Nghiêm trọng hơn cho harness: MỌI mã chạy qua `page.evaluate()` hay
   *     `page.setContent()` đều được Chromium MIỄN TRỪ CSP, vì chúng đi qua
   *     CDP `Runtime.evaluate` chứ không qua trình phân tích của trang. Đo
   *     được: `eval('1+1')` bên trong `page.evaluate` KHÔNG bị chặn dù
   *     `script-src` không hề có `'unsafe-eval'`; script inline do
   *     `page.setContent` chèn cũng không bị chặn.
   *
   * ⇒ KHÔNG THỂ tạo ra một vi phạm `script-src` từ phía harness bằng cách tiêm
   *   mã. Ai thử sẽ thấy 0 vi phạm rồi kết luận "máy thu hỏng" hoặc — tệ hơn —
   *   "trang này sạch". Cả hai đều sai.
   *
   * Thứ VẪN được thực thi bình thường là TẢI TÀI NGUYÊN (script src, img,
   * iframe, fetch): chúng đi qua tầng mạng, nơi CSP của document vẫn áp. Nên
   * đối chứng dương đúng cho `script-src` phải để CHÍNH TRANG tải một script,
   * bằng cách chèn thẻ vào HTML THẬT qua `page.route` — parser của trang phân
   * tích nó, và strict-dynamic không truyền lòng tin cho script do parser chèn.
   */
  test('script-src: script inline chèn vào HTML THẬT bị chặn', async ({ page }, testInfo) => {
    const { seen } = await installCollector(page);

    // Chèn thẻ script vào chính response HTML, giữ NGUYÊN header (nên giữ
    // nguyên cả CSP lẫn nonce của nó). Đây là hình dạng gần nhất với một XSS
    // lưu trữ thật: mã đến từ tài liệu, không từ công cụ điều khiển trình duyệt.
    await page.route('**/login', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      await route.fulfill({
        response,
        body: body.replace('</head>', '<script>window.__cspPwned = true;</script></head>'),
      });
    });

    await page.goto('/login');
    await settle(page);
    const after = await collect(page, seen);

    await testInfo.attach('csp-positive-control.json', {
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(after, null, 2)),
    });

    expect(
      after.length,
      'Chèn script inline không nonce vào HTML thật mà máy thu KHÔNG ghi nhận gì. ' +
        'Vậy thì mọi "0 vi phạm" ở các ô khác chỉ nói rằng ta không nghe, không ' +
        'phải rằng không có gì để nghe.',
    ).toBeGreaterThan(0);
    expect(after.some((v) => /script-src/.test(v.directive))).toBe(true);

    // Sự kiện đã bắn ≠ mã đã bị chặn.  còn undefined mới chứng minh
    // CSP đang CHẶN chứ không chỉ báo cáo.
    expect(
      await page.evaluate(() => window.__cspPwned),
      'Script inline ĐÃ CHẠY dù có sự kiện vi phạm — CSP chỉ đang báo cáo.',
    ).toBeUndefined();
  });

  test('img-src: ảnh origin khác bị chặn', async ({ page }) => {
    // Đối chứng dương thứ hai, trên một chỉ thị KHÁC. Tải tài nguyên đi qua
    // tầng mạng nên vẫn bị CSP chặn kể cả khi lệnh xuất phát từ page.evaluate —
    // đó là lý do ô này chạy được trong khi phép tiêm script thì không.
    const { seen } = await installCollector(page);
    await page.goto('/login');
    await settle(page);
    expect(await collect(page, seen)).toEqual([]);

    //  là TLD dành riêng: request KHÔNG rời khỏi máy kể cả khi CSP
    // hỏng (luật dự án: không gì rời khỏi máy này).
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onerror = () => resolve();
          img.onload = () => resolve();
          img.src = 'https://csp-doi-chung-duong.invalid/a.png';
          setTimeout(resolve, 2000);
        }),
    );
    await page.waitForTimeout(500);

    const after = await collect(page, seen);
    expect(after.length, 'ảnh origin khác KHÔNG bị ghi nhận').toBeGreaterThan(0);
    expect(after.some((v) => /img-src/.test(v.directive))).toBe(true);
  });

  test('iframe origin KHÁC bị chặn (D8: frame-src)', async ({ page }) => {
    const { seen } = await installCollector(page);
    await page.goto('/login');
    await settle(page);

    // `.invalid` là TLD dành riêng, không phân giải được — nên ngay cả khi CSP
    // hỏng, request này KHÔNG rời khỏi máy. CSP kiểm URL TRƯỚC khi fetch, nên
    // vi phạm vẫn bắn bình thường. (Luật dự án: không gì rời khỏi máy này.)
    await page.evaluate(() => {
      const f = document.createElement('iframe');
      f.src = 'https://csp-doi-chung-duong.invalid/';
      document.body.appendChild(f);
    });
    await page.waitForTimeout(500);

    const after = await collect(page, seen);
    expect(after.length, 'iframe origin khác KHÔNG bị chặn').toBeGreaterThan(0);
    // `frame-src` khi CSP có khai tường minh (D8), `default-src` khi chưa —
    // chấp nhận cả hai ở ô này; ô "CSP khai frame-src" bên dưới mới là chỗ
    // khẳng định D8 đã lên.
    expect(after.some((v) => /frame-src|default-src/.test(v.directive))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════ nonce trên response THẬT

test.describe('nonce', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('script khởi tạo theme mang ĐÚNG nonce của header CSP', async ({ page }) => {
    const res = await page.goto('/login');
    expect(res).not.toBeNull();
    const html = await (res as Response).text();

    const csp = (res as Response).headers()['content-security-policy'] ?? '';
    const headerNonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(headerNonce, `header CSP không có nonce: ${csp.slice(0, 160)}`).toBeTruthy();

    // ⚠ PHẢI đọc HTML THÔ, không đọc DOM. Trình duyệt CHE giá trị nonce:
    // `el.getAttribute('nonce')` trả chuỗi rỗng sau khi trang tải xong (nonce
    // hiding, chống rò rỉ qua CSS selector). Một spec kiểm bằng getAttribute sẽ
    // luôn thấy '' và hoặc đỏ oan, hoặc — tệ hơn — được nới thành "có thuộc
    // tính nonce là đủ", lúc đó nonce rỗng cũng qua.
    const inlineScripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
      .map((m) => ({ attrs: m[1] ?? '', body: m[2] ?? '' }))
      .filter((s) => !/\bsrc=/.test(s.attrs) && s.body.trim() !== '');
    expect(inlineScripts.length, 'không có script inline nào trong HTML').toBeGreaterThan(0);

    for (const { attrs, body } of inlineScripts) {
      const nonce = /\bnonce="([^"]*)"/.exec(attrs)?.[1];
      expect(
        nonce,
        `script inline KHÔNG có nonce — nó sẽ bị CSP chặn ở trình duyệt thật. ` +
          `Nội dung: ${body.trim().slice(0, 120)}`,
      ).toBe(headerNonce);
    }

    // Script khởi tạo theme (D2/C1) là script inline DUY NHẤT ta kiểm soát nội
    // dung, và là chỗ duy nhất quan sát được rằng nonce đi đúng đường: nó phải
    // đặt class trước paint, nên nó không thể là file ngoài.
    const themeScript = inlineScripts.find((s) => /dlp\.theme/.test(s.body));
    expect(
      themeScript,
      'không tìm thấy script khởi tạo theme (THEME_INIT_SCRIPT) trong HTML. ' +
        'Hoặc layout.tsx chưa nhúng nó, hoặc bản đang chạy cũ hơn 13.A.',
    ).toBeDefined();
  });

  test('CSP khai frame-src tường minh (D8)', async ({ page }) => {
    const res = await page.goto('/login');
    const csp = (res as Response).headers()['content-security-policy'] ?? '';
    // D8 chốt khai `frame-src 'self'` TƯỜNG MINH dù `default-src 'self'` đã phủ,
    // để quyết định đọc được từ chính header. Ô này đỏ nghĩa là bản đang chạy
    // cũ hơn commit D8 — một phép đo đúng về một cụm chưa deploy, không phải
    // một harness hỏng.
    expect(csp).toContain("frame-src 'self'");
  });
});

// ═════════════════════════════════════════════════════ quét mọi màn hình chốt

test.describe('0 vi phạm CSP trên màn hình chốt', () => {
  for (const screen of SCREENS) {
    test(`csp ${screenLabel(screen)}`, async ({ page, api, account }) => {
      test.skip(
        !roleSatisfies(account.role, screen.auth),
        `cần vai trò '${screen.auth}', tài khoản có '${account.role}'`,
      );
      // Màn hình anon PHẢI mở bằng jar rỗng: /login có phiên thì proxy.ts đá
      // về /me, và ta sẽ đo /me trong khi tên test vẫn ghi /login.
      if (screen.auth === 'anon') await page.context().clearCookies();

      const { seen } = await installCollector(page);
      const path = screen.auth === 'anon' ? screen.path : await resolvePath(api, screen);
      await openScreen(page, path, screen.auth);

      const found = await collect(page, seen);
      expect(
        found.map((v) => `${v.source}/${v.directive}: ${v.detail}`),
        `${found.length} vi phạm CSP trên ${path}`,
      ).toEqual([]);
    });
  }
});
