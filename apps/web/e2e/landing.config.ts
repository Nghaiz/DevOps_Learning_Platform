import { defineConfig } from '@playwright/test';
import base from '../playwright.config';

/** Guest-only acceptance must not create a disposable authenticated account. */
const guestBase = { ...base };
delete guestBase.globalSetup;

export default defineConfig(guestBase, {
  testDir: '.',
  testMatch: /landing-(?:3d|visual)\.spec\.ts/,
  use: {
    storageState: { cookies: [], origins: [] },
    // Full Chromium uses the same graphics path as the interactive browser.
    // The separate headless shell used SwiftShader on this Windows machine.
    channel: 'chromium',
    launchOptions: { args: process.platform === 'win32' ? ['--use-angle=d3d11'] : [] },
  },
});
