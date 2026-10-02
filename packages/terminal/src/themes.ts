import type { ITheme } from '@xterm/xterm';

/**
 * F5 — theme truecolor 24-bit.
 *
 * Cả ba bảng đều khai ĐỦ 16 màu ANSI + 5 màu giao diện. Bỏ trống một màu không
 * làm xterm dùng giá trị "hợp lý", nó dùng **mặc định của xterm** — nên một theme
 * khai nửa vời sinh ra bảng lai giữa hai theme, và lỗi đó chỉ lộ ra ở đúng những
 * lệnh dùng màu bị bỏ quên (`eza` dùng bright*, `bat` dùng cả 16).
 *
 * Image sandbox đặt `COLORTERM=truecolor` (E2) nên oh-my-posh phát mã 24-bit
 * thẳng; bảng 16 màu dưới đây chỉ áp cho chương trình phát mã ANSI cổ điển.
 */

export type ThemeName = 'dlp-dark' | 'dlp-light' | 'dlp-contrast';

export const DEFAULT_THEME: ThemeName = 'dlp-dark';

/**
 * Đêm (bản dựng lại PTIT, design-brief §7): workspace luôn tối ở cả hai theme
 * trang. Nền trùng --background tối của trang, con trỏ đỏ PTIT, vùng chọn vàng
 * tín hiệu với chữ mực. ANSI chỉnh sáng để đọc được trên nền #0A0D14.
 */
const dark: ITheme = {
  foreground: '#ECEAE3',
  background: '#0A0D14',
  cursor: '#E3261D',
  cursorAccent: '#0A0D14',
  selectionBackground: '#EFF003',
  selectionForeground: '#121829',
  black: '#1A2030',
  red: '#FF6A5E',
  green: '#3DD27E',
  yellow: '#FFC940',
  blue: '#7AA7FF',
  magenta: '#C99BFF',
  cyan: '#3FD3E2',
  white: '#D5D3CC',
  brightBlack: '#6B7387',
  brightRed: '#FF8F85',
  brightGreen: '#6BE39E',
  brightYellow: '#FFE07A',
  brightBlue: '#A3C2FF',
  brightMagenta: '#DDBEFF',
  brightCyan: '#7FE4EE',
  brightWhite: '#F6F5F1',
};

const light: ITheme = {
  foreground: '#1e293b',
  background: '#f8fafc',
  cursor: '#0284c7',
  cursorAccent: '#f8fafc',
  selectionBackground: '#cbd5e1',
  selectionForeground: '#0f172a',
  black: '#0f172a',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#e2e8f0',
  brightBlack: '#475569',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#f8fafc',
};

/**
 * Tương phản cao — nền đen tuyệt đối, chữ trắng tuyệt đối. Không phải "dark tối
 * hơn": nó tồn tại cho máy chiếu phòng lab và cho người cần tỉ lệ tương phản
 * cao hơn 7:1, nên các màu ANSI ở đây cũng bão hoà chứ không chỉ nền/chữ.
 */
const contrast: ITheme = {
  foreground: '#ffffff',
  background: '#000000',
  cursor: '#00ff00',
  cursorAccent: '#000000',
  selectionBackground: '#ffffff',
  selectionForeground: '#000000',
  black: '#000000',
  red: '#ff5555',
  green: '#00ff00',
  yellow: '#ffff00',
  blue: '#5599ff',
  magenta: '#ff55ff',
  cyan: '#00ffff',
  white: '#ffffff',
  brightBlack: '#888888',
  brightRed: '#ff8888',
  brightGreen: '#88ff88',
  brightYellow: '#ffff88',
  brightBlue: '#88bbff',
  brightMagenta: '#ff88ff',
  brightCyan: '#88ffff',
  brightWhite: '#ffffff',
};

export const THEMES: Readonly<Record<ThemeName, ITheme>> = { 'dlp-dark': dark, 'dlp-light': light, 'dlp-contrast': contrast };

export const THEME_NAMES: readonly ThemeName[] = ['dlp-dark', 'dlp-light', 'dlp-contrast'];

/**
 * F5 — persist bằng `localStorage`, KHÔNG cookie.
 *
 * Cookie đi kèm mọi request (phình header) và mở thêm một bề mặt CSRF cho một
 * lựa chọn thuần thẩm mỹ. Theme không cần server biết.
 *
 * `try/catch` không phải phòng thủ thừa: `localStorage` NÉM trong Safari private
 * mode và khi người dùng chặn cookie/site-data. Để lọt exception này thì cả
 * terminal không mount được — đổi cả tính năng lấy một tuỳ chọn màu.
 */
const STORAGE_KEY = 'dlp.terminal.theme';

function isThemeName(value: string | null): value is ThemeName {
  return value !== null && (THEME_NAMES as readonly string[]).includes(value);
}

export function loadThemeName(): ThemeName {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    return isThemeName(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveThemeName(name: ThemeName): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, name);
  } catch {
    // Không ném: theme vẫn đổi trong phiên hiện tại, chỉ là không nhớ được.
  }
}
