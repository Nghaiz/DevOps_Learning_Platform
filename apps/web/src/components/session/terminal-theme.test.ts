import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEME_NAMES, type ThemeName } from '@devops-platform/terminal/themes';
import { resolveTerminalTheme } from './terminal-theme';

const TERMINAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../packages/terminal');

/**
 * D14 — cổng giữ subpath **server-an-toàn** `@devops-platform/terminal/themes`.
 *
 * File này chạy ở project vitest của `apps/web`, `environment: 'node'` — cùng
 * cảnh với `appRouter` và với mọi test import nó. Đó là điểm: chỗ duy nhất có
 * thể chứng minh "import được từ phía server" là một tiến trình node thật, chứ
 * không phải một trang React.
 *
 * `me.ts` hiện CHÉP TAY ba tên theme kèm một khối chú thích giải thích vì sao
 * (import `"."` chết bằng `ReferenceError: self is not defined`). Bản chép tay
 * đó nay bỏ được — nhưng `me.ts` thuộc lane khác, nên D1 chỉ mở đường và ghi
 * lại bằng chứng; xem report.
 */
describe('subpath ./themes — nạp sạch ở node', () => {
  it('THEME_NAMES là ba theme, và import tĩnh ở đầu file này đã KHÔNG ném', () => {
    // Nếu subpath kéo theo `@xterm/*`, file này chết ở dòng `import` phía trên
    // và vitest báo "0 test" — không có assertion nào chạy tới đây được.
    expect([...THEME_NAMES]).toEqual(['dlp-dark', 'dlp-light', 'dlp-contrast']);
    expect(DEFAULT_THEME).toBe('dlp-dark');
  });

  it('ĐỐI CHỨNG TĨNH: subpath tồn tại, và themes.ts KHÔNG có import giá trị nào từ @xterm', () => {
    // ⛔ Bản đầu của ô này là `await expect(import('@devops-platform/terminal'))
    //    .rejects.toThrow(/self is not defined/)` — nó XANH khi chạy một mình
    //    và ĐỎ khi chạy cả suite. Lý do: vite pre-bundle dependency, và sau lần
    //    tối ưu đầu tiên `@devops-platform/terminal` phân giải sang bản ESM
    //    (`xterm.mjs`, không đụng `self`) thay vì bản UMD (`xterm.js`, có đụng).
    //    Một cổng đổi màu theo cache của bundler không gác được gì cả — nó chỉ
    //    thêm nhiễu. Thay bằng phép kiểm TĨNH, xác định, đọc thẳng file nguồn.
    const pkg = JSON.parse(
      readFileSync(resolve(TERMINAL_ROOT, 'package.json'), 'utf8'),
    ) as { exports: Record<string, string> };
    expect(pkg.exports['./themes']).toBe('./src/themes.ts');

    // Vế thật sự đáng gác: `themes.ts` chỉ được phép chạm `@xterm` bằng
    // `import type` (bị xoá lúc biên dịch). Thêm một import GIÁ TRỊ vào đây là
    // subpath "an toàn cho server" lặng lẽ hết an toàn, và triệu chứng sẽ nổ ra
    // ở `appRouter` chứ không ở file này.
    const themesSource = readFileSync(resolve(TERMINAL_ROOT, 'src/themes.ts'), 'utf8');
    const xtermImports = themesSource.match(/^import .*@xterm.*$/gm) ?? [];
    expect(xtermImports.length).toBeGreaterThan(0);
    for (const line of xtermImports) {
      expect(line).toMatch(/^import type /);
    }

    // Và vế giải thích vì sao subpath phải tồn tại: `"."` re-export đúng hai
    // file browser-only đó.
    const indexSource = readFileSync(resolve(TERMINAL_ROOT, 'src/index.ts'), 'utf8');
    expect(indexSource).toContain("from './terminal-core.ts'");
    expect(indexSource).toContain("from './terminal-surface.tsx'");
  });
});

describe('resolveTerminalTheme — C5', () => {
  it('không có tuỳ chọn hồ sơ ⇒ đi theo theme ứng dụng', () => {
    expect(resolveTerminalTheme(null, 'dark')).toBe('dlp-dark');
    expect(resolveTerminalTheme(null, 'light')).toBe('dlp-light');
    expect(resolveTerminalTheme(undefined, 'dark')).toBe('dlp-dark');
  });

  it('tuỳ chọn hồ sơ THẮNG theme ứng dụng — kể cả khi ngược nhau', () => {
    expect(resolveTerminalTheme('dlp-light', 'dark')).toBe('dlp-light');
    expect(resolveTerminalTheme('dlp-contrast', 'light')).toBe('dlp-contrast');
  });

  it('giá trị lạ (DB cũ, localStorage cũ) rơi về theme ứng dụng, không ném', () => {
    expect(resolveTerminalTheme('solarized' as ThemeName, 'dark')).toBe('dlp-dark');
    expect(resolveTerminalTheme('' as ThemeName, 'light')).toBe('dlp-light');
  });
});
