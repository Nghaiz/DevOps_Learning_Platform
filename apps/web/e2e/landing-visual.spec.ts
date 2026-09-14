import { t } from '@devops-platform/copy';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/api';
import { openScreen } from './fixtures/nav';

test.use({ storageState: { cookies: [], origins: [] } });

async function returnToTop(page: Page): Promise<void> {
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

for (const width of [1440, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`landing — ${width}px ${theme}, interactive preview and theme change`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.emulateMedia({
        colorScheme: theme,
        reducedMotion: width === 390 ? 'reduce' : 'no-preference',
      });
      await page.addInitScript((value) => localStorage.setItem('dlp.theme', value), theme);
      await openScreen(page, '/', 'anon');
      await returnToTop(page);
      await page.screenshot({ path: testInfo.outputPath(`home-${width}-${theme}-hero.png`) });
      const preview = page.getByTestId('landing-lab-preview');
      const output = page.getByTestId('landing-demo-output');
      await preview.scrollIntoViewIfNeeded();
      await expect(preview.getByRole('button', { name: 'Docker', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(preview).toContainText('không kết nối sandbox');
      for (const example of [
        { topic: 'Docker', result: /web[\s\S]*Up[\s\S]*8080/ },
        { topic: 'Linux', result: /-rwxr--r--/ },
        { topic: 'Kubernetes', result: /web[\s\S]*1\/1/ },
      ]) {
        const topic = preview.getByRole('button', { name: example.topic, exact: true });
        await topic.click();
        await expect(topic).toHaveAttribute('aria-pressed', 'true');
        await expect(output).not.toHaveText(example.result);
        await preview.getByRole('button', { name: 'Chạy ví dụ', exact: true }).click();
        await expect(output).toContainText(example.result);
        await expect(
          preview.getByRole('button', { name: 'Đã chạy ví dụ', exact: true }),
        ).toBeDisabled();
      }
      await page.screenshot({ path: testInfo.outputPath(`home-${width}-${theme}-preview.png`) });
      await returnToTop(page);
      await page.screenshot({
        path: testInfo.outputPath(`home-${width}-${theme}-full.png`),
        fullPage: true,
      });
      await preview.getByRole('button', { name: 'Đặt lại ví dụ', exact: true }).click();
      await expect(preview.getByRole('button', { name: 'Chạy ví dụ', exact: true })).toBeEnabled();
      await expect(output).not.toContainText(/web[\s\S]*1\/1/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      const nextTheme = theme === 'light' ? 'dark' : 'light';
      await page.getByRole('button', { name: t('shell.theme.label'), exact: true }).click();
      await page
        .getByRole('menuitem', { name: t(`shell.theme.choice.${nextTheme}`), exact: true })
        .click();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
        .toBe(nextTheme === 'dark');
      await preview.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`home-${width}-${theme}-to-${nextTheme}.png`),
      });
    });
  }
}
