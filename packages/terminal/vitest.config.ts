import { defineConfig } from 'vitest/config';

/**
 * `environment: 'node'` là MẶC ĐỊNH có chủ ý — ba khối logic mà F11 yêu cầu test
 * (state machine, parser control message, backoff) đều thuần tuý, không chạm DOM.
 * Ép jsdom cho cả suite chỉ làm chậm và giấu mất việc chúng vốn không cần DOM.
 *
 * File nào thật sự cần DOM tự khai bằng docblock `@vitest-environment jsdom`
 * ở đầu file (react-binding.test.tsx) — cách này giữ ranh giới hiện rõ trong
 * chính file test thay vì nằm trong một glob ở đây.
 */
export default defineConfig({
  test: {
    environment: 'node',
  },
});
