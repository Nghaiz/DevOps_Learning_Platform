import { defineConfig, devices } from '@playwright/test';
import { ARTIFACTS_DIR, E2E_BASE_URL, E2E_ORIGIN, STORAGE_STATE } from './e2e/env';

/**
 * Harness e2e của 13.H. Hợp đồng env ở `e2e/env.ts` (D11).
 *
 * ⚠ `ignoreHTTPSErrors` — cụm lab dùng cert tự ký của CA nội bộ
 * (`infra/host/08-tls-entrypoint.sh`). Không có nó thì MỌI điều hướng chết ở
 * `net::ERR_CERT_AUTHORITY_INVALID`. Cái giá phải nói rõ: harness này KHÔNG
 * còn kiểm được chuỗi tin cậy TLS. Đó là việc của cổng khác (`08-tls-*`), và
 * đừng đọc một lượt e2e xanh thành "TLS đã đúng".
 */

/**
 * `E2E_START_SERVER=1` ⇒ Playwright tự dựng `next start` (job CI `web-a11y`).
 * Không đặt ⇒ trỏ vào một server có sẵn (cụm lab).
 */
const startServer = process.env.E2E_START_SERVER === '1';

if (startServer) {
  // Tiền đề của chính cấu hình này, khẳng định chứ không đoán: dựng server CỤC
  // BỘ mà lại trỏ test vào cụm thật thì mọi ô sẽ xanh/đỏ theo một binary khác
  // hẳn cái vừa build — và không dòng log nào nói ra điều đó.
  const host = new URL(E2E_BASE_URL).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') {
    throw new Error(
      `E2E_START_SERVER=1 nhưng E2E_BASE_URL=${E2E_BASE_URL} không trỏ về máy này ` +
        `(host=${host}). Hoặc bỏ E2E_START_SERVER, hoặc đặt ` +
        `E2E_BASE_URL=http://127.0.0.1:3000.`,
    );
  }
}

export default defineConfig({
  testDir: './e2e',
  outputDir: `${ARTIFACTS_DIR}/test-results`,
  globalSetup: './e2e/global-setup.ts',

  /**
   * `workers: 1` + `fullyParallel: false` — CỐ Ý, và không phải vì "cho chắc":
   *   - cả suite dùng CHUNG một tài khoản dùng-một-lần (D11). Hai spec song
   *     song cùng mở/đóng phiên sandbox của tài khoản đó sẽ giẫm lên nhau.
   *   - cụm lab có trần đồng thời ~20 pod (P12). Một suite tự bung 4 worker là
   *     tự đo chính cái nghẽn nó sinh ra.
   *   - `perf.spec.ts` đo LCP. Đo thời gian trong khi 3 worker khác đang tải
   *     cùng một node là đo nhiễu.
   */
  fullyParallel: false,
  workers: 1,

  /**
   * `retries: 0`. Retry là cách nhanh nhất để một suite trông xanh trong khi nó
   * đang chập chờn — và 13.H tồn tại để ĐO chất lượng, nên nó phải báo cáo đúng
   * thứ nó thấy ở lượt đầu. Một spec cần retry là một defect, không phải một
   * cấu hình cần nới.
   */
  retries: 0,
  forbidOnly: process.env.CI !== undefined,

  timeout: 60_000,
  expect: { timeout: 15_000 },

  reporter: [['list'], ['json', { outputFile: `${ARTIFACTS_DIR}/results.json` }]],

  use: {
    baseURL: E2E_BASE_URL,
    ignoreHTTPSErrors: true,
    storageState: STORAGE_STATE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    // Cụm lab đã đo 12s cho lượt tải nguội đầu tiên (2026-09-06). 45s là biên
    // cho cold start, KHÔNG phải ngân sách hiệu năng — ngân sách đó là
    // `perf.spec.ts`, và nó đo riêng.
    navigationTimeout: 45_000,

    /**
     * ⛔ CỐ Ý KHÔNG đặt `extraHTTPHeaders: { origin: E2E_ORIGIN }` ở đây.
     *
     * Nó sẽ gắn `Origin` vào CẢ điều hướng top-level, thứ trình duyệt thật
     * KHÔNG BAO GIỜ làm cho một GET gõ vào thanh địa chỉ. Harness khi đó chạy
     * một hình dạng request mà không người dùng nào tạo ra được, và bất kỳ bug
     * nào phụ thuộc sự vắng mặt của `Origin` sẽ bị che.
     *
     * `Origin` là bắt buộc ở đúng hai chỗ, và cả hai đều đặt nó tường minh:
     * `global-setup.ts` (đăng ký/đăng nhập ngoài trình duyệt) và
     * `e2e/fixtures/api.ts`. Fetch/XHR do CHÍNH trang phát ra thì trình duyệt
     * tự gắn `Origin` đúng chuẩn — không cần ta giúp.
     */
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  ...(startServer
    ? {
        webServer: {
          command: process.env.E2E_GATEWAY_URL
            ? 'node e2e/scripts/start-local-server.mjs'
            : 'pnpm start',
          url: `${E2E_BASE_URL}/login`,
          // `reuseExistingServer: false` — bám vào một server có sẵn nghĩa là
          // đo một build CŨ mà vẫn báo cáo như build vừa tạo. Cổng nào bận thì
          // hỏng ở đây, to và sớm.
          reuseExistingServer: false,
          timeout: 180_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }
    : {}),
});

export { E2E_BASE_URL, E2E_ORIGIN };
