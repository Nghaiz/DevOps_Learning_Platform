'use client';

import type { ThemeName } from '@devops-platform/terminal/themes';
import { useTheme } from '@devops-platform/ui';
import { resolveTerminalTheme } from './terminal-theme';

/**
 * C5 — theme terminal cuối cùng: tuỳ chọn hồ sơ nếu có, còn không thì đi theo
 * `useTheme()` của C1 (`resolved === 'dark' ? 'dlp-dark' : 'dlp-light'`).
 *
 * Hook mỏng có chủ ý: toàn bộ quyết định nằm ở `resolveTerminalTheme` (hàm
 * thuần, có test ở `terminal-theme.test.ts`). Trang bài học / lab / playground
 * trước đây chốt cứng `DEFAULT_THEME`, nên bật dark mode ở vỏ ứng dụng không
 * đụng gì tới terminal — nửa màn hình sáng cạnh nửa màn hình tối, đúng thứ 13.A
 * mục 2 gọi là "một quyết định thiết kế tồi".
 *
 * `pref` được TIÊM VÀO chứ không tự query `me.get` ở đây: một hook gọi mạng ẩn
 * bên trong sẽ bắn thêm một request trên mọi trang có terminal, kể cả những
 * trang đã có sẵn dữ liệu người dùng.
 */
export function useResolvedTerminalTheme(pref: ThemeName | null | undefined): ThemeName {
  const { resolved } = useTheme();
  return resolveTerminalTheme(pref, resolved);
}
