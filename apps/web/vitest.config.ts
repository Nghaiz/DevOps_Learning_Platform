import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    /**
     * ⛔ CHỈ quét `src/`. Không có dòng này, glob mặc định của vitest cũng nuốt
     * `e2e/**` — mà đó là spec **Playwright**, và `test()` của Playwright ném
     * ngay khi bị gọi ngoài runner của nó:
     *
     *   FAIL  e2e/a11y.spec.ts — Playwright Test did not expect test() to be
     *   called here.
     *
     * Đo 2026-09-06: một file spec e2e chưa commit làm `pnpm --filter web test`
     * đỏ cho MỌI lane đang chạy, và thông báo lỗi không hề nói rằng vấn đề là
     * "chạy nhầm runner" — nó đọc như một test hỏng.
     *
     * Dùng `include` hẹp chứ không dùng `exclude: ['e2e/**']`: một danh sách trừ
     * phải được cập nhật mỗi lần thêm thư mục test-của-runner-khác, còn một
     * danh sách gồm thì mặc định đã đúng.
     */
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
