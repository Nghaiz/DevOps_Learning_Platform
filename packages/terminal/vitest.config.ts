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

/** Cờ tắt hẳn WebGL2. Xem khối lý do ở trên trước khi đổi. */
const NO_WEBGL_ARGS = ['--disable-3d-apis'];

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

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', environment: 'node', include: NODE_TESTS } },
      browserProject('gpu-on', [], true),
      browserProject('gpu-off', NO_WEBGL_ARGS, false),
    ],
  },
});
