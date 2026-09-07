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

    /**
     * Mặc định của vitest là 5000ms, chọn cho test ĐƠN VỊ. Gói này còn có test
     * tích hợp đi Postgres THẬT, và dưới `turbo run` thì năm gói chạy song song
     * cùng tranh một instance Postgres — thời gian một round-trip khi ấy không
     * còn liên quan gì tới việc mã đúng hay sai.
     *
     * Đo 2026-09-06, cùng một cây mã, cùng một lượt:
     *   chạy riêng  : admin-authz + lessons-authz → 45/45 xanh, tests 4.76s
     *   dưới turbo  : hai ô ĐỎ ở 5023ms và 5249ms — "Test timed out in 5000ms"
     * Vượt trần lần lượt 23ms và 249ms. Không có gì hỏng; chỉ là tranh I/O.
     *
     * Đây là lần thứ TƯ trần 5000ms cho ra một ô đỏ giả trong phase này (trước
     * đó: `landmark-contract`, `rule-08-no-token-in-url`, `source.test.ts` của
     * gói scenario). Ba lần đầu vá đúng bằng cách bỏ công việc THỪA — chúng đọc
     * lại cùng một tập file nhiều lượt, nên gom về một lượt là hết. Ở đây KHÔNG
     * có việc thừa nào để bỏ: thời gian là round-trip DB thật.
     *
     * Vì sao nâng số KHÔNG phải là giấu một test treo: một test treo thì không
     * bao giờ kết thúc, nên nó vẫn đỏ ở 15000ms y như ở 5000ms — chỉ muộn hơn
     * 10 giây. Thứ con số này phân biệt là "chậm vì tranh tài nguyên" với
     * "không bao giờ xong", và 5000ms đang không phân biệt được.
     *
     * Cái giá của việc KHÔNG sửa lớn hơn: một suite chớp tắt dạy người ta chạy
     * lại cho tới khi xanh, và lúc đó một ô đỏ THẬT cũng bị chạy lại y hệt.
     */
    testTimeout: 15_000,
  },

  /**
   * ⛔ BẮT BUỘC — nếu không, mọi test render component ở gói này ĐỎ lúc chạy
   * trong khi typecheck vẫn XANH.
   *
   * `tsconfig.json` khai `"jsx": "preserve"` vì trong bản dựng thật Next tự
   * dịch JSX bằng SWC. Nhưng vitest không đi qua SWC — nó transform bằng
   * esbuild, và esbuild ĐỌC `tsconfig.json`. Thấy `preserve`, nó rơi về runtime
   * JSX **cổ điển** và sinh `React.createElement(...)`, trong khi mã nguồn theo
   * quy ước React 17+ không hề `import React`. Kết quả: `ReferenceError: React
   * is not defined` — ném lúc RENDER, không phải lúc biên dịch.
   *
   * Đó là lý do bẫy này khó truy: `pnpm --filter web typecheck` sạch tuyệt đối,
   * nên mọi cổng kiểu đều nói "không sao", và chỉ ô test đỏ, với một thông báo
   * không hề nhắc tới JSX hay tsconfig.
   *
   * Phát hiện 2026-09-07 khi thêm test đầu tiên cho một component của `apps/web`
   * (`workspace-panel`). Trước đó gói này gần như không có test render component
   * nào, nên cấu hình thiếu không gây triệu chứng — nó nằm đó chờ lane đầu tiên
   * viết một test như vậy. Bản vá tạm là pragma `@jsxRuntime automatic` rải trên
   * từng file; đặt ở đây thì mọi file sau này khỏi phải nhớ.
   */
  esbuild: { jsx: 'automatic' },
});
