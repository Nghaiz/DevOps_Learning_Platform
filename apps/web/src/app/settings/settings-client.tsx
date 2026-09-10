'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { err, t } from '@devops-platform/copy';
import { Button, ErrorState, Skeleton } from '@devops-platform/ui';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { MePageHeader } from '../../components/me/me-section';
import { PasswordForm } from '../../components/me/password-form';
import { PreferencesForm } from '../../components/me/preferences-form';
import { ProfileForm } from '../../components/me/profile-form';

/**
 * Vai trò hiện cho người dùng đọc; `me.get` trả mã thô của cột `users.role`.
 *
 * ⚠ Phép thu hẹp xảy ra TRƯỚC khi ghép khoá, không phải bằng một `as` lúc tra
 * bảng. `t()` chỉ nhận khoá có thật, nên `t(\`me.role.${role}\`)` trên một chuỗi
 * `string` là lỗi biên dịch chứ không phải một `undefined` lúc chạy rơi vào
 * nhánh `?? role` một cách tình cờ. Đây đúng là ba phép ép kiểu mà 16.F phải gỡ
 * ở `describeContentKind` và bạn bè; lane này không dựng lại chúng.
 *
 * Mã lạ hiện NGUYÊN MÃ, không đọc thành "Người học": một vai trò mới thêm ở
 * `users.role` mà quên dịch phải nhìn thấy được, để người dùng báo lại được thứ
 * họ nhìn thấy.
 */
function describeRole(role: string): string {
  if (role === 'user' || role === 'author' || role === 'admin') {
    return t(`me.role.${role}`);
  }
  return role;
}

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
    const entry = err('me.error.profile-load', { reason: describeTrpcError(me.error) });
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <ErrorState
          title={entry.what}
          message={entry.next}
          onRetry={() => void me.refetch()}
          retrying={me.isFetching}
        />
      </div>
    );
  }

  const { name, email, role, preferences, hasPassword } = me.data;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <MePageHeader
        title={t('me.page.settings-title')}
        description={t('me.page.settings-subtitle')}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/me">{t('me.page.settings-back')}</Link>
          </Button>
        }
      />

      <ProfileForm name={name} email={email} roleLabel={describeRole(role)} />
      <PasswordForm hasPassword={hasPassword} />
      <PreferencesForm
        defaultShell={preferences.defaultShell}
        terminalTheme={preferences.terminalTheme}
        leaderboardNamePublic={preferences.leaderboardNamePublic}
      />
    </div>
  );
}
