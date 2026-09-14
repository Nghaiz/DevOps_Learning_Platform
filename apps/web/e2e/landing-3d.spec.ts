import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { openScreen } from './fixtures/nav';
import { E2E_BASE_URL } from './env';

type Audit = {
  csp: { directive: string; blockedURI: string }[];
  draws: number[];
  lcp: { time: number; tag: string }[];
  longTasks: number[];
  rafStamp: number;
  blockedContexts: number;
};

declare global {
  interface Window {
    __journeyAudit?: Audit;
  }
}

test.use({ storageState: { cookies: [], origins: [] } });

test.afterEach(async ({ page }, info) => {
  if (page.isClosed()) return;
  const audit = await page.evaluate(() => window.__journeyAudit);
  if (audit) await attach(info, 'landing-browser-audit.json', audit);
});

async function observe(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => {
    const audit: Audit = {
      csp: [],
      draws: [],
      lcp: [],
      longTasks: [],
      rafStamp: 0,
      blockedContexts: 0,
    };
    window.__journeyAudit = audit;
    document.addEventListener('securitypolicyviolation', (event) => {
      audit.csp.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
    });
    const originalRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      originalRaf((stamp) => {
        audit.rafStamp = stamp;
        callback(stamp);
      });
    for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const method of [
        'drawArrays',
        'drawElements',
        'drawArraysInstanced',
        'drawElementsInstanced',
      ]) {
        const original = Reflect.get(prototype, method) as unknown;
        if (typeof original !== 'function') continue;
        Object.defineProperty(prototype, method, {
          configurable: true,
          writable: true,
          value: function (this: WebGLRenderingContext, ...args: unknown[]) {
            if (audit.draws.at(-1) !== audit.rafStamp) audit.draws.push(audit.rafStamp);
            return Reflect.apply(original, this, args);
          },
        });
      }
    }
    if (PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint')) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const candidate = entry as PerformanceEntry & { element?: Element };
          audit.lcp.push({ time: entry.startTime, tag: candidate.element?.tagName ?? '' });
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    }
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      new PerformanceObserver((list) => {
        audit.longTasks.push(...list.getEntries().map((entry) => entry.duration));
      }).observe({ type: 'longtask', buffered: true });
    }
  });
  return errors;
}

async function capture(page: Page, info: TestInfo, name: string): Promise<void> {
  // Capture the real WebGL canvas after the damped camera has settled.
  await page.waitForTimeout(650);
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
}

async function attach(info: TestInfo, name: string, data: unknown): Promise<void> {
  const path = info.outputPath(name);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  await info.attach(name, { contentType: 'application/json', path });
}

async function assertHealthy(page: Page, info: TestInfo, errors: string[]): Promise<void> {
  const result = await new AxeBuilder({ page }).analyze();
  await attach(info, 'landing-accessibility.json', {
    passes: result.passes.length,
    violations: result.violations,
    incomplete: result.incomplete.map((entry) => entry.id),
  });
  expect(result.passes.length).toBeGreaterThan(0);
  expect(result.violations).toEqual([]);
  const csp = await page.evaluate(() => window.__journeyAudit?.csp);
  expect(csp).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  );
}

for (const width of [1440, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`landing 3D — ${width}px ${theme}, four scroll chapters and incident recovery`, async ({
      page,
    }, info) => {
      const errors = await observe(page);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'no-preference' });
      await page.addInitScript((value) => localStorage.setItem('dlp.theme', value), theme);
      await openScreen(page, '/', 'anon');
      const journey = page.getByTestId('landing-journey');
      await expect(journey).toHaveAttribute('data-scene-state', 'ready');
      await capture(page, info, `home-${width}-${theme}-hero`);
      const drawCounts: number[] = [];
      for (let stage = 0; stage < 4; stage += 1) {
        await page.getByTestId(`journey-stage-button-${stage}`).click();
        await expect(journey).toHaveAttribute('data-stage', String(stage));
        await capture(page, info, `home-${width}-${theme}-stage-${stage}`);
        drawCounts.push(await page.evaluate(() => window.__journeyAudit?.draws.length ?? 0));
      }
      expect(drawCounts[0]).toBeGreaterThan(0);
      for (let stage = 1; stage < 4; stage += 1) {
        expect(drawCounts[stage]).toBeGreaterThan(drawCounts[stage - 1] ?? 0);
      }
      await page.getByTestId('journey-fault').click();
      await expect(journey).toHaveAttribute('data-event', 'fault');
      await capture(page, info, `home-${width}-${theme}-fault`);
      await assertHealthy(page, info, errors);
      await page.getByTestId('journey-recover').click();
      await expect(journey).toHaveAttribute('data-event', 'recovered');
      await capture(page, info, `home-${width}-${theme}-recovered`);
      await page.getByTestId('journey-stage-button-0').click();
      await expect(journey).toHaveAttribute('data-stage', '0');
      await attach(info, 'landing-render-progress.json', { width, theme, drawCounts });
      expect(errors).toEqual([]);
    });
  }
}

test('landing 3D — native wheel, keyboard and reverse scrolling update the chapter', async ({
  page,
}, info) => {
  await observe(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openScreen(page, '/', 'anon');
  const journey = page.getByTestId('landing-journey');
  await page.getByTestId('journey-stage-button-0').click();
  await expect(journey).toHaveAttribute('data-scene-state', 'ready');
  await expect(journey).toHaveAttribute('data-stage', '0');
  const firstHeading = page.getByTestId('journey-chapter-0').getByRole('heading', { level: 1 });
  const firstTop = (await firstHeading.boundingBox())?.y;
  expect(firstTop).toBeDefined();
  for (let chapter = 1; chapter < 4; chapter += 1) {
    await expect(
      page.getByTestId(`journey-chapter-${chapter}`).getByRole('heading', { level: 2 }),
    ).toBeVisible();
  }
  const start = await page.evaluate(() => window.scrollY);
  for (let step = 0; step < 12 && (await journey.getAttribute('data-stage')) === '0'; step += 1) {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(100);
  }
  await expect(journey).not.toHaveAttribute('data-stage', '0');
  const wheeled = await page.evaluate(() => window.scrollY);
  expect(wheeled).toBeGreaterThan(start);
  const movedTop = (await firstHeading.boundingBox())?.y;
  expect(movedTop).toBeDefined();
  expect(
    (firstTop ?? 0) - (movedTop ?? 0),
    'The first heading must travel with the document, not stay pinned',
  ).toBeGreaterThan(200);
  await page.keyboard.press('PageDown');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(wheeled);
  for (let step = 0; step < 16 && (await journey.getAttribute('data-stage')) !== '0'; step += 1) {
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(100);
  }
  await expect(journey).toHaveAttribute('data-stage', '0');
  await attach(info, 'native-scroll.json', {
    start,
    wheeled,
    firstHeadingTop: firstTop,
    firstHeadingTopAfterWheel: movedTop,
    reversed: await page.evaluate(() => window.scrollY),
  });
  await page.getByTestId('journey-stage-button-3').focus();
  await page.keyboard.press('Enter');
  await expect(journey).toHaveAttribute('data-stage', '3');
  await expect
    .poll(() =>
      page
        .getByTestId('journey-chapter-3')
        .evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('journey-fault')).toBeFocused();
});

test('landing 3D — reduced motion keeps all chapters readable without WebGL work', async ({
  page,
}, info) => {
  const errors = await observe(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openScreen(page, '/', 'anon');
  const journey = page.getByTestId('landing-journey');
  await journey.scrollIntoViewIfNeeded();
  await expect(journey).toHaveAttribute('data-scene-state', 'fallback');
  for (let stage = 0; stage < 4; stage += 1) {
    await page.getByTestId(`journey-stage-button-${stage}`).click();
    await expect(journey).toHaveAttribute('data-stage', String(stage));
  }
  await capture(page, info, 'home-390-reduced-motion');
  expect(await page.evaluate(() => window.__journeyAudit?.draws.length)).toBe(0);
  await assertHealthy(page, info, errors);
});

test('landing 3D — unavailable WebGL preserves controls and fallback information', async ({
  page,
}, info) => {
  await observe(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
        if (/webgl|experimental-webgl/.test(kind)) {
          if (window.__journeyAudit) window.__journeyAudit.blockedContexts += 1;
          return null;
        }
        return Reflect.apply(original, this, [kind, ...args]);
      },
    });
  });
  await openScreen(page, '/', 'anon');
  const journey = page.getByTestId('landing-journey');
  await journey.scrollIntoViewIfNeeded();
  await expect(journey).toHaveAttribute('data-scene-state', 'fallback');
  expect(await page.evaluate(() => window.__journeyAudit?.blockedContexts)).toBeGreaterThan(0);
  await page.getByTestId('journey-stage-button-3').click();
  await expect(journey).toHaveAttribute('data-stage', '3');
  await page.getByTestId('journey-fault').click();
  await expect(journey).toHaveAttribute('data-event', 'fault');
  await page.getByTestId('journey-recover').click();
  await expect(journey).toHaveAttribute('data-event', 'recovered');
  await capture(page, info, 'home-no-webgl');
  expect(await page.evaluate(() => window.__journeyAudit?.draws.length)).toBe(0);
  expect(await page.evaluate(() => window.__journeyAudit?.csp)).toEqual([]);
});

test('landing 3D — lost WebGL context recovers to readable fallback', async ({ page }, info) => {
  await observe(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openScreen(page, '/', 'anon');
  const journey = page.getByTestId('landing-journey');
  await journey.scrollIntoViewIfNeeded();
  await expect(journey).toHaveAttribute('data-scene-state', 'ready');
  const induced = await journey.evaluate((element) => {
    const canvas = element.querySelector('canvas');
    const gl = canvas?.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  expect(induced, 'The browser must actually lose an existing WebGL context').toBe(true);
  await expect(journey).toHaveAttribute('data-scene-state', 'fallback');
  await page.getByTestId('journey-stage-button-2').click();
  await expect(journey).toHaveAttribute('data-stage', '2');
  await capture(page, info, 'home-context-lost');
});

test('landing 3D — report real rendered frames and DOM LCP separately', async ({ page }, info) => {
  await observe(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openScreen(page, '/', 'anon');
  const lcp = await page.evaluate(() => window.__journeyAudit?.lcp.at(-1));
  expect(lcp, 'Missing LCP is unknown, never zero').toBeDefined();
  expect(lcp?.time).toBeGreaterThan(0);
  expect(lcp?.time).toBeLessThan(2500);
  const journey = page.getByTestId('landing-journey');
  await page.getByTestId('journey-stage-button-0').click();
  await expect(journey).toHaveAttribute('data-scene-state', 'ready');
  const sample = await journey.evaluate(async (element) => {
    const audit = window.__journeyAudit;
    if (!audit) throw new Error('Collector not installed');
    const gl = element.querySelector('canvas')?.getContext('webgl2');
    if (!gl) throw new Error('Ready scene has no WebGL2 context');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debug
      ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    audit.draws = [];
    audit.longTasks = [];
    const intervals: number[] = [];
    const start = window.scrollY;
    const distance = Math.max(
      500,
      element.getBoundingClientRect().height - window.innerHeight - 100,
    );
    let previous = 0;
    await new Promise<void>((resolve) => {
      let frame = 0;
      const tick = (stamp: number) => {
        if (previous) intervals.push(stamp - previous);
        previous = stamp;
        window.scrollTo({ top: start + (distance * frame) / 180, behavior: 'instant' });
        frame += 1;
        if (frame <= 180) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    const ordered = intervals.slice().sort((a, b) => a - b);
    return {
      renderer,
      viewport: { width: innerWidth, height: innerHeight },
      dpr: devicePixelRatio,
      rafSamples: intervals.length,
      renderedFrames: audit.draws.length,
      rafMedianMs: ordered[Math.floor(ordered.length * 0.5)],
      rafP95Ms: ordered[Math.floor(ordered.length * 0.95)],
      targetP95Ms: 32,
      targetMet: (ordered[Math.floor(ordered.length * 0.95)] ?? Infinity) <= 32,
      rafMaximumMs: ordered.at(-1),
      longTasksMs: audit.longTasks,
      elapsedMs: intervals.reduce((sum, value) => sum + value, 0),
      jsResources: performance
        .getEntriesByType('resource')
        .filter((entry) => new URL(entry.name).pathname.endsWith('.js'))
        .map((entry) => {
          const resource = entry as PerformanceResourceTiming;
          return {
            path: new URL(resource.name).pathname,
            encodedBodyBytes: resource.encodedBodySize,
            decodedBodyBytes: resource.decodedBodySize,
            transferBytes: resource.transferSize,
          };
        }),
      scope: 'Local Chromium RAF intervals and observed WebGL draw frames; not field FPS or INP.',
    };
  });
  await attach(info, 'landing-frame-sample.json', { lcp, ...sample });
  expect(sample.rafSamples).toBe(180);
  expect(sample.renderedFrames).toBeGreaterThan(20);
  expect(
    sample.renderer,
    'This acceptance target requires the actual hardware graphics path',
  ).not.toMatch(/swiftshader|llvmpipe|software/i);
  expect(
    sample.rafP95Ms,
    `p95 on ${sample.renderer} exceeds the agreed 32ms target`,
  ).toBeLessThanOrEqual(32);
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 768, height: 600 },
]) {
  test(`landing 3D — ${viewport.width}x${viewport.height} keeps incident controls inside the viewport`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openScreen(page, '/', 'anon');
    const journey = page.getByTestId('landing-journey');
    await page.getByTestId('journey-stage-button-3').click();
    await expect(journey).toHaveAttribute('data-stage', '3');
    await expect(journey).toHaveAttribute('data-scene-state', 'ready');
    await page.waitForTimeout(700);
    await page.getByTestId('journey-fault').scrollIntoViewIfNeeded();
    for (const id of ['journey-fault', 'journey-recover']) {
      const bounds = await page.getByTestId(id).boundingBox();
      expect(bounds).not.toBeNull();
      if (!bounds) throw new Error(`${id} has no rendered box`);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    }
    await page.getByTestId('journey-fault').click();
    await expect(journey).toHaveAttribute('data-event', 'fault');
    await page.getByTestId('journey-recover').click();
    await expect(journey).toHaveAttribute('data-event', 'recovered');
    await capture(page, info, `home-${viewport.width}x${viewport.height}-controls`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
  });
}

test('landing 3D — demand renderer sleeps when idle and wakes through lower page sections', async ({
  page,
}, info) => {
  await observe(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openScreen(page, '/', 'anon');
  const journey = page.getByTestId('landing-journey');
  await page.getByTestId('journey-stage-button-1').click();
  await expect(journey).toHaveAttribute('data-scene-state', 'ready');
  await expect(journey).toHaveAttribute('data-stage', '1');
  await page.mouse.move(0, 0);
  // The damped camera is allowed to settle; then a quiet interval must do no GPU draws.
  await page.waitForTimeout(2000);
  const beforeIdle = await page.evaluate(() => window.__journeyAudit?.draws.length ?? 0);
  await page.waitForTimeout(500);
  const afterIdle = await page.evaluate(() => window.__journeyAudit?.draws.length ?? 0);
  expect(beforeIdle).toBeGreaterThan(0);
  expect(afterIdle).toBe(beforeIdle);
  await page.getByTestId('landing-lab-preview').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await expect
    .poll(() => page.evaluate(() => window.__journeyAudit?.draws.length ?? 0))
    .toBeGreaterThan(afterIdle);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(2000);
  const beforeLowerIdle = await page.evaluate(() => window.__journeyAudit?.draws.length ?? 0);
  await page.waitForTimeout(500);
  const afterLowerIdle = await page.evaluate(() => window.__journeyAudit?.draws.length ?? 0);
  expect(afterLowerIdle).toBe(beforeLowerIdle);
  await page.getByTestId('journey-stage-button-0').click();
  await expect(journey).toHaveAttribute('data-stage', '0');
  await expect
    .poll(() => page.evaluate(() => window.__journeyAudit?.draws.length ?? 0))
    .toBeGreaterThan(afterLowerIdle);
  await attach(info, 'landing-sleep-wake.json', {
    beforeIdle,
    afterIdle,
    beforeLowerIdle,
    afterLowerIdle,
  });
});

test('landing 3D — a failed lazy renderer chunk leaves chapter information usable', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let blockedChunk = '';
  await page.route('**/_next/static/chunks/*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    // Discover the actual emitted renderer chunk by its palette boundary, not a stale hash.
    if (body.includes('--journey-') && body.includes('powerPreference')) {
      blockedChunk = new URL(route.request().url()).pathname;
      await route.abort('failed');
      return;
    }
    await route.fulfill({ response, body });
  });
  await openScreen(page, '/', 'anon');
  const journey = page.getByTestId('landing-journey');
  await journey.scrollIntoViewIfNeeded();
  await expect(journey).toHaveAttribute('data-scene-state', 'fallback');
  expect(blockedChunk, 'An actual renderer JS request must have been blocked').not.toBe('');
  await page.getByTestId('journey-stage-button-3').click();
  await expect(journey).toHaveAttribute('data-stage', '3');
  await page.getByTestId('journey-fault').click();
  await expect(journey).toHaveAttribute('data-event', 'fault');
  await page.getByTestId('journey-recover').click();
  await expect(journey).toHaveAttribute('data-event', 'recovered');
  await attach(info, 'landing-blocked-chunk.json', { blockedChunk });
  await capture(page, info, 'home-renderer-chunk-failed');
});

test('landing 3D — the model follows lower sections and terminal scroll never runs a command', async ({
  page,
}, info) => {
  const errors = await observe(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openScreen(page, '/', 'anon');
  await expect(page.getByTestId('landing-journey')).toHaveAttribute('data-scene-state', 'ready');
  const preview = page.getByTestId('landing-lab-preview');
  const output = page.getByTestId('landing-demo-output');
  const positions = [];
  for (const kind of ['terminal', 'catalog', 'curriculum', 'practice', 'closing']) {
    const section = page.getByTestId(`journey-section-${kind}`);
    await section.scrollIntoViewIfNeeded();
    await capture(page, info, `home-flow-${kind}`);
    const position = await section.evaluate((element) => {
      const anchor = element.querySelector('[data-journey-anchor]');
      if (!anchor) throw new Error('The section has no measured scene destination');
      const box = anchor.getBoundingClientRect();
      return {
        anchorX: (box.left + box.width / 2) / window.innerWidth,
        anchorY: (box.top + box.height / 2) / window.innerHeight,
        draws: window.__journeyAudit?.draws.length ?? 0,
      };
    });
    positions.push({ kind, ...position });
  }
  expect(positions.every((sample) => sample.draws > 0)).toBe(true);
  const anchorXs = positions.map((sample) => sample.anchorX);
  expect(Math.max(...anchorXs) - Math.min(...anchorXs)).toBeGreaterThan(0.5);
  await attach(info, 'landing-lower-sections.json', positions);
  const stages = new Set<string>();
  const progressValues = new Set<string>();
  for (const fraction of [0, 0.35, 0.7, 1]) {
    await preview.evaluate((element, part) => {
      const box = element.getBoundingClientRect();
      const top = window.scrollY + box.top;
      window.scrollTo({
        top: top - window.innerHeight * 0.9 + (window.innerHeight + box.height) * part,
        behavior: 'instant',
      });
    }, fraction);
    await page.waitForTimeout(200);
    const value = await preview.evaluate((element) => ({
      stage: element.getAttribute('data-scroll-stage'),
      progress: (element as HTMLElement).style.getPropertyValue('--bench-progress'),
    }));
    if (value.stage) stages.add(value.stage);
    progressValues.add(value.progress);
    await expect(preview).toHaveAttribute('data-has-run', 'false');
    await expect(output).not.toContainText(/web[\s\S]*Up[\s\S]*8080/);
  }
  expect(stages.size, 'Scrolling must change the terminal visual sequence').toBeGreaterThan(1);
  expect(progressValues.size).toBeGreaterThan(1);
  await preview.scrollIntoViewIfNeeded();
  await capture(page, info, 'home-color-terminal-unexecuted');
  await preview.getByRole('button', { name: 'Chạy ví dụ', exact: true }).click();
  await expect(preview).toHaveAttribute('data-has-run', 'true');
  await expect(output).toContainText(/web[\s\S]*Up[\s\S]*8080/);
  await capture(page, info, 'home-color-terminal-executed');
  await assertHealthy(page, info, errors);
});

test.describe('landing touch scrolling', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('landing 3D — a touch swipe scrolls the document through the full-viewport canvas', async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const cdp = await page.context().newCDPSession(page);
    const swipe = async () => {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 195, y: 620 }],
      });
      for (let y = 580; y >= 180; y -= 40) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: 195, y }],
        });
        await page.waitForTimeout(35);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    // Chromium's synthetic-scroll helper produced no scroll even on this control.
    // Native touch packets are proven here before testing the actual app.
    await page.setContent(
      '<meta name="viewport" content="width=device-width, initial-scale=1"><main style="height:3000px">Touch driver control</main>',
    );
    await swipe();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
    const controlScroll = await page.evaluate(() => window.scrollY);
    await openScreen(page, '/', 'anon');
    await expect(page.getByTestId('landing-journey')).toHaveAttribute('data-scene-state', 'ready');
    const start = await page.evaluate(() => window.scrollY);
    await swipe();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(start + 200);
    const end = await page.evaluate(() => window.scrollY);
    await cdp.detach();
    await attach(info, 'landing-touch-scroll.json', {
      controlScroll,
      start,
      end,
      viewport: page.viewportSize(),
    });
    await capture(page, info, 'home-touch-scroll');
  });
});

test('landing 3D — a guest curriculum link reaches the local login without an HTTPS upgrade', async ({
  page,
}) => {
  const errors = await observe(page);
  await openScreen(page, '/', 'anon');
  const curriculum = page.getByTestId('journey-section-curriculum');
  await curriculum.scrollIntoViewIfNeeded();
  await curriculum.getByRole('link').first().click();
  await expect(page).toHaveURL(`${E2E_BASE_URL}/login`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});
