/**
 * globalTeardown — trả lại quota namespace E2E sau khi suite chạy xong.
 *
 * Cặp với lượt dọn ở đầu `global-setup.ts`. Hai lượt, không phải một, vì chúng
 * gác hai ca khác nhau:
 *
 *   - teardown  → lượt chạy KẾT THÚC bình thường. Trả quota ngay.
 *   - setup     → lượt chạy TRƯỚC chết giữa chừng (Ctrl+C, crash, mất điện),
 *                 nên teardown của nó không bao giờ chạy. Đây là lượt tự lành.
 *
 * Chỉ có teardown là không đủ: ca làm hỏng chuyện 2026-09-14 chính là ca harness
 * bị giết, và một lượt dọn chỉ ở cuối thì đúng lúc cần nhất lại không chạy.
 */

import { cleanSandboxNamespace } from './sandbox-namespace';

export default async function globalTeardown(): Promise<void> {
  await cleanSandboxNamespace('teardown');
}
