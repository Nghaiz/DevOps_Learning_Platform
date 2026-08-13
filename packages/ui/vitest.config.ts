import { defineConfig } from 'vitest/config';

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
 *
 * ⛔ CỐ Ý KHÔNG dùng `@vitejs/plugin-react`. Bản đầu có nó và cả package không
 * chạy nổi một test nào: `@vitejs/plugin-react@6` peer-require `vite@^8`, còn
 * workspace này ghim `vite@7.3.6` (vitest 4 kéo về), nên nó nạp
 * `vite/internal` — một subpath `exports` không tồn tại ở vite 7 — và ném
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` TRƯỚC khi bất kỳ file test nào được nạp.
 *
 * Plugin đó vốn không cần: nó phục vụ Fast Refresh (vô nghĩa trong test), còn
 * JSX thì esbuild của vitest đã tự dịch theo `"jsx": "react-jsx"` trong
 * `tsconfig.json`. Thêm nó là đổi một cổng test đang chạy được lấy một lỗi nạp
 * config.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    // ⛔ `globals: true` là BẮT BUỘC ở đây, không phải sở thích. Auto-cleanup của
    // @testing-library/react tự đăng ký vào `afterEach` TOÀN CỤC; với
    // `globals: false` nó im lặng không đăng ký được, nên DOM của test trước còn
    // nguyên khi test sau chạy. Triệu chứng không hề trỏ về nguyên nhân:
    // `getByRole('progressbar')` ném "multiple elements found" ở một test chỉ
    // render đúng MỘT progressbar.
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
