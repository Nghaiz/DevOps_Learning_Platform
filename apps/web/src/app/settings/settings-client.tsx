'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { Button, ErrorState, Skeleton } from '@devops-platform/ui';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { PasswordForm } from '../../components/me/password-form';
import { PreferencesForm } from '../../components/me/preferences-form';
import { ProfileForm } from '../../components/me/profile-form';

/** Vai trò hiện cho người dùng đọc; `me.get` trả mã thô của cột `users.role`. */
const ROLE_LABEL: Readonly<Record<string, string>> = {
  user: 'Người học',
  author: 'Tác giả nội dung',
  admin: 'Quản trị viên',
};

/**
 * `/settings` — hồ sơ & tuỳ chọn (13.E mục 18).
 *
 * ⛔ Không dựng `<main>` (C6bis) — vỏ ứng dụng sở hữu landmark đó.
 *
 * Cả trang đứng trên MỘT lượt `me.get`: tên, email, vai trò, ba tuỳ chọn, và
 * `hasPassword`. Ba khối con nhận giá trị đã lưu qua props thay vì tự query,
 * nên không có đường nào để hai khối hiện hai phiên bản khác nhau của cùng một
 * tuỳ chọn.
 */
export function SettingsClient(): ReactElement {
  const me = api.me.get.useQuery({});

  if (me.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (me.isError) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <ErrorState
          title="Không tải được hồ sơ"
          message={describeTrpcError(me.error)}
          onRetry={() => void me.refetch()}
          retrying={me.isFetching}
        />
      </div>
    );
  }

  const { name, email, role, preferences, hasPassword } = me.data;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">Hồ sơ &amp; cài đặt</h1>
          <p className="text-sm text-muted-foreground">
            Tên hiển thị, mật khẩu, và tuỳ chọn cho phiên sandbox của bạn.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/me">Về trang Của tôi</Link>
        </Button>
      </header>

      <ProfileForm name={name} email={email} roleLabel={ROLE_LABEL[role] ?? role} />
      <PasswordForm hasPassword={hasPassword} />
      <PreferencesForm
        defaultShell={preferences.defaultShell}
        terminalTheme={preferences.terminalTheme}
        leaderboardNamePublic={preferences.leaderboardNamePublic}
      />
    </div>
  );
}
