import {
  BookOpen,
  CircleUser,
  FlaskConical,
  Gamepad2,
  ListChecks,
  PenLine,
  Route,
  Settings,
  ShieldCheck,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react';

/**
 * Icon cho từng mục điều hướng — tra theo `href`, KHÔNG gắn vào `NavItem`.
 *
 * Vì sao tách khỏi `nav.ts` thay vì thêm một field `icon` vào `PRIMARY_NAV`:
 * `nav.test.ts` khẳng định `PRIMARY_NAV` bằng `toEqual([{ href, label }, …])`,
 * và `toEqual` so CẢ các key thừa — thêm `icon` vào mỗi object là làm đỏ hợp
 * đồng C6 verbatim để đổi lấy một thứ thuần trang trí. Tra theo `href` giữ
 * `nav.ts` nguyên vẹn từng byte và vẫn cho vỏ đủ thứ nó cần.
 *
 * Lý do thứ hai, nặng hơn: `nav.ts` là module LOGIC (đang được import trong
 * `layout.tsx` phía server để chuẩn hoá vai trò). Gắn component React của
 * `lucide-react` vào đó là kéo một thư viện UI vào đường đi của server chỉ để
 * hỏi "vai trò này thấy mục nào".
 *
 * Đường nào thiếu icon thì `nav-icons.test.ts` đỏ — không im lặng bỏ qua.
 */
export const NAV_ICONS: Readonly<Record<string, LucideIcon>> = {
  '/lessons': BookOpen,
  '/labs': FlaskConical,
  '/playgrounds': SquareTerminal,
  '/paths': Route,
  '/quiz': ListChecks,
  '/games': Gamepad2,
  '/me': CircleUser,
};

/** Icon cho các mục trong menu tài khoản (`userMenuItems`). */
export const USER_MENU_ICONS: Readonly<Record<string, LucideIcon>> = {
  '/settings': Settings,
  '/author': PenLine,
  '/admin': ShieldCheck,
};
