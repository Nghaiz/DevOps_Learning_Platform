import { THEME_NAMES, type ThemeName } from '@devops-platform/terminal/themes';

/**
 * C5/D2 — quy tắc chọn theme terminal, tách khỏi React để test được ở node.
 *
 * Thứ tự: **tuỳ chọn hồ sơ thắng**, không có thì đi theo theme ứng dụng.
 * Người dùng chọn `dlp-contrast` là một quyết định a11y (họ cần tương phản cao
 * suốt buổi); để dark-mode của trang ghi đè lên nó là bỏ qua lựa chọn đó ở đúng
 * chỗ nó quan trọng nhất.
 *
 * ⚠ Giá trị KHÔNG hợp lệ rơi về theme ứng dụng chứ không ném: nguồn của `pref`
 * là một cột `text` trong DB (`user_preferences.terminal_theme`, không phải
 * enum) và một khoá localStorage — cả hai đều sống lâu hơn danh sách theme.
 * Một theme bị đổi tên không được phép làm trắng cả trang bài học.
 */
export function resolveTerminalTheme(
  pref: ThemeName | null | undefined,
  resolvedAppTheme: 'light' | 'dark',
): ThemeName {
  if (pref != null && (THEME_NAMES as readonly string[]).includes(pref)) {
    return pref;
  }
  return resolvedAppTheme === 'dark' ? 'dlp-dark' : 'dlp-light';
}
