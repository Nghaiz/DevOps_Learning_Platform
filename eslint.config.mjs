import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Base dùng chung. Mỗi package có eslint.config.mjs riêng re-export cái này,
// để `eslint .` chạy đúng khi turbo đặt cwd ở thư mục package.
export default tseslint.config(
  {
    // `**/gen/**` khớp ở mọi độ sâu: SSOT là proto/, không lint sản phẩm codegen.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/gen/**',
      // next-env.d.ts do Next TỰ SINH và tự ghi đè mỗi lần dev/build — không
      // sửa tay được (triple-slash reference là format Next chọn), nên không lint.
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // `scripts/**/*.mjs` chạy bằng Node, không phải trong trình duyệt, và không
    // nằm trong `tsconfig.include` — nên không có `@types/node` nào khai
    // `console`/`fetch`/`Buffer`/`process` cho chúng, và `no-undef` của
    // js.configs.recommended báo đỏ toàn bộ. Khai globals thay vì tắt
    // `no-undef`: tắt hẳn sẽ bỏ luôn phép bắt lỗi gõ sai tên biến.
    //
    // Ở BASE chứ không lặp lại trong từng package: packages/terminal đã cần
    // đúng khối này, packages/scenario là chỗ thứ hai — ngưỡng rule-of-two của
    // `code-conventions.md` § No Duplicated Logic.
    //
    // `no-console` tắt hẳn ở đây (khác mặc định chỉ cho warn/error): với một CLI
    // thì stdout CHÍNH LÀ sản phẩm, và ép nó dùng `console.warn` là đẩy output
    // sang stderr — hỏng mọi lần ai đó pipe kết quả đi chỗ khác.
    // Glob `**/scripts/**/*.mjs` chứ không `scripts/**/*.mjs`: bản hẹp chỉ khớp
    // thư mục `scripts/` ở GỐC package, nên `apps/web/e2e/scripts/*.mjs` (công
    // cụ của harness e2e) rơi ra ngoài và ăn nguyên bộ `no-undef` — đo
    // 2026-09-07, 16 lỗi cho một file 70 dòng. Nới ra là thay đổi CỘNG THÊM:
    // nó chỉ khai thêm globals cho các file vốn đang đỏ, không nới lỏng gì cho
    // file nào đang xanh.
    files: ['**/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
);
