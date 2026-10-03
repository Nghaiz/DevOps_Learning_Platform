/**
 * Nghiệm thu 3D của landing — CHỈ chạy trên máy có GPU thật:
 *   pnpm --filter @devops-platform/web e2e:landing3d   (e2e/landing.config.ts, full Chromium,
 *   `--use-angle=d3d11` trên win32). CI không chạy suite này: runner không có GPU, và một ngân
 *   sách khung hình đo trên SwiftShader là đo CPU của runner chứ không đo trang.
 *
 * ⚠ VIẾT LẠI 2026-10-03 cho landing 3D mới (canvas cố định + sáu ga ghim + terminal ghim).
 *
 * Năm nhóm ô, mỗi ô tự mở trang mới:
 *   1. renderer là phần cứng, `data-calls` > 0, LCP < 2,5 s và phần tử LCP không phải canvas;
 *   2. cuộn theo kịch bản hết trang, lấy khoảng giữa các rAF: p95 ≤ 20 ms, max ≤ 60 ms. Số đo
 *      luôn được ghi ra (annotation + JSON đính kèm) kể cả khi ô đỏ;
 *   3. bốn đường rơi về hình tĩnh: giảm chuyển động, WebGL2 trả null, mất context sau khi đã
 *      vẽ, chunk cảnh tải lỗi — nội dung trang phải còn nguyên ở cả bốn;
 *   4. axe: không vi phạm serious/critical ở đầu và ở cuối trang.
 */

import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import { t } from '@devops-platform/copy';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { openScreen } from './fixtures/nav';

test.use({ storageState: { cookies: [], origins: [] } });

const SECTION_TEST_IDS = [
  'landing-hero',
  'landing-journey',
  'landing-terminal',
  'landing-modes',
  'landing-paths',
  'landing-games',
  'landing-closing',
] as const;

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/** Ngân sách đã chốt ở plan (AC 7) và trong brief của lane e2e. */
const FRAME_P95_BUDGET_MS = 20;
const FRAME_MAX_BUDGET_MS = 60;
const LCP_BUDGET_MS = 2500;
/** Tốc độ cuộn kịch bản: 2 400 px/s, cỡ một lượt lăn bánh xe nhanh. Tính theo THỜI GIAN chứ
 *  không theo số khung, để màn 144 Hz và 60 Hz cuộn cùng một quãng mỗi giây. */
const SCROLL_PX_PER_MS = 2.4;

const STAGE_SETTLE_MS = 25_000;

type LcpEntry = { time: number; tag: string; detail: string };

declare global {
  interface Window {
    __landingLcp?: LcpEntry[];
    __webglRequests?: number;
  }
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  return errors;
}

/** Đếm mọi lời xin context WebGL (kể cả lượt dò `webglAvailable`) — "0 context" phải đo được. */
async function countWebglRequests(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__webglRequests = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value: function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
        if (/webgl/i.test(kind)) window.__webglRequests = (window.__webglRequests ?? 0) + 1;
        return Reflect.apply(original, this, [kind, ...rest]) as unknown;
      },
    });
  });
}

async function attachJson(info: TestInfo, name: string, data: unknown): Promise<void> {
  const path = info.outputPath(name);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  await info.attach(name, { contentType: 'application/json', path });
}

async function settleStage(page: Page): Promise<string> {
  const stage = page.getByTestId('landing-stage');
  await expect
    .poll(() => stage.getAttribute('data-scene-state'), { timeout: STAGE_SETTLE_MS })
    .toMatch(/^(?:ready|fallback)$/);
  return (await stage.getAttribute('data-scene-state')) ?? '';
}

/** Rơi về hình tĩnh nghĩa là: không canvas, hình tĩnh hiện, và mọi nội dung DOM còn nguyên. */
async function expectReadableFallback(page: Page): Promise<void> {
  const stage = page.getByTestId('landing-stage');
  await expect(stage).toHaveAttribute('data-scene-state', 'fallback', { timeout: STAGE_SETTLE_MS });
  await expect(stage.locator('canvas')).toHaveCount(0);
  await expect(stage.getByRole('img', { name: t('home.scene.fallback') })).toHaveAttribute(
    'data-visible',
    'true',
  );
  await expectContentIntact(page);
}

async function expectContentIntact(page: Page): Promise<void> {
  await expect(
    page.getByTestId('landing-hero').getByRole('heading', { level: 1 }),
  ).toContainText(t('home.hero.title-a'));
  await expect(page.getByTestId('landing-cta-primary')).toHaveAttribute('href', '/register');
  for (const testId of SECTION_TEST_IDS) await expect(page.getByTestId(testId), testId).toHaveCount(1);
  await expect(page.locator('[data-testid^="journey-station-"]')).toHaveCount(6);
}

function stageCanvas(page: Page): Locator {
  return page.getByTestId('landing-stage').locator('canvas');
}

async function openFull(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openScreen(page, '/', 'anon');
  await expect(page.getByTestId('landing-root')).toHaveAttribute('data-motion', 'full');
}

test('landing 3D — GPU renderer, draw calls, and a non-canvas LCP under 2.5 s', async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const entries: LcpEntry[] = [];
    window.__landingLcp = entries;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const element = (entry as PerformanceEntry & { element?: Element | null }).element ?? null;
        entries.push({
          time: entry.startTime,
          tag: element?.tagName ?? '(detached)',
          detail: element
            ? `${element.className.toString().slice(0, 60)} | ${(element.textContent ?? '').trim().slice(0, 60)}`
            : '',
        });
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  await openFull(page);
  const state = await settleStage(page);
  expect(state, 'phần cứng có GPU mà cảnh vẫn rơi về hình tĩnh').toBe('ready');

  const canvas = stageCanvas(page);
  const renderer = (await canvas.getAttribute('data-renderer')) ?? '';
  info.annotations.push({ type: 'renderer', description: renderer });
  expect(renderer, 'renderer rỗng: cảnh không báo được nó vẽ bằng gì').not.toBe('');
  expect(renderer, 'suite này phải chạy trên đường đồ hoạ phần cứng').not.toMatch(SOFTWARE_RENDERER);

  // `data-calls` chỉ được ghi mỗi 30 khung, nên chờ nó xuất hiện chứ không đọc ngay.
  await expect
    .poll(async () => Number((await canvas.getAttribute('data-calls')) ?? '0'))
    .toBeGreaterThan(0);
  const calls = Number(await canvas.getAttribute('data-calls'));

  // LCP: đọc TRƯỚC mọi tương tác (tương tác chốt LCP lại). Đợi cảnh xong để mọi ứng viên đã vẽ.
  const lcpEntries = await page.evaluate(() => window.__landingLcp ?? []);
  const lcp = lcpEntries.at(-1);
  await attachJson(info, 'landing-lcp.json', { renderer, calls, lcp, lcpEntries });
  info.annotations.push({
    type: 'lcp',
    description: lcp ? `${lcp.time.toFixed(0)} ms <${lcp.tag}> ${lcp.detail}` : 'none',
  });
  expect(lcp, 'không có mục LCP nào: "không đo được" không phải là 0').toBeDefined();
  expect(lcp?.time ?? Infinity).toBeLessThan(LCP_BUDGET_MS);
  expect(lcp?.tag, 'phần tử LCP không được là canvas').not.toBe('CANVAS');
  expect(errors).toEqual([]);
});

/**
 * Một lượt cuộn kịch bản từ đỉnh tới đáy, chạy TRONG trang: mỗi rAF đặt `scrollTo` theo thời gian
 * đã trôi và ghi khoảng cách tới rAF trước. Tự đủ (được tuần tự hoá sang trình duyệt), nên không
 * được tham chiếu gì ngoài tham số.
 */
async function scrollPass(speed: number) {
  const sections = Array.from(document.querySelectorAll('[data-testid^="landing-"]'))
    .filter((element) => element.tagName === 'SECTION')
    .map((element) => {
      const parent = element.parentElement;
      const anchor = parent?.classList.contains('pin-spacer') ? parent : element;
      return {
        id: element.getAttribute('data-testid') ?? '',
        top: anchor.getBoundingClientRect().top + window.scrollY,
      };
    })
    .sort((a, b) => a.top - b.top);
  const sectionAt = (y: number): string => {
    let found = 'top-bar';
    for (const section of sections) if (y + 1 >= section.top) found = section.id;
    return found;
  };
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo(0, 0);
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

  const frames: { ms: number; y: number }[] = [];
  await new Promise<void>((resolve) => {
    let origin = 0;
    let previous = 0;
    const tick = (stamp: number) => {
      if (origin === 0) origin = stamp;
      else frames.push({ ms: stamp - previous, y: Math.round(window.scrollY) });
      previous = stamp;
      const y = Math.min(maxScroll, (stamp - origin) * speed);
      window.scrollTo(0, y);
      if (y >= maxScroll) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const sorted = frames.map((frame) => frame.ms).sort((a, b) => a - b);
  const rank = (p: number): number => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? NaN;
  const worst = frames
    .slice()
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 12)
    .map((frame) => ({ ...frame, ms: Number(frame.ms.toFixed(1)), section: sectionAt(frame.y) }));
  const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="landing-stage"] canvas');
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
    canvasPixelRatio: canvas ? Number((canvas.width / canvas.clientWidth).toFixed(3)) : null,
    scrollHeight: maxScroll + window.innerHeight,
    reachedBottom: window.scrollY + window.innerHeight >= maxScroll + window.innerHeight - 2,
    samples: sorted.length,
    elapsedMs: Number(sorted.reduce((sum, value) => sum + value, 0).toFixed(0)),
    p50Ms: Number(rank(0.5).toFixed(2)),
    p95Ms: Number(rank(0.95).toFixed(2)),
    p99Ms: Number(rank(0.99).toFixed(2)),
    maxMs: Number((sorted.at(-1) ?? NaN).toFixed(2)),
    over20ms: sorted.filter((value) => value > 20).length,
    over33ms: sorted.filter((value) => value > 33).length,
    worst,
    scope: 'rAF intervals during window.scrollTo driven scroll; local Chromium, not field FPS/INP.',
  };
}

test('landing 3D — scripted scroll through the whole page stays inside the frame budget', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await openFull(page);
  expect(await settleStage(page)).toBe('ready');
  const renderer = (await stageCanvas(page).getAttribute('data-renderer')) ?? '';
  expect(renderer).not.toMatch(SOFTWARE_RENDERER);

  /*
    Lượt NGUỘI là lượt được gác: đó là lần cuộn đầu tiên của một người dùng thật, kể cả mọi
    chi phí chỉ trả một lần (biên dịch shader khi một model lần đầu vào khung nhìn, tạo texture).
    Lượt ẤM ngay sau đó trên cùng trang chỉ được GHI LẠI, không gác: nó tách "giật vì lần đầu"
    khỏi "giật ở mọi lượt" khi ô đỏ, để người sửa biết nên nhìn vào đâu.
  */
  const cold = await page.evaluate(scrollPass, SCROLL_PX_PER_MS);
  const warm = await page.evaluate(scrollPass, SCROLL_PX_PER_MS);

  const line = (pass: typeof cold) =>
    `p50 ${pass.p50Ms} ms · p95 ${pass.p95Ms} ms · max ${pass.maxMs} ms · ${pass.samples} khung`;
  const summary = `nguội: ${line(cold)} | ấm: ${line(warm)} | ${renderer}`;
  info.annotations.push({ type: 'frames', description: summary });
  // Ra thẳng stdout để reporter `list` in số đo kể cả khi ô xanh (annotation không hiện ở đó).
  process.stdout.write(`[landing-3d] frames: ${summary}
`);
  await attachJson(info, 'landing-frame-sample.json', { renderer, cold, warm });

  expect(cold.samples, 'quá ít khung để có p95 nghĩa lý').toBeGreaterThan(100);
  // Cuộn tới đáy thật: một vòng rAF dừng sớm sẽ cho số đẹp trên nửa trang đầu.
  expect(cold.reachedBottom, 'lượt cuộn không chạm đáy trang').toBe(true);
  expect.soft(cold.p95Ms, `p95 khoảng khung (${summary})`).toBeLessThanOrEqual(FRAME_P95_BUDGET_MS);
  expect.soft(cold.maxMs, `khung dài nhất (${summary})`).toBeLessThanOrEqual(FRAME_MAX_BUDGET_MS);
  expect(errors).toEqual([]);
});

test('landing 3D — reduced motion creates no WebGL context and no canvas', async ({ page }) => {
  const errors = watchErrors(page);
  await countWebglRequests(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openScreen(page, '/', 'anon');
  await expect(page.getByTestId('landing-root')).toHaveAttribute('data-motion', 'reduced');
  await expectReadableFallback(page);
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => window.__webglRequests)).toBe(0);
  await expect(page.getByTestId('landing-terminal')).toHaveAttribute('data-step', '3');
  expect(errors).toEqual([]);
});

test('landing 3D — WebGL2 unavailable falls back to the static map', async ({ page }) => {
  await page.addInitScript(() => {
    window.__webglRequests = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value: function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
        if (kind === 'webgl2') {
          window.__webglRequests = (window.__webglRequests ?? 0) + 1;
          return null;
        }
        return Reflect.apply(original, this, [kind, ...rest]) as unknown;
      },
    });
  });
  await openFull(page);
  await expectReadableFallback(page);
  // Đối chứng: bản vá phải thực sự bị gọi, nếu không "fallback" có thể đến từ lý do khác.
  expect(await page.evaluate(() => window.__webglRequests)).toBeGreaterThan(0);
});

test('landing 3D — losing the WebGL context after the first frame falls back', async ({ page }) => {
  await openFull(page);
  expect(await settleStage(page)).toBe('ready');
  const induced = await stageCanvas(page).evaluate((canvas: HTMLCanvasElement) => {
    // Trả về context SẴN CÓ của three (cùng kiểu webgl2), không tạo context mới.
    const gl = canvas.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  expect(induced, 'trình duyệt phải thực sự làm mất một context đang sống').toBe(true);
  await expectReadableFallback(page);
});

test('landing 3D — a failed stage chunk leaves the page content intact', async ({ page }, info) => {
  const errors = watchErrors(page);
  const blocked: string[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/_next/static/chunks/') && url.pathname.endsWith('.js'),
    async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      // Tìm chunk cảnh bằng nội dung, không bằng hash: hash đổi mỗi lượt build.
      if (body.includes('powerPreference') || body.includes('@react-three')) {
        blocked.push(new URL(route.request().url()).pathname);
        await route.abort('failed');
        return;
      }
      await route.fulfill({ response });
    },
  );
  const started = Date.now();
  await openFull(page);
  await expectReadableFallback(page);
  const fallbackAfterMs = Date.now() - started;
  await attachJson(info, 'landing-blocked-chunks.json', { blocked, fallbackAfterMs, errors });
  expect(blocked.length, 'phải chặn được ít nhất một chunk cảnh thật').toBeGreaterThan(0);
  // Ranh giới lỗi của cảnh phải bắt được — không phải chờ hẹn giờ 15 s mới rơi về hình tĩnh.
  expect(errors.some((line) => line.includes('[landing] 3D stage failed'))).toBe(true);
});

test('landing 3D — axe finds no serious or critical violation at the top and the end', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await openFull(page);
  await settleStage(page);
  const audit = async (where: string) => {
    const result = await new AxeBuilder({ page }).analyze();
    const blocking = result.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    await attachJson(info, `landing-axe-${where}.json`, {
      passes: result.passes.length,
      violations: result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => ({
          target: node.target.join(' '),
          summary: node.failureSummary ?? '',
        })),
      })),
      incomplete: result.incomplete.map((entry) => entry.id),
    });
    expect(result.passes.length, `axe không chạy được ở ${where}`).toBeGreaterThan(0);
    // Soft: một vi phạm ở đầu trang không được che mất lượt quét cuối trang.
    expect
      .soft(
        blocking.map(
          (violation) =>
            `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
        ),
        `axe ${where}`,
      )
      .toEqual([]);
  };

  // Chữ hero lộ bằng keyframe CSS; quét khi từng ký tự đã hiện đủ, không phải giữa chừng.
  await expect
    .poll(() =>
      page
        .getByTestId('landing-hero')
        .locator('[data-kinetic-char]')
        .evaluateAll((chars) => chars.every((char) => getComputedStyle(char).opacity === '1')),
    )
    .toBe(true);
  await audit('top');

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect
    .poll(() =>
      page.evaluate(
        () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2,
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page
        .getByTestId('landing-closing')
        .locator('[data-kinetic-char]')
        .evaluateAll((chars) => chars.every((char) => getComputedStyle(char).opacity === '1')),
    )
    .toBe(true);
  await audit('end');
});
