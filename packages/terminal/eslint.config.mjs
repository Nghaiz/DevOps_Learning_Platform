import base from '../../eslint.config.mjs';

export default [
  ...base,
  {
    // `scripts/*.mjs` chạy bằng Node, không phải trong trình duyệt và không nằm
    // trong `tsconfig.include` — nên không có `@types/node` nào khai `console`,
    // `URL`, `fetch`, `Buffer` cho nó, và `no-undef` của js.configs.recommended
    // báo đỏ toàn bộ. Khai globals ở đây thay vì tắt `no-undef`: tắt hẳn sẽ bỏ
    // luôn phép bắt lỗi gõ sai tên biến trong chính script đó.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        process: 'readonly',
      },
    },
  },
];
