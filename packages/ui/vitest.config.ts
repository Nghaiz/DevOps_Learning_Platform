import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * `packages/ui` chạy test ở jsdom vì component ở đây là component TƯƠNG TÁC
 * (SplitPane kéo được, nút copy/exec), không còn là hàm thuần như `cn.ts`.
 *
 * ⚠ Ranh giới với `packages/terminal`: kia dùng browser-mode thật
 * (`@vitest/browser-playwright`) vì nó đo layout và WebGL. Ở đây jsdom là ĐỦ cho
 * hành vi (bấm gọi đúng callback, phím mũi tên đổi tỉ lệ, aria đúng) và KHÔNG đủ
 * cho layout (jsdom không có bố cục thật: mọi `getBoundingClientRect` trả 0).
 *
 * Hệ quả phải nhớ khi viết test: một khẳng định kiểu "kéo xong khoang trái rộng
 * 40%" đo bằng pixel trong jsdom sẽ XANH một cách vô nghĩa. Khẳng định đúng ở
 * tầng này là trên STATE quan sát được (`aria-valuenow`, style `flex-basis`),
 * còn "resize thật sự đổi bố cục" thuộc về cổng browser-mode.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
