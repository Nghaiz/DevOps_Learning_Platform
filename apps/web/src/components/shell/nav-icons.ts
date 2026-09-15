import {
  BookOpen,
  CircleUser,
  FlaskConical,
  Gamepad2,
  GitBranch,
  ListChecks,
  PencilRuler,
  PenLine,
  Route,
  Settings,
  ShieldCheck,
  SquareTerminal,
  SquarePen,
  Timer,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { NavIconName } from './nav';

/**
 * Icon của điều hướng chính — tra theo TÊN icon (`NavIconName`), không theo `href`.
 *
 * ## Vì sao component ở đây chứ không nằm thẳng trong `PRIMARY_NAV`
 *
 * `nav.ts` là module LOGIC và `app/layout.tsx` (Server Component) import
 * `normalizeRole` từ nó. Gắn component `lucide-react` vào từng mục là kéo cả
 * thư viện icon vào đường đi của server chỉ để hỏi "vai trò này thấy mục nào".
 * Nên `nav.ts` mang TÊN icon (dữ liệu thuần), file này — chỉ phía client đọc —
 * mang component.
 *
 * ## Vì sao theo TÊN chứ không theo `href` (bản trước làm vậy)
 *
 * Bản tra theo `href` là một bản sao KHOÁ của `nav.ts`, và bản sao khoá thì
 * trôi: thêm một mục mà quên bảng này ra một mục không có icon, và chỉ một ô
 * test bắt được. `Record<NavIconName, LucideIcon>` là một bản đồ ĐÓNG trên
 * union, nên hai hướng hỏng đó nay là lỗi BIÊN DỊCH:
 *
 * · mục mới thiếu `icon`      → `icon` là field bắt buộc của `PrimaryNavItem`;
 * · `icon` trỏ tên chưa có ở đây → thiếu key trong `Record` trên union đóng.
 *
 * Chiều duy nhất trình biên dịch KHÔNG thấy là một tên nằm đây mà không mục nào
 * dùng — bảng thành nghĩa địa. Đó là việc của `nav-icons.test.ts`.
 */
export const NAV_ICONS: Readonly<Record<NavIconName, LucideIcon>> = {
  lessons: BookOpen,
  labs: FlaskConical,
  playgrounds: SquareTerminal,
  paths: Route,
  quiz: ListChecks,
  games: Gamepad2,
  problems: PencilRuler,
  exams: Timer,
  me: CircleUser,
  author: PenLine,
  'author-problems': SquarePen,
  'level-builder': GitBranch,
  'admin-exams': Trophy,
  'admin-classes': Users,
  admin: ShieldCheck,
};

/**
 * Icon cho các mục trong menu tài khoản (`userMenuItems`).
 *
 * Bảng này ở LẠI dạng tra theo `href`, cố ý: `user-menu.tsx` đọc nó bằng
 * `USER_MENU_ICONS[item.href]` và file đó không thuộc lượt sửa này. Cái giá là
 * bảng vẫn trôi được, nên hai ô đối chứng hai chiều ở `nav-icons.test.ts` vẫn
 * còn nguyên việc để làm — khác hẳn `NAV_ICONS` bên trên.
 *
 * `/admin` dùng CÙNG icon (`ShieldCheck`) với mục `admin` của `NAV_ICONS`: cùng
 * một đích thì cùng một hình, nếu không người dùng phải học hai biểu tượng cho
 * một trang.
 */
export const USER_MENU_ICONS: Readonly<Record<string, LucideIcon>> = {
  '/settings': Settings,
  '/author': PenLine,
  '/admin': ShieldCheck,
};
