/**
 * 13.H mục 25 — axe trên MỌI màn hình chốt (D12), 0 lỗi serious/critical.
 *
 * ══ axe KHÔNG kiểm những gì (đọc trước khi coi ô này là "a11y đã xong") ══════
 *
 * 1. ⚠ **KHÔNG có luật contrast cho VIỀN, icon, hay bất kỳ đồ hoạ phi văn bản
 *    nào.** `color-contrast` của axe chỉ so màu CHỮ với nền phía sau chữ. Một
 *    ô input viền `#e5e5e5` trên nền trắng (1.2:1, WCAG 1.4.11 đòi 3:1) đi qua
 *    axe SẠCH. Vòng focus mờ, đường kẻ bảng, biểu tượng trạng thái chỉ khác
 *    nhau bằng màu — axe không thấy cái nào. Ô AC "contrast AA" của 13.H CHỈ
 *    được đóng một phần bởi test này; phần còn lại là mắt người, và
 *    `docs/design-system.md` phải nói ra điều đó.
 * 2. Không kiểm thứ tự đọc, nhãn có NGHĨA hay không ("nhấn vào đây" qua sạch),
 *    hay việc bẫy focus có lối ra — `keyboard.spec.ts` lo phần đó.
 * 3. Chỉ thấy DOM ở đúng khoảnh khắc quét. Dialog/menu chưa mở thì chưa tồn
 *    tại để mà quét.
 *
 * Nói cách khác: đây là một SÀN, không phải một chứng chỉ.
 */

import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import type { Result } from 'axe-core';
import { expect, test } from './fixtures/api';
import { openScreen, resolvePath } from './fixtures/nav';
import { MIN_SCREENS, SCREENS, roleSatisfies, screenLabel, type Screen } from './routes';

/**
 * Luật PHẢI đỏ dù axe xếp chúng ở mức `moderate`.
 *
 * ⚠ Đây là một LỆCH VỚI HỢP ĐỒNG mà 13.H phải nói ra, không tự vá rồi im.
 * `phase-13-exec.md` §C6bis khẳng định hai `<main>` lồng nhau "làm axe của
 * 13.H đỏ `landmark-unique`". Không đúng như đã viết: axe xếp `landmark-unique`
 * và `landmark-no-duplicate-main` ở mức **moderate**, còn cổng của mục 25 là
 * **serious/critical** — nên vi phạm `<main>` kép sẽ đi qua cổng đó trong im
 * lặng. C6bis là một quyết định kiến trúc đúng; chỉ có câu về cơ chế thực thi
 * là sai. Liệt kê tường minh ở đây để hợp đồng có thứ thực thi nó thật, thay
 * vì hạ ngưỡng chung xuống `moderate` (sẽ kéo theo hàng chục luật khác và biến
 * cổng thành tiếng ồn).
 */
// P16 runtime exposed 15 pages whose missing h1 or skipped heading level was
// moderate, so they passed the old severity floor. Keep both semantic rules
// explicit: restoring that defect must fail even when its severity is unchanged.
const MUST_NOT_FIRE = [
  'landmark-unique',
  'landmark-no-duplicate-main',
  'landmark-one-main',
  'heading-order',
  'page-has-heading-one',
];

type Verdict = { blocking: Result[]; other: Result[]; passCount: number };

async function scan(page: Page, testInfo: TestInfo, label: string): Promise<Verdict> {
  // KHÔNG lọc theo tag: `analyze()` trần chạy toàn bộ luật (gồm cả nhóm
  // best-practice, nơi các luật landmark ở trên sống). Lọc bằng `withTags`
  // theo WCAG sẽ loại đúng những luật MUST_NOT_FIRE cần.
  const results = await new AxeBuilder({ page }).analyze();

  // Tiền đề của chính phép quét: axe đã thật sự chạy trên một cây DOM có thật.
  // Trên một document rỗng, `violations` VÀ `passes` đều rỗng — và một
  // `violations: []` như thế đọc y hệt một trang sạch.
  expect(
    results.passes.length,
    `axe chạy trên ${label} nhưng không có luật nào PASS. Gần như chắc chắn nó ` +
      `quét một document rỗng, và "0 vi phạm" khi đó không chứng minh gì.`,
  ).toBeGreaterThan(0);

  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical' || MUST_NOT_FIRE.includes(v.id),
  );
  const other = results.violations.filter((v) => !blocking.includes(v));

  await testInfo.attach(`axe-${label.replace(/[^a-z0-9]+/gi, '-')}.json`, {
    contentType: 'application/json',
    body: Buffer.from(
      JSON.stringify(
        {
          url: page.url(),
          passes: results.passes.length,
          incomplete: results.incomplete.map((v) => v.id),
          violations: results.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.length,
          })),
        },
        null,
        2,
      ),
    ),
  });

  return { blocking, other, passCount: results.passes.length };
}

function describeViolations(violations: Result[]): string {
  return violations
    .map(
      (v) =>
        `  • [${v.impact ?? 'n/a'}] ${v.id} — ${v.help}\n` +
        `    ${v.helpUrl}\n` +
        v.nodes
          .slice(0, 4)
          .map((n) => `      ${n.target.join(' ')}`)
          .join('\n'),
    )
    .join('\n');
}

function assertClean(verdict: Verdict, label: string): void {
  expect(
    verdict.blocking.map((v) => `${v.impact}:${v.id}`),
    `axe tìm thấy ${verdict.blocking.length} lỗi CHẶN trên ${label} ` +
      `(${verdict.passCount} luật pass; ${verdict.other.length} lỗi mức thấp không chặn):\n` +
      describeViolations(verdict.blocking),
  ).toEqual([]);
}

// ─────────────────────────────────────────────────────────── cổng của danh sách

test('danh sách màn hình D12 không bị rút ngắn', () => {
  // Rút SCREENS xuống hai dòng thì mọi test dưới đây vẫn PASS — chỉ ít test
  // hơn — và bảng tổng kết vẫn ghi "0 lỗi serious/critical". Ô này biến việc
  // rút ngắn thành một lỗi có tên.
  expect(SCREENS.length).toBeGreaterThanOrEqual(MIN_SCREENS);
  expect(new Set(SCREENS.map((s) => s.path)).size).toBe(SCREENS.length);
});

// ─────────────────────────────────────────────────────── đối chứng dương (axe)

test('đối chứng dương — axe PHẢI bắt được một trang cố tình hỏng', async ({ page }, testInfo) => {
  // Không có ô này thì "0 lỗi serious/critical" ở mọi màn hình bên dưới có thể
  // đơn giản là axe chưa từng chạy, hoặc chạy rồi bị CSP chặn phần tiêm mã, hay
  // quét nhầm một document rỗng. Một phép kiểm chưa bao giờ được thấy ĐỎ thì
  // chưa được chứng minh (`green-that-proves-nothing`).
  //
  // Trang hỏng được dựng bằng `setContent` NGAY TRÊN origin thật, nên đối chứng
  // này đồng thời chứng minh axe tiêm được vào một trang đang chịu CSP thật của
  // sản phẩm — chứ không chỉ trên `about:blank`.
  await page.goto('/login');
  await page.setContent(
    `<main>
       <h3>Nhảy cóc từ h3</h3>
       <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==">
       <button></button>
       <a href="#"></a>
       <p style="color:#8a8a8a;background:#9a9a9a">chữ chìm trong nền</p>
     </main>`,
  );

  const results = await new AxeBuilder({ page }).analyze();
  const found = results.violations.map((v) => v.id);

  await testInfo.attach('axe-positive-control.json', {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(found, null, 2)),
  });

  // `image-alt` và `button-name` đều là `critical` và ổn định qua các bản
  // axe-core — chúng là hai luật ta neo vào. `color-contrast` được ghi nhận
  // trong attachment nhưng KHÔNG neo: nó phụ thuộc việc render màu thật, và
  // một đối chứng dương chập chờn còn tệ hơn không có.
  expect(
    found,
    `axe không bắt được trang hỏng cố ý. Vậy thì mọi "0 lỗi" ở các ô khác không ` +
      `chứng minh gì. Luật đã thấy: ${found.join(', ') || '(không có)'}`,
  ).toEqual(expect.arrayContaining(['image-alt', 'button-name']));

  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(blocking.length).toBeGreaterThan(0);
});

// ────────────────────────────────────────────────────────── màn hình công khai

test('đối chứng heading — thiếu h1 và nhảy cấp đều bị cổng ngữ nghĩa chặn', async ({
  page,
}, testInfo) => {
  await page.goto('/login');
  await page.setContent(`<!doctype html><html lang="vi"><head><title>Đối chứng heading</title></head>
    <body><main><h2>Mục chính thiếu h1</h2><h4>Mục con nhảy cấp</h4>
    <p>Nội dung cố tình vi phạm cấu trúc heading.</p></main></body></html>`);
  const verdict = await scan(page, testInfo, 'heading-negative-control');
  expect(verdict.blocking.map((violation) => violation.id)).toEqual(
    expect.arrayContaining(['heading-order', 'page-has-heading-one']),
  );
  expect(() => assertClean(verdict, 'heading-negative-control')).toThrow();
});

test.describe('a11y — công khai (chưa đăng nhập)', () => {
  // `/login` chuyển hướng về `/me` khi ĐÃ có phiên (proxy.ts AUTH_ONLY_PATHS),
  // nên hai màn này PHẢI được mở bằng một jar cookie rỗng, không phải
  // storageState của lượt chạy.
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const screen of SCREENS.filter((s) => s.auth === 'anon')) {
    test(`axe ${screenLabel(screen)}`, async ({ page }, testInfo) => {
      await openScreen(page, screen.path, screen.auth);
      assertClean(await scan(page, testInfo, screen.path), screen.path);
    });
  }
});

// ───────────────────────────────────────────────────────── màn hình đã đăng nhập

test.describe('a11y — đã đăng nhập', () => {
  for (const screen of SCREENS.filter((s) => s.auth === 'user')) {
    test(`axe ${screenLabel(screen)}`, async ({ page, api }, testInfo) => {
      const path = await resolvePath(api, screen);
      await openScreen(page, path, screen.auth);
      assertClean(await scan(page, testInfo, path), path);
    });
  }
});

// ────────────────────────────────────────────────────────── màn hình theo vai trò

test.describe('a11y — theo vai trò', () => {
  for (const screen of SCREENS.filter((s) => s.auth === 'author' || s.auth === 'admin')) {
    test(`axe ${screenLabel(screen)}`, async ({ page, api, account }, testInfo) => {
      test.skip(
        !roleSatisfies(account.role, screen.auth),
        `tài khoản ${account.email} có vai trò '${account.role}', cần '${screen.auth}'. ` +
          `Chạy e2e/scripts/promote-role.sh TRƯỚC lượt chạy.`,
      );
      const path = await resolvePath(api, screen);
      await openScreen(page, path, screen.auth);
      assertClean(await scan(page, testInfo, path), path);
    });
  }

  /**
   * Bạn đồng hành của loạt `test.skip` ở trên.
   *
   * Skip là hành vi ĐÚNG khi ai đó chạy nhanh bằng tài khoản thường — nhưng
   * một lượt chạy mà 5 màn hình quản trị đều skip trông y hệt một lượt chạy
   * mà chúng đều xanh, trong bảng tổng kết lẫn trong exit code. Ở lượt chạy
   * NGHIỆM THU (đợt 3), đặt `E2E_REQUIRE_ROLES=1` và ô này biến mọi lượt skip
   * đó thành một lỗi đỏ có tên.
   */
  test('đối chứng: E2E_REQUIRE_ROLES=1 thì không màn hình vai-trò nào được skip', ({ account }) => {
    test.skip(
      process.env.E2E_REQUIRE_ROLES !== '1',
      'chỉ bắt buộc ở lượt nghiệm thu trên cụm (đặt E2E_REQUIRE_ROLES=1)',
    );
    const missing = SCREENS.filter(
      (s: Screen) => !roleSatisfies(account.role, s.auth) && s.auth !== 'anon' && s.auth !== 'user',
    );
    expect(
      missing.map(screenLabel),
      `${missing.length} màn hình vai-trò sẽ bị SKIP vì tài khoản ${account.email} ` +
        `chỉ có vai trò '${account.role}'. Một lượt skip sạch không phải một lượt xanh.`,
    ).toEqual([]);
  });
});
