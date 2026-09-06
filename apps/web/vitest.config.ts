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
});
