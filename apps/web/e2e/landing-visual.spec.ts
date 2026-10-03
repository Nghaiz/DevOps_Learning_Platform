/**
 * Landing 3D tại `/` — cổng CI (`e2e:ci`), hai tổ hợp: 1440×1000 chuyển động đầy đủ và
 * 390×844 giảm chuyển động, khách ẩn danh.
 *
 * ⚠ VIẾT LẠI 2026-10-03 cho landing 3D (`components/landing/**`). Bản trước đo `GamesHub`
 * (lọc game, đổi theme) — trang đó không còn ở `/`.
 *
 * ── Vì sao spec này không phụ thuộc tốc độ khung hình ─────────────────────────────────────────
 * Trên runner CI, WebGL2 là SwiftShader (rasterize bằng CPU): một khung có thể mất hàng trăm ms,
 * và cảnh có quyền tự rơi về hình tĩnh khi chưa vẽ được khung đầu sau 15 s. Nên:
 *   - mọi cuộn là `window.scrollTo` tức thời rồi CHỜ thuộc tính bằng `expect.poll`, không cuộn
 *     bằng bánh xe (Lenis làm mượt bánh xe, quãng đi phụ thuộc số khung) và không ngủ cố định;
 *   - cảnh ở chế độ đầy đủ được phép kết thúc ở `ready` HOẶC `fallback` — cả hai là trạng thái
 *     đúng của sản phẩm; ô này chỉ khẳng định nó không kẹt ở `loading` và DOM khớp trạng thái;
 *   - phần đo GPU thật (khung hình, LCP, renderer) nằm ở `landing-3d.spec.ts`, không ở đây.
 *
 * ── Hợp đồng thời gian của đoạn ghim (chép từ mã, cố ý KHÔNG import) ──────────────────────────
 * `journey.tsx` JOURNEY_SCREENS = 7, `terminal.tsx` TERMINAL_SCREENS = 3.2,
 * `journey-timeline.ts` JOURNEY_INTRO = 0.07, mỗi ga chiếm (1 − 0.07) / 6 tiến độ. Đổi nhịp mà
 * không đổi ở đây thì ô ga đỏ — đó là tín hiệu muốn có, không phải spec giòn: ô này đóng vai hợp
 * đồng, và một spec tự đi theo mã sẽ xanh bất kể mã đổi thành gì.
 */

import { t } from '@devops-platform/copy';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { openScreen } from './fixtures/nav';

test.use({ storageState: { cookies: [], origins: [] } });

/** testid → id neo của khu (thanh trên và chân trang dẫn tới các id này). */
const SECTIONS = [
  ['landing-hero', 'dau-trang'],
  ['landing-journey', 'hanh-trinh'],
  ['landing-terminal', 'terminal'],
  ['landing-modes', 'cach-hoc'],
  ['landing-paths', 'lo-trinh'],
  ['landing-games', 'tro-choi'],
  ['landing-closing', 'ket'],
] as const;

const STATIONS = ['linux', 'git', 'docker', 'k8s', 'cicd', 'prod'] as const;

const JOURNEY_SCREENS = 7;
const TERMINAL_SCREENS = 3.2;
const JOURNEY_INTRO = 0.07;
const STATION_SPAN = (1 - JOURNEY_INTRO) / STATIONS.length;
/** Tâm của ga `i`: đã qua phần thẻ hiện vào, chưa tới phần camera bay sang ga kế. */
const stationCentre = (index: number): number =>
  JOURNEY_INTRO + index * STATION_SPAN + 0.4 * STATION_SPAN;

/** Ga được ô này cuộn tới. Không phải ga đầu (−1 → 0 là chuyển dễ nhất, chứng minh ít nhất). */
const PROBE_STATION = 3;

/** Cảnh phải thôi `loading` trong ngần này. Sản phẩm tự rơi về hình tĩnh sau 15 s. */
const STAGE_SETTLE_MS = 25_000;

const VARIANTS = [
  { width: 1440, height: 1000, reducedMotion: 'no-preference', motion: 'full' },
  { width: 390, height: 844, reducedMotion: 'reduce', motion: 'reduced' },
] as const;

type CspViolation = { directive: string; blockedURI: string };

declare global {
  interface Window {
    __landingCsp?: CspViolation[];
  }
}

/**
 * Lỗi console + vi phạm CSP. Máy thu CSP cài bằng `addInitScript` (chạy trước mọi script của
 * trang): vi phạm không ném, nó bắn `securitypolicyviolation` bất đồng bộ, nên một listener cài
 * sau `goto` sẽ không bao giờ nghe thấy gì. Máy thu được chứng minh kêu được ở cuối test.
 */
async function watchPage(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  await page.addInitScript(() => {
    const seen: CspViolation[] = [];
    window.__landingCsp = seen;
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
    });
  });
  return errors;
}

const readCsp = (page: Page): Promise<CspViolation[]> =>
  page.evaluate(() => window.__landingCsp ?? []);

/**
 * Toạ độ cuộn tuyệt đối của tiến độ `progress` trong đoạn ghim của khu `testId`.
 *
 * ScrollTrigger bọc khu đang ghim trong `.pin-spacer`; mép trên của spacer nằm yên trong luồng
 * tài liệu kể cả khi khu đang `position: fixed`, nên nó là điểm bắt đầu đoạn ghim (`start:
 * 'top top'`). Không có spacer ở chế độ đầy đủ nghĩa là ghim không chạy — ném, đừng đoán.
 */
async function scrollIntoPin(
  page: Page,
  testId: string,
  screens: number,
  progress: number,
): Promise<number> {
  return page.evaluate(
    ({ id, length, at }) => {
      const section = document.querySelector(`[data-testid="${id}"]`);
      const spacer = section?.parentElement;
      if (!spacer?.classList.contains('pin-spacer')) {
        throw new Error(`${id} không được ghim (không có .pin-spacer bọc ngoài)`);
      }
      const start = spacer.getBoundingClientRect().top + window.scrollY;
      const y = Math.round(start + at * length * window.innerHeight);
      window.scrollTo(0, y);
      return y;
    },
    { id: testId, length: screens, at: progress },
  );
}

/** Đưa mép trên của khu (hoặc spacer của nó) lên đỉnh màn hình. */
async function scrollToSection(page: Page, testId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const section = document.querySelector(`[data-testid="${id}"]`);
    if (section === null) throw new Error(`thiếu ${id}`);
    const parent = section.parentElement;
    const anchor = parent?.classList.contains('pin-spacer') ? parent : section;
    window.scrollTo(0, Math.round(anchor.getBoundingClientRect().top + window.scrollY));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }, testId);
}

async function expectNoHorizontalOverflow(page: Page, where: string): Promise<void> {
  const box = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(box.scrollWidth, `tràn ngang ở ${where}`).toBeLessThanOrEqual(box.innerWidth);
}

async function shoot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
}

for (const variant of VARIANTS) {
  const tag = `${variant.width}-${variant.motion}`;

  test(`landing 3D — ${variant.width}px, chuyển động ${variant.motion}`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const errors = await watchPage(page);
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await page.emulateMedia({ reducedMotion: variant.reducedMotion });
    await openScreen(page, '/', 'anon');

    const root = page.getByTestId('landing-root');
    await expect(root).toHaveAttribute('data-motion', variant.motion);

    // ── Khung trang: tiêu đề, CTA khách, đủ khu và đủ sáu ga ────────────────────────────────
    const hero = page.getByTestId('landing-hero');
    await expect(hero.getByRole('heading', { level: 1 })).toContainText(t('home.hero.title-a'));
    await expect(page.getByTestId('landing-cta-primary')).toHaveAttribute('href', '/register');
    for (const [testId, id] of SECTIONS) {
      await expect(page.getByTestId(testId), testId).toHaveAttribute('id', id);
    }
    for (const station of STATIONS) {
      await expect(page.getByTestId(`journey-station-${station}`), station).toHaveCount(1);
    }

    // ── Cảnh 3D: không kẹt ở loading, và DOM khớp trạng thái báo ra ───────────────────────────
    const stage = page.getByTestId('landing-stage');
    await expect
      .poll(() => stage.getAttribute('data-scene-state'), { timeout: STAGE_SETTLE_MS })
      .toMatch(variant.motion === 'full' ? /^(?:ready|fallback)$/ : /^fallback$/);
    const sceneState = await stage.getAttribute('data-scene-state');
    if (variant.motion === 'full') {
      // `ready` mà không có canvas, hay `fallback` mà canvas còn treo, đều là nói dối.
      await expect(stage.locator('canvas')).toHaveCount(sceneState === 'ready' ? 1 : 0);
      expect(
        await page.locator('.pin-spacer').count(),
        'chế độ đầy đủ phải ghim hành trình, terminal và lộ trình',
      ).toBeGreaterThanOrEqual(2);
    } else {
      await expect(page.locator('canvas'), 'giảm chuyển động: không canvas nào').toHaveCount(0);
      await expect(page.locator('.pin-spacer'), 'giảm chuyển động: không ghim').toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.classList.contains('lenis')),
        'giảm chuyển động: Lenis không được khởi tạo',
      ).toBe(false);
    }
    await info.attach('scene-state.txt', { body: `${tag}: ${sceneState ?? 'null'}` });

    // ── Số liệu hero: chữ số thật hoặc "?" — không bao giờ ô trống ───────────────────────────
    const stats = await hero.locator('dl dd').evaluateAll(
      (cells, unknown) =>
        cells.map((cell) => {
          const spoken = cell.querySelector('.sr-only')?.textContent?.trim() ?? '';
          if (/^\d+$/.test(spoken)) return { kind: 'digits', text: spoken };
          if ((cell.textContent ?? '').includes(unknown)) return { kind: 'unknown', text: unknown };
          return { kind: 'invalid', text: (cell.textContent ?? '').trim() };
        }),
      t('home.stat.unknown'),
    );
    expect(stats.length, 'dải số liệu hero vắng mặt (mọi nguồn đếm đều lỗi?)').toBe(4);
    expect(stats.filter((stat) => stat.kind === 'invalid')).toEqual([]);
    await info.attach('hero-stats.json', { body: JSON.stringify(stats), contentType: 'application/json' });

    // ── Lộ trình: ít nhất một liên kết thật, hoặc câu "chưa có" — không phải câu "đọc lỗi" ───
    const paths = page.getByTestId('landing-paths');
    await expect(paths.getByText(t('home.paths.unknown'))).toHaveCount(0);
    const pathLinks = await paths.locator('a[href^="/paths/"]').count();
    if (pathLinks === 0) await expect(paths.getByText(t('home.paths.empty'))).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoHorizontalOverflow(page, 'đầu trang');
    await shoot(page, info, `landing-${tag}-hero`);

    const journey = page.getByTestId('landing-journey');
    const terminal = page.getByTestId('landing-terminal');
    const checkDone = terminal.getByText(t('home.term.check-done'));

    if (variant.motion === 'full') {
      /*
        Đối chứng âm trước: ở đầu trang, ghim đã dựng thì terminal về bước 0 và chưa "đạt". Nếu
        bỏ bước này, ô "cuộn xong thì data-step=3" sẽ xanh cả khi ghim chưa từng chạy — vì HTML
        từ server vốn đã render terminal ở trạng thái cuối.
      */
      await expect(terminal).toHaveAttribute('data-step', '0');
      await expect(checkDone).toBeHidden();
      await expect(journey).toHaveAttribute('data-station', '-1');

      // Tới tâm ga 3. Cuộn lại trong mỗi lượt poll: ScrollTrigger có thể refresh (font tải
      // xong, lộ trình chèn đoạn ghim ngang) và dời điểm bắt đầu sau lượt cuộn đầu.
      await expect
        .poll(
          async () => {
            await scrollIntoPin(page, 'landing-journey', JOURNEY_SCREENS, stationCentre(PROBE_STATION));
            return journey.getAttribute('data-station');
          },
          { timeout: 20_000 },
        )
        .toBe(String(PROBE_STATION));
      await expect(page.getByTestId(`journey-station-${STATIONS[PROBE_STATION]}`)).toBeVisible();
      await expectNoHorizontalOverflow(page, `ga ${PROBE_STATION}`);
      await shoot(page, info, `landing-${tag}-journey-station-${PROBE_STATION}`);

      // Qua hẳn mép cuối đoạn ghim terminal: kịch bản chạy hết, bước 4/4, "đạt".
      await expect
        .poll(
          async () => {
            await scrollIntoPin(page, 'landing-terminal', TERMINAL_SCREENS, 1.05);
            return terminal.getAttribute('data-step');
          },
          { timeout: 20_000 },
        )
        .toBe('3');
    } else {
      // Không ghim, không GSAP: hành trình không bao giờ "đến ga", terminal ở trạng thái cuối.
      await expect(journey).toHaveAttribute('data-station', '-1');
      await scrollToSection(page, 'landing-terminal');
      await expect(terminal).toHaveAttribute('data-step', '3');
    }
    await expect(terminal.locator('[data-check]')).toHaveAttribute('data-checked', 'true');
    await expect(checkDone).toBeVisible();
    await expectNoHorizontalOverflow(page, 'terminal');
    await shoot(page, info, `landing-${tag}-terminal`);

    for (const testId of ['landing-modes', 'landing-paths', 'landing-games', 'landing-closing']) {
      await scrollToSection(page, testId);
      await expectNoHorizontalOverflow(page, testId);
      await shoot(page, info, `landing-${tag}-${testId.replace('landing-', '')}`);
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expectNoHorizontalOverflow(page, 'cuối trang');
    await shoot(page, info, `landing-${tag}-footer`);

    // ── Console + CSP, rồi chứng minh máy thu CSP kêu được ────────────────────────────────────
    expect(errors, 'lỗi console/pageerror').toEqual([]);
    expect(await readCsp(page), 'vi phạm CSP').toEqual([]);
    /*
      Đối chứng dương: `img-src 'self' data:` chặn ảnh từ host lạ. Nếu dòng dưới không bao giờ
      thấy vi phạm thì `[]` phía trên là máy thu điếc, không phải trang sạch. Chạy SAU khi đã
      khẳng định console sạch, vì chính nó in ra một lỗi "Refused to load the image".
    */
    await page.evaluate(() => {
      const probe = new Image();
      probe.src = 'https://csp-control.invalid/probe.png';
    });
    await expect.poll(async () => (await readCsp(page)).length).toBeGreaterThan(0);
  });
}
