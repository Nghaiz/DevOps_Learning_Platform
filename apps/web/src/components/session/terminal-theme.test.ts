import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEME_NAMES, type ThemeName } from '@devops-platform/terminal/themes';
import { resolveTerminalTheme } from './terminal-theme';

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

  it('ĐỐI CHỨNG DƯƠNG: subpath `.` VẪN chết ở node — vấn đề là thật, không phải giả định', async () => {
    // ⛔ Ô này là nửa chứng minh còn lại. Không có nó, ca trên chỉ nói "import
    // này chạy được" mà không nói được rằng nó chạy được VÌ subpath mới — một
    // ngày nào đó `index.ts` ngừng kéo `@xterm/*` thì cả hai đường đều sạch, và
    // ta sẽ không còn biết vì sao subpath này tồn tại.
    //
    // `await import()` chứ không `import` tĩnh: một import tĩnh hỏng sẽ giết cả
    // FILE trước khi có bài test nào đăng ký được.
    await expect(import('@devops-platform/terminal')).rejects.toThrow(/self is not defined/);
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
