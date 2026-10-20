'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Pill, toast } from '@devops-platform/ds';
import { errText, t } from '@devops-platform/copy';
import { userMenuItems, type Viewer } from './nav';

const ROLE_LABEL = {
  user: () => t('shell.account.role.user'),
  author: () => t('shell.account.role.author'),
  admin: () => t('shell.account.role.admin'),
} as const;

/**
 * Menu tài khoản: vòng chữ cái đầu trên thanh (tên và email chỉ hiện khi mở menu, để
 * màn hình chiếu lên lớp không lộ email), trang cá nhân, cài đặt, đăng xuất.
 */
export function UserMenu({ viewer }: { readonly viewer: Viewer }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const name = viewer.name === '' ? t('shell.account.fallback-name') : viewer.name;

  async function signOut(): Promise<void> {
    setSigningOut(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    } catch (error: unknown) {
      console.error('[auth] sign-out failed', error);
      toast.error(t('shell.sign-out.failed-title'), { description: errText('shell.error.sign-out') });
      setSigningOut(false);
      return;
    }
    router.push('/login');
    router.refresh();
  }

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="grid size-9 place-items-center rounded-full transition-[box-shadow] duration-150 hover:ring-4 hover:ring-well-2"
        >
          <Avatar name={name} seed={viewer.email} size={32} />
          <span className="sr-only">{t('shell.account.trigger-named', { name })}</span>
        </button>
      </MenuTrigger>
      <MenuContent className="w-64">
        <div className="flex items-center gap-3 px-2.5 pb-2 pt-1.5">
          <Avatar name={name} seed={viewer.email} size={36} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-ink">{name}</span>
            <span className="truncate text-xs text-ink-3">{viewer.email}</span>
          </div>
        </div>
        <div className="px-2.5 pb-2">
          <Pill tone="acc">{ROLE_LABEL[viewer.role]()}</Pill>
        </div>
        <MenuSeparator />
        {userMenuItems(viewer.role).map((entry) => (
          <MenuItem key={entry.href} icon={entry.icon} asChild>
            <Link href={entry.href}>{entry.label}</Link>
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem
          icon="logout"
          disabled={signingOut}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          {t('shell.account.sign-out')}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
