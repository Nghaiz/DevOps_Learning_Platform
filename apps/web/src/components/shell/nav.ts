/**
 * Điều hướng: bảng SECTION (mục cha trên header) → các trang con.
 *
 * Bản dựng lại PTIT (2026-10-03, `plans/fe-ptit-rebuild/design-brief.md` §3) bỏ
 * thanh bên trái và bỏ các trang trung gian `explore/[group]`. Hình dạng mới chỉ
 * có HAI tầng: section trên header, trang con mở thẳng từ mega menu hoặc từ thanh
 * chuyển trang (`SectionSwitcher`) nằm trong đầu trang.
 *
 * Dữ liệu THUẦN: không JSX, không React, không `server/**`. `app/layout.tsx`
 * (Server Component) import `normalizeRole` từ file này, nên `icon` là một TÊN
 * (`NavIconName`) và `nav-icons.ts` ánh xạ tên sang component ở phía client.
 *
 * ⚠ Hiện/ẩn ở đây là TRANG TRÍ, không phải phân quyền. Cổng đăng nhập là
 * `PROTECTED_PATHS` trong `proxy.ts`; cổng vai trò là `layout.tsx` phía server
 * của từng nhánh. `proxy.test.ts` đọc `PRIMARY_NAV` để chắc mọi đường hiện trên
 * header đều được gác (trừ ngoại lệ có lý do).
 */

import { t } from '@devops-platform/copy';

export type ViewerRole = 'user' | 'author' | 'admin';

/** Người dùng đang đăng nhập, đã rút gọn về đúng thứ vỏ ứng dụng cần. */
export interface Viewer {
  readonly name: string;
  readonly email: string;
  readonly role: ViewerRole;
}

/** Cặp (đường, nhãn): hình dạng tối thiểu của một liên kết. */
export interface NavItem {
  readonly href: string;
  readonly label: string;
}

/**
 * Thứ tự section trên header, cũng là nguồn khai sinh của `SectionId`. Suy kiểu
 * từ mảng để một section không thể tồn tại mà không có vị trí.
 */
export const SECTION_ORDER = ['learn', 'practice', 'judge', 'games', 'studio', 'admin'] as const;

export type SectionId = (typeof SECTION_ORDER)[number];

export type NavIconName =
  | 'paths'
  | 'lessons'
  | 'quiz'
  | 'labs'
  | 'playgrounds'
  | 'problems'
  | 'exams'
  | 'games'
  | 'author'
  | 'author-problems'
  | 'level-builder'
  | 'admin'
  | 'admin-users'
  | 'admin-classes'
  | 'admin-exams'
  | 'admin-sessions'
  | 'admin-content'
  | 'admin-audit';

/** Ai thấy mục. `'everyone'` gồm cả khách; `'signed-in'` là mọi vai trò đã đăng nhập. */
export type NavAudience = 'everyone' | 'signed-in' | readonly ViewerRole[];

export interface PrimaryNavItem extends NavItem {
  readonly section: SectionId;
  readonly icon: NavIconName;
  /** Một câu mô tả, hiện trong mega menu và bảng lệnh. */
  readonly description: string;
}

/**
 * Màu chữ ký của section. Là TÊN token, không phải class: `section-tone.ts`
 * (phía client) đổi tên này thành class Tailwind viết thẳng.
 */
export type SectionTone = 'primary' | 'docker' | 'iac' | 'signal' | 'cicd' | 'ink';

export interface NavSectionDef {
  readonly id: SectionId;
  readonly label: string;
  readonly lead: string;
  readonly tone: SectionTone;
  readonly roles: NavAudience;
  readonly items: readonly PrimaryNavItem[];
}

function item(
  section: SectionId,
  href: string,
  icon: NavIconName,
  label: string,
  description: string,
): PrimaryNavItem {
  return { section, href, icon, label, description };
}

/**
 * Bảng section. Nhãn và mô tả đến từ `packages/copy` (`shell.section.*`,
 * `shell.nav.*`). `nav.test.ts` ghim chữ VIẾT THẲNG, không ghim `t(...)`.
 *
 * ⚠ `/games/git?mode=builder` mang QUERY: nó là một CHẾ ĐỘ của một trang, không
 * bao giờ được tô "đang mở" (`activeNavItem` bỏ qua mục có query), và
 * `proxy.test.ts` cắt query trước khi hỏi cổng.
 */
export const NAV_SECTIONS: readonly NavSectionDef[] = [
  {
    id: 'learn',
    label: t('shell.section.learn'),
    lead: t('shell.section.learn.lead'),
    tone: 'primary',
    roles: 'everyone',
    items: [
      item('learn', '/paths', 'paths', t('shell.nav.paths'), t('shell.nav.paths.desc')),
      item('learn', '/lessons', 'lessons', t('shell.nav.lessons'), t('shell.nav.lessons.desc')),
      item('learn', '/quiz', 'quiz', t('shell.nav.quiz'), t('shell.nav.quiz.desc')),
    ],
  },
  {
    id: 'practice',
    label: t('shell.section.practice'),
    lead: t('shell.section.practice.lead'),
    tone: 'docker',
    roles: 'everyone',
    items: [
      item('practice', '/labs', 'labs', t('shell.nav.labs'), t('shell.nav.labs.desc')),
      item(
        'practice',
        '/playgrounds',
        'playgrounds',
        t('shell.nav.playgrounds'),
        t('shell.nav.playgrounds.desc'),
      ),
    ],
  },
  {
    id: 'judge',
    label: t('shell.section.judge'),
    lead: t('shell.section.judge.lead'),
    tone: 'iac',
    roles: 'everyone',
    items: [
      item('judge', '/problems', 'problems', t('shell.nav.problems'), t('shell.nav.problems.desc')),
      item('judge', '/exams', 'exams', t('shell.nav.exams'), t('shell.nav.exams.desc')),
    ],
  },
  {
    id: 'games',
    label: t('shell.section.games'),
    lead: t('shell.section.games.lead'),
    tone: 'signal',
    roles: 'everyone',
    items: [item('games', '/games', 'games', t('shell.nav.games'), t('shell.nav.games.desc'))],
  },
  {
    id: 'studio',
    label: t('shell.section.studio'),
    lead: t('shell.section.studio.lead'),
    tone: 'cicd',
    roles: ['author', 'admin'],
    items: [
      item('studio', '/author', 'author', t('shell.nav.author'), t('shell.nav.author.desc')),
      item(
        'studio',
        '/author/problems',
        'author-problems',
        t('shell.nav.author-problems'),
        t('shell.nav.author-problems.desc'),
      ),
      item(
        'studio',
        '/games/git?mode=builder',
        'level-builder',
        t('shell.nav.level-builder'),
        t('shell.nav.level-builder.desc'),
      ),
    ],
  },
  {
    id: 'admin',
    label: t('shell.section.admin'),
    lead: t('shell.section.admin.lead'),
    tone: 'ink',
    roles: ['admin'],
    items: [
      item('admin', '/admin', 'admin', t('shell.nav.admin'), t('shell.nav.admin.desc')),
      item(
        'admin',
        '/admin/users',
        'admin-users',
        t('shell.nav.admin-users'),
        t('shell.nav.admin-users.desc'),
      ),
      item(
        'admin',
        '/admin/classes',
        'admin-classes',
        t('shell.nav.admin-classes'),
        t('shell.nav.admin-classes.desc'),
      ),
      item(
        'admin',
        '/admin/exams',
        'admin-exams',
        t('shell.nav.admin-exams'),
        t('shell.nav.admin-exams.desc'),
      ),
      item(
        'admin',
        '/admin/sessions',
        'admin-sessions',
        t('shell.nav.admin-sessions'),
        t('shell.nav.admin-sessions.desc'),
      ),
      item(
        'admin',
        '/admin/content',
        'admin-content',
        t('shell.nav.admin-content'),
        t('shell.nav.admin-content.desc'),
      ),
      item(
        'admin',
        '/admin/audit',
        'admin-audit',
        t('shell.nav.admin-audit'),
        t('shell.nav.admin-audit.desc'),
      ),
    ],
  },
];

/** Mọi trang con, phẳng, theo thứ tự header. `proxy.test.ts` đọc bảng này. */
export const PRIMARY_NAV: readonly PrimaryNavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/** Phép kiểm tầm nhìn duy nhất, dùng chung cho section và menu tài khoản. */
function visibleTo(roles: NavAudience, role: ViewerRole | null): boolean {
  if (roles === 'everyone') {
    return true;
  }
  if (role === null) {
    return false;
  }
  return roles === 'signed-in' || roles.includes(role);
}

/** Section người xem này thấy được, theo thứ tự header. */
export function sectionsFor(viewer: Viewer | null): readonly NavSectionDef[] {
  const role = viewer?.role ?? null;
  return NAV_SECTIONS.filter((section) => visibleTo(section.roles, role));
}

export function sectionById(id: SectionId): NavSectionDef {
  const found = NAV_SECTIONS.find((section) => section.id === id);
  if (found === undefined) {
    throw new Error(`nav: unknown section "${id}"`);
  }
  return found;
}

interface RoleGatedItem extends NavItem {
  readonly roles: NavAudience;
}

const USER_MENU_NAV: readonly RoleGatedItem[] = [
  { href: '/me', label: t('shell.account.menu.me'), roles: 'signed-in' },
  { href: '/settings', label: t('shell.account.menu.settings'), roles: 'signed-in' },
  { href: '/author', label: t('shell.account.menu.author'), roles: ['author', 'admin'] },
  { href: '/admin', label: t('shell.account.menu.admin'), roles: ['admin'] },
];

/** Mục menu tài khoản cho vai trò `role`. Trang trí, không phải phân quyền. */
export function userMenuItems(role: ViewerRole): readonly NavItem[] {
  return USER_MENU_NAV.filter((entry) => visibleTo(entry.roles, role)).map(({ href, label }) => ({
    href,
    label,
  }));
}

const KNOWN_ROLES: readonly ViewerRole[] = ['user', 'author', 'admin'];

/**
 * Vai trò từ session server, fail-closed: giá trị lạ → `'user'`.
 * Bản sao có chủ ý của `toRole` (không export) trong `server/trpc/init.ts`.
 */
export function normalizeRole(raw: unknown): ViewerRole {
  return KNOWN_ROLES.find((known) => known === raw) ?? 'user';
}

/**
 * Cùng luật khớp với `matchesProtected` của `proxy.ts`: đúng đường hoặc đường con.
 * `startsWith` trần sẽ nuốt `/mentor` cho `/me`.
 */
export function isActiveNav(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Mục khớp đường hiện tại, khớp DÀI NHẤT thắng (`/author/problems` thắng `/author`,
 * `/admin/exams` thắng `/admin`). Mục mang query bị bỏ qua.
 */
export function activeNavItem<T extends NavItem>(pathname: string, items: readonly T[]): T | null {
  let best: T | null = null;
  for (const entry of items) {
    if (entry.href.includes('?') || !isActiveNav(pathname, entry.href)) {
      continue;
    }
    if (best === null || entry.href.length > best.href.length) {
      best = entry;
    }
  }
  return best;
}

/** Section chứa đường hiện tại, hoặc `null` (trang tài khoản, trang lỗi, `/`). */
export function activeSection(pathname: string): SectionId | null {
  return activeNavItem(pathname, PRIMARY_NAV)?.section ?? null;
}
