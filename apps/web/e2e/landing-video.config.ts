import { defineConfig } from '@playwright/test';
import guest from './landing.config';

/** Optional visual deliverable; keep video encoding outside the frame-timing run. */
export default defineConfig(guest, {
  testMatch: 'landing-walk.capture.ts',
  use: { video: { mode: 'on', size: { width: 1440, height: 1000 } } },
});
