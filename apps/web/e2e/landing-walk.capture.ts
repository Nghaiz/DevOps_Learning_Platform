import { expect, test } from '@playwright/test';
import { openScreen } from './fixtures/nav';

/** Optional user-facing page walk; excluded from timed acceptance by its file name. */
test('record the natural page flow, incident and explicit terminal action', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openScreen(page, '/', 'anon');
  await expect(page.getByTestId('landing-journey')).toHaveAttribute('data-scene-state', 'ready');
  await page.waitForTimeout(1200);
  for (const stage of [1, 2, 3]) {
    const destination = await page
      .getByTestId(`journey-chapter-${stage}`)
      .evaluate((element) =>
        Math.min(
          document.documentElement.scrollHeight - innerHeight,
          window.scrollY + element.getBoundingClientRect().top - 80,
        ),
      );
    while ((await page.evaluate(() => window.scrollY)) < destination - 30) {
      await page.mouse.wheel(0, 110);
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(700);
  }
  await page.getByTestId('journey-fault').click();
  await page.waitForTimeout(1200);
  await page.getByTestId('journey-recover').click();
  await page.waitForTimeout(900);
  for (const kind of ['terminal', 'catalog', 'curriculum', 'practice', 'closing']) {
    const destination = await page
      .getByTestId(`journey-section-${kind}`)
      .evaluate((element) =>
        Math.min(
          document.documentElement.scrollHeight - innerHeight,
          window.scrollY + element.getBoundingClientRect().top - 80,
        ),
      );
    while ((await page.evaluate(() => window.scrollY)) < destination - 30) {
      await page.mouse.wheel(0, 130);
      await page.waitForTimeout(90);
    }
    if (kind === 'terminal') {
      const preview = page.getByTestId('landing-lab-preview');
      await preview.getByRole('button', { name: 'Chạy ví dụ', exact: true }).click();
      await expect(preview).toHaveAttribute('data-has-run', 'true');
    }
    await page.waitForTimeout(900);
  }
});
