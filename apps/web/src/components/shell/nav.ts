/**
 * Mô hình điều hướng: SSOT cho thanh trên cùng, thanh mục con, menu điện thoại, bảng
 * lệnh, trang tổng quan của từng mục và `proxy.test.ts` (mọi đường dẫn ở đây phải
 * được proxy gác, trừ `/games`).
 *
 * Mỗi mục cha có một trang tổng quan riêng (`hub`): bấm vào mục trên thanh trên cùng
 * là vào trang đó để chọn tính năng con. Trong mục, thanh mục con nằm ngay dưới.
 *
 * Server-safe: không `'use client'`, không import React. Giấu một liên kết KHÔNG phải
 * phân quyền: cổng thật là `proxy.ts` và `layout.tsx` server của `/author`, `/studio`,
 * `/admin`.
 */
import { t } from '@devops-platform/copy';
import type { IconName } from '@devops-platform/ds/icons';

export type ViewerRole = 'user' | 'author' | 'admin';

export interface Viewer {
  readonly name: string;
  readonly email: string;
  readonly role: ViewerRole;
}

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

export const SECTION_ORDER = ['learn', 'practice', 'judge', 'games', 'studio', 'admin'] as const;
export type SectionId = (typeof SECTION_ORDER)[number];

export type NavAudience = 'everyone' | 'signed-in' | readonly ViewerRole[];

export interface PrimaryNavItem extends NavItem {
  readonly section: SectionId;
  readonly icon: IconName;
  readonly description: string;
}

export interface NavSectionDef {
  readonly id: SectionId;
  readonly label: string;
  readonly lead: string;
  readonly icon: IconName;
  readonly roles: NavAudience;
  /** Trang tổng quan của mục. */
  readonly hub: string;
  readonly items: readonly PrimaryNavItem[];
}

function item(section: SectionId, href: string, icon: IconName, label: string, description: string): PrimaryNavItem {
  return { section, href, icon, label, description };
}

export const NAV_SECTIONS: readonly NavSectionDef[] = [
  {
    id: 'learn',
    label: t('shell.section.learn'),
    lead: t('shell.section.learn.lead'),
    icon: 'book',
    roles: 'everyone',
    hub: '/learn',
    items: [
      item('learn', '/paths', 'stairs', t('shell.nav.paths'), t('shell.nav.paths.desc')),
      item('learn', '/lessons', 'book', t('shell.nav.lessons'), t('shell.nav.lessons.desc')),
      item('learn', '/quiz', 'quiz', t('shell.nav.quiz'), t('shell.nav.quiz.desc')),
    ],
  },
  {
    id: 'practice',
    label: t('shell.section.practice'),
    lead: t('shell.section.practice.lead'),
    icon: 'flask',
    roles: 'everyone',
    hub: '/practice',
    items: [
      item('practice', '/labs', 'flask', t('shell.nav.labs'), t('shell.nav.labs.desc')),
      item('practice', '/playgrounds', 'sandbox', t('shell.nav.playgrounds'), t('shell.nav.playgrounds.desc')),
    ],
  },
  {
    id: 'judge',
    label: t('shell.section.judge'),
    lead: t('shell.section.judge.lead'),
    icon: 'problem',
    roles: 'everyone',
    hub: '/judge',
    items: [
      item('judge', '/problems', 'problem', t('shell.nav.problems'), t('shell.nav.problems.desc')),
      item('judge', '/exams', 'timer', t('shell.nav.exams'), t('shell.nav.exams.desc')),
    ],
  },
  {
    id: 'games',
    label: t('shell.section.games'),
    lead: t('shell.section.games.lead'),
    icon: 'gamepad',
    roles: 'everyone',
    hub: '/games',
    items: [
      item('games', '/games/k8s', 'kube', t('shell.nav.game-k8s'), t('shell.nav.game-k8s.desc')),
      item('games', '/games/git', 'branch', t('shell.nav.game-git'), t('shell.nav.game-git.desc')),
      item('games', '/games/cicd', 'pipeline', t('shell.nav.game-cicd'), t('shell.nav.game-cicd.desc')),
    ],
  },
  {
    id: 'studio',
    label: t('shell.section.studio'),
    lead: t('shell.section.studio.lead'),
    icon: 'pen',
    roles: ['author', 'admin'],
    hub: '/studio',
    items: [
      item('studio', '/author', 'file-text', t('shell.nav.author'), t('shell.nav.author.desc')),
      item('studio', '/author/problems', 'problem', t('shell.nav.author-problems'), t('shell.nav.author-problems.desc')),
      item('studio', '/games/git?mode=builder', 'branch', t('shell.nav.level-builder'), t('shell.nav.level-builder.desc')),
    ],
  },
  {
    id: 'admin',
    label: t('shell.section.admin'),
    lead: t('shell.section.admin.lead'),
    icon: 'panel',
    roles: ['admin'],
    hub: '/admin',
    items: [
      item('admin', '/admin/users', 'users', t('shell.nav.admin-users'), t('shell.nav.admin-users.desc')),
      item('admin', '/admin/classes', 'classroom', t('shell.nav.admin-classes'), t('shell.nav.admin-classes.desc')),
      item('admin', '/admin/exams', 'timer', t('shell.nav.admin-exams'), t('shell.nav.admin-exams.desc')),
      item('admin', '/admin/sessions', 'server', t('shell.nav.admin-sessions'), t('shell.nav.admin-sessions.desc')),
      item('admin', '/admin/content', 'layers', t('shell.nav.admin-content'), t('shell.nav.admin-content.desc')),
      item('admin', '/admin/audit', 'history', t('shell.nav.admin-audit'), t('shell.nav.admin-audit.desc')),
    ],
  },
];

/** Mọi trang con của mọi mục, phẳng (bảng lệnh, proxy.test). */
export const PRIMARY_NAV: readonly PrimaryNavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/** Trang tổng quan của mọi mục, dạng NavItem (proxy.test đọc danh sách này). */
export const SECTION_HUBS: readonly (NavItem & { readonly section: SectionId })[] = NAV_SECTIONS.map((section) => ({
  href: section.hub,
  label: section.label,
  section: section.id,
}));

function visibleTo(roles: NavAudience, role: ViewerRole | null): boolean {
  if (roles === 'everyone') return true;
  if (role === null) return false;
  return roles === 'signed-in' || roles.includes(role);
}

export function sectionsFor(viewer: Viewer | null): readonly NavSectionDef[] {
  const role = viewer?.role ?? null;
  return NAV_SECTIONS.filter((section) => visibleTo(section.roles, role));
}

export function sectionById(id: SectionId): NavSectionDef {
  const found = NAV_SECTIONS.find((section) => section.id === id);
  if (found === undefined) throw new Error(`nav: unknown section "${id}"`);
  return found;
}

interface RoleGatedItem extends NavItem {
  readonly roles: NavAudience;
  readonly icon: IconName;
}

const USER_MENU_NAV: readonly RoleGatedItem[] = [
  { href: '/me', label: t('shell.account.menu.me'), roles: 'signed-in', icon: 'user' },
  { href: '/settings', label: t('shell.account.menu.settings'), roles: 'signed-in', icon: 'sliders' },
];

export function userMenuItems(role: ViewerRole): readonly (NavItem & { readonly icon: IconName })[] {
  return USER_MENU_NAV.filter((entry) => visibleTo(entry.roles, role)).map(({ href, label, icon }) => ({ href, label, icon }));
}

const KNOWN_ROLES: readonly ViewerRole[] = ['user', 'author', 'admin'];

/** Vai trò lạ (bản ghi cũ, giá trị rác) đóng về `user`: thấy ít hơn, không phải thấy nhiều hơn. */
export function normalizeRole(raw: unknown): ViewerRole {
  return KNOWN_ROLES.find((known) => known === raw) ?? 'user';
}

/** Khớp theo đoạn đường dẫn: `/labs` khớp `/labs/x` nhưng không khớp `/labsx`. */
export function isActiveNav(pathname: string, href: string): boolean {
  const base = href.split('?')[0] ?? href;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Mục dài nhất khớp với đường dẫn. Mục có query (`?mode=builder`) chỉ khớp khi query trùng. */
/** Mọi cặp khoá-giá trị của `query` có đúng trong `search`. So chuỗi con thì `?amode=builder` cũng khớp. */
function queryMatches(query: string, search: string): boolean {
  const have = new URLSearchParams(search);
  for (const [key, value] of new URLSearchParams(query)) {
    if (have.get(key) !== value) return false;
  }
  return true;
}

export function activeNavItem<T extends NavItem>(pathname: string, items: readonly T[], search = ''): T | null {
  let best: T | null = null;
  for (const entry of items) {
    const [base, query] = entry.href.split('?');
    if (base === undefined || !isActiveNav(pathname, base)) continue;
    if (query !== undefined && !queryMatches(query, search)) continue;
    if (best === null || entry.href.length > best.href.length) best = entry;
  }
  return best;
}

/** Mục cha đang mở, tính từ đường dẫn: khớp trang con hoặc chính trang tổng quan. */
export function activeSection(pathname: string, search = ''): SectionId | null {
  const child = activeNavItem(pathname, PRIMARY_NAV, search);
  if (child !== null) return child.section;
  const hub = SECTION_HUBS.find((entry) => isActiveNav(pathname, entry.href));
  return hub?.section ?? null;
}
