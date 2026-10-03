import { THEME_NAMES, type ThemeName } from '@devops-platform/terminal/themes';

/**
 * Quy tắc chọn theme terminal, tách khỏi React để test được ở node.
 *
 * Thứ tự: **tuỳ chọn hồ sơ thắng**; không có thì theme ĐÊM (`dlp-dark`), dù ứng
 * dụng đang sáng hay tối. Khoang làm việc tối ở cả hai theme (design brief §7):
 * một terminal sáng trên trang sáng không có ranh giới nào với phần đọc bài.
 *
 * Người dùng chọn `dlp-contrast` hay `dlp-light` trong cài đặt là một quyết định
 * có chủ đích (a11y, máy chiếu phòng lab), nên nó vẫn thắng.
 *
 * ⚠ Giá trị KHÔNG hợp lệ rơi về theme đêm chứ không ném: nguồn của `pref` là một
 * cột `text` trong DB và một khoá localStorage, cả hai sống lâu hơn danh sách theme.
 */
export function resolveTerminalTheme(pref: ThemeName | null | undefined): ThemeName {
  if (pref != null && (THEME_NAMES as readonly string[]).includes(pref)) {
    return pref;
  }
  return 'dlp-dark';
}
