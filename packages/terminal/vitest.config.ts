import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Ba project, ba tầng bằng chứng khác nhau. Tách ra vì chúng KHÔNG thay thế được
 * cho nhau, không phải vì gọn:
 *
 * - `node`    — ba khối logic thuần (state machine, parser control message,
 *               backoff). Không chạm DOM, nên ép DOM chỉ làm chậm và giấu mất
 *               việc chúng vốn không cần DOM.
 * - `gpu-on`  — Chromium mặc định: WebGL2 CÓ. Đây là đối chứng dương của `gpu-off`.
 * - `gpu-off` — Chromium với `--disable-3d-apis`: WebGL2 KHÔNG. Cảnh duy nhất
 *               chạy được nhánh fallback DOM renderer của `terminal-core.ts`.
 *
 * ⛔ `--disable-gpu` KHÔNG dùng được cho `gpu-off`, dù nó mới là thứ người ta gọi
 * là "tắt hardware acceleration". Đo 2026-08-13 trên Chrome 151, cả headless lẫn
 * headed: `--disable-gpu` vẫn cho WebGL2 qua SwiftShader ⇒ addon nạp bình thường,
 * không `console.warn` nào, nhánh fallback KHÔNG chạy. Ba cờ xoá được WebGL2 là
 * `--disable-3d-apis`, `--use-gl=disabled`, và `--disable-gpu --disable-software-rasterizer`.
 * Bảng đo đầy đủ: plans/devops-learning-platform/phase-1.md §1.G-5 Q1.
 *
 * ⛔ Hai project trình duyệt chạy CÙNG một file test và mỗi bên tự khẳng định
 * tiền đề WebGL của mình TRƯỚC mọi assertion khác. Thiếu vế đó thì ngày một bản
 * Chrome đổi hành vi cờ, `gpu-off` lặng lẽ chạy CÓ WebGL và vẫn xanh — cùng họ
 * với một suite xanh vì mọi test đều skip.
 */

const NODE_TESTS = ['src/**/*.test.ts'];
const BROWSER_TESTS = ['src/**/*.browser.test.tsx'];
/**
 * File RIÊNG, glob RIÊNG — cố ý KHÔNG khớp `*.browser.test.tsx`. Cảnh `safari15`
 * giả `userAgent`, và một UA giả rò sang `gpu-on`/`gpu-off` sẽ đổi nhánh code của
 * chính xterm ở hai project đó mà không ai chủ ý. Tách glob rẻ hơn `exclude`.
 */
const SAFARI_TESTS = ['src/**/*.safari.test.tsx'];

/** Cờ tắt hẳn WebGL2. Xem khối lý do ở trên trước khi đổi. */
const NO_WEBGL_ARGS = ['--disable-3d-apis'];

/**
 * UA của Safari 15.6.1 thật. Cần CẢ HAI vế mới chạm được nhánh ném của
 * `@xterm/addon-webgl@0.19.0`: regex `isSafari` của nó từ chối chuỗi chứa
 * "chrome", và `getSafariVersion()` đọc nhóm `Version/(\d+)`.
 */
const UA_SAFARI_15 =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.1 Safari/605.1.15';

/**
 * `__EXPECT_WEBGL2__` được TIÊM chứ không dò lúc chạy, và đó là cả điểm của nó:
 * test assert `webgl2Available() === __EXPECT_WEBGL2__`. Nếu để test tự dò rồi rẽ
 * nhánh theo kết quả, nó sẽ "thích nghi" với mọi cảnh và không bao giờ đỏ được —
 * kể cả khi cờ launch ngừng có tác dụng. Tiêm giá trị kỳ vọng biến tiền đề của
 * cảnh thành một assertion.
 */
function browserProject(name: string, args: readonly string[], expectWebgl2: boolean) {
  return {
    define: { __EXPECT_WEBGL2__: JSON.stringify(expectWebgl2) },
    test: {
      name,
      include: BROWSER_TESTS,
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({ launchOptions: { args: [...args] } }),
        instances: [{ browser: 'chromium' as const }],
      },
    },
  };
}

/**
 * `safari15` — cảnh DUY NHẤT chạm được nhánh ném trong **constructor** của
 * `@xterm/addon-webgl@0.19.0`. Đọc từ dist, nhánh đó có BA điều kiện, không phải
 * một như bản ghi 1.G-5 mô tả:
 *
 *   if (isSafari && getSafariVersion() < 16)
 *     if (!canvas.getContext('webgl2', …)) throw new Error('Webgl2 is only supported on Safari 16 and above')
 *
 * Nên phải cộng cả `--disable-3d-apis` (vế thứ ba) LẪN UA Safari 15 (hai vế đầu).
 * Đo 2026-08-13, playwright 1.62.1 headless — bảng 2×2 đầy đủ ở phase-1.md §1.G-6 R0:
 * ba tổ hợp còn lại đều KHÔNG ném, kể cả "Safari 15 nhưng vẫn có WebGL2".
 *
 * ⛔ KHÔNG thay bằng `vi.mock('@xterm/addon-webgl')`. Mock chỉ khẳng định lại niềm
 * tin của ta về vendor: ngày addon đổi thông điệp hoặc bỏ nhánh, mock vẫn ném y
 * như cũ và test vẫn xanh trong khi thứ nó gác đã biến mất. Nhánh thật đo được
 * thì không có cớ để mock.
 */
function safariProject() {
  return {
    define: { __EXPECT_WEBGL2__: JSON.stringify(false) },
    test: {
      name: 'safari15',
      include: SAFARI_TESTS,
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({
          launchOptions: { args: [...NO_WEBGL_ARGS] },
          contextOptions: { userAgent: UA_SAFARI_15 },
        }),
        instances: [{ browser: 'chromium' as const }],
      },
    },
  };
}

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', environment: 'node', include: NODE_TESTS } },
      browserProject('gpu-on', [], true),
      browserProject('gpu-off', NO_WEBGL_ARGS, false),
      safariProject(),
    ],
  },
});
