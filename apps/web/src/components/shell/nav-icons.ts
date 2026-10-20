/**
 * Tên icon (`nav.ts`) → component lucide. Module chỉ phía client đọc, để
 * `nav.ts` vẫn là dữ liệu thuần mà Server Component import được.
 * `Record<NavIconName, …>` biến một icon thiếu thành lỗi biên dịch.
 */
import {
  BookOpenText,
  ClipboardCheck,
  FlaskConical,
  FolderKanban,
  Gamepad2,
  GitBranchPlus,
  Gauge,
  History,
  LayoutDashboard,
  ListChecks,
  MonitorPlay,
  PencilRuler,
  Route,
  Settings,
  ShieldCheck,
  SquarePen,
  SquareTerminal,
  Timer,
  UserRound,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { NavIconName } from './nav';

export const NAV_ICONS: Readonly<Record<NavIconName, LucideIcon>> = {
  paths: Route,
  lessons: BookOpenText,
  quiz: ListChecks,
  labs: FlaskConical,
  playgrounds: SquareTerminal,
  problems: PencilRuler,
  exams: Timer,
  games: Gamepad2,
  author: SquarePen,
  'author-problems': ClipboardCheck,
  'level-builder': GitBranchPlus,
  admin: Gauge,
  'admin-users': UsersRound,
  'admin-classes': Users,
  'admin-exams': Timer,
  'admin-sessions': MonitorPlay,
  'admin-content': FolderKanban,
  'admin-audit': History,
};

/** Icon của menu tài khoản, tra theo `href` (menu tài khoản không có tên icon). */
export const USER_MENU_ICONS: Readonly<Record<string, LucideIcon>> = {
  '/me': LayoutDashboard,
  '/settings': Settings,
  '/author': SquarePen,
  '/admin': ShieldCheck,
};

export const ACCOUNT_ICON: LucideIcon = UserRound;
