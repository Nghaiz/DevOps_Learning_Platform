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
);
