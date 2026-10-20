import { defineConfig } from '@playwright/test';
import base from '../playwright.config';

/** Guest-only acceptance must not create a disposable authenticated account. */
const guestBase = { ...base };
delete guestBase.globalSetup;
// globalTeardown kế thừa từ playwright.config.ts là đường dẫn tương đối './e2e/...': nạp từ thư mục
// e2e/ thì nó thành 'e2e/e2e/...' và cả suite chết trước test đầu tiên (hỏng từ 2026-09-14).
delete guestBase.globalTeardown;

export default defineConfig(guestBase, {
  testDir: '.',
  testMatch: /landing-(?:3d|visual)\.spec\.ts/,
  testIgnore: [],
  use: {
    storageState: { cookies: [], origins: [] },
    // Full Chromium uses the same graphics path as the interactive browser.
    // The separate headless shell used SwiftShader on this Windows machine.
    channel: 'chromium',
    launchOptions: { args: process.platform === 'win32' ? ['--use-angle=d3d11'] : [] },
  },
});
