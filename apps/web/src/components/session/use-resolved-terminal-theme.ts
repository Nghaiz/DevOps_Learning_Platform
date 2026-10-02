'use client';

import type { ThemeName } from '@devops-platform/terminal/themes';
import { resolveTerminalTheme } from './terminal-theme';

/**
 * Theme terminal cuối cùng: tuỳ chọn hồ sơ nếu có, còn không thì theme đêm.
 *
 * Không còn đọc `useTheme()` của ứng dụng: khoang làm việc tối ở cả hai theme,
 * nên theme ứng dụng không quyết định gì ở đây nữa. Giữ dạng hook để ba trang
 * và cửa sổ riêng gọi cùng một chỗ.
 *
 * `pref` được TIÊM VÀO chứ không tự query `me.get`: một lượt gọi mạng ẩn ở đây sẽ
 * bắn thêm request trên mọi trang có terminal.
 */
export function useResolvedTerminalTheme(pref: ThemeName | null | undefined): ThemeName {
  return resolveTerminalTheme(pref);
}
