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
 * Mực: workspace luôn tối ở cả hai theme trang, nền trùng `--code-bg` tối của hệ
 * giao diện. Con trỏ màu cúc vạn thọ của logo, vùng chọn xanh mực với chữ sáng.
 *
 * Mọi màu sinh từ OKLCH (sáng đều theo cảm nhận), rồi đổi ra hex vì xterm chỉ nhận
 * chuỗi màu CSS cũ. Màu chữ thường đạt ≥ 6,9:1 trên nền; `brightBlack` (chữ mờ như
 * chú thích, gợi ý) đạt 4,8:1, vẫn qua ngưỡng 4,5 của WCAG AA.
 */
const dark: ITheme = {
  foreground: '#E4E8ED',
  background: '#0D1013',
  cursor: '#F8BD40',
  cursorAccent: '#0D1013',
  selectionBackground: '#274972',
  selectionForeground: '#EFF2F6',
  black: '#2A2E34',
  red: '#F5746D',
  green: '#67D283',
  yellow: '#F1C955',
  blue: '#74AEF5',
  magenta: '#D58FE5',
  cyan: '#64D1D7',
  white: '#D4D8DD',
  brightBlack: '#7B8189',
  brightRed: '#FF958D',
  brightGreen: '#8CE6A0',
  brightYellow: '#FEDF80',
  brightBlue: '#94C5FF',
  brightMagenta: '#E4ADF1',
  brightCyan: '#93E5E9',
  brightWhite: '#F3F5F8',
};

/**
 * Giấy: cho người chọn terminal sáng. Nền trùng `--canvas` sáng; màu ANSI hạ độ sáng
 * để chữ thường đạt ≥ 4,8:1. Dòng "bright" TỐI hơn dòng thường, vì trên nền sáng
 * "nổi bật hơn" nghĩa là đậm hơn, không phải nhạt hơn.
 */
const light: ITheme = {
  foreground: '#22272E',
  background: '#F8FAFD',
  cursor: '#1E6CBF',
  cursorAccent: '#F8FAFD',
  selectionBackground: '#C5DDFC',
  selectionForeground: '#171B22',
  black: '#22272E',
  red: '#C2272D',
  green: '#137738',
  yellow: '#9D6300',
  blue: '#1D60BC',
  magenta: '#943CA7',
  cyan: '#087988',
  white: '#D4D8DD',
  brightBlack: '#5E646B',
  brightRed: '#A51E24',
  brightGreen: '#09672E',
  brightYellow: '#8A5600',
  brightBlue: '#1351A6',
  brightMagenta: '#7F2C91',
  brightCyan: '#056774',
  brightWhite: '#393D45',
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
