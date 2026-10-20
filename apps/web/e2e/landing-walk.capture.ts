import { expect, test } from '@playwright/test';
import { openScreen } from './fixtures/nav';

/**
 * Bản quay màn hình tuỳ chọn của landing 3D — KHÔNG phải một cổng (`pnpm e2e:landing-video`).
 * Đuôi `.capture.ts` giữ nó ngoài `testMatch` mặc định, và lượt mã hoá video không chen vào
 * phép đo khung hình của `landing-3d.spec.ts`.
 *
 * Cuộn bằng bánh xe thật (không `scrollTo`) để video cho thấy đúng thứ người dùng thấy: Lenis
 * làm mượt, các đoạn ghim, camera bay qua sáu ga, terminal gõ lệnh theo cuộn.
 */

test.use({ storageState: { cookies: [], origins: [] } });

/** Mỗi nấc bánh xe và nhịp giữa hai nấc: ~0,9 px/ms, mỗi ga hành trình hiện chừng một giây rưỡi. */
const WHEEL_STEP_PX = 70;
const WHEEL_GAP_MS = 80;
/** Ngần này nấc liền mà trang không nhích thêm thì coi như đã chạm đáy. */
const STILL_STEPS_AT_BOTTOM = 12;

test('landing walk — scroll the whole page slowly', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openScreen(page, '/', 'anon');
  await expect(page.getByTestId('landing-root')).toHaveAttribute('data-motion', 'full');
  await expect
    .poll(() => page.getByTestId('landing-stage').getAttribute('data-scene-state'), {
      timeout: 25_000,
    })
    .toMatch(/^(?:ready|fallback)$/);
  // Để phần lộ chữ của hero chạy hết trong video trước khi bắt đầu cuộn.
  await page.waitForTimeout(1500);

  await page.mouse.move(720, 500);
  let last = -1;
  let still = 0;
  while (still < STILL_STEPS_AT_BOTTOM) {
    await page.mouse.wheel(0, WHEEL_STEP_PX);
    await page.waitForTimeout(WHEEL_GAP_MS);
    const y = await page.evaluate(() => window.scrollY);
    still = Math.abs(y - last) < 1 ? still + 1 : 0;
    last = y;
  }
  await expect
    .poll(() =>
      page.evaluate(
        () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2,
      ),
    )
    .toBe(true);
  await page.waitForTimeout(1500);
});
