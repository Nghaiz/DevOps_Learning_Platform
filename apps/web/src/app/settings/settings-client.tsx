'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { err, t } from '@devops-platform/copy';
import { BackLink, ErrorBlock, Page, PageHeader, Skeleton } from '@devops-platform/ds';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { PasswordForm } from '../../components/me/password-form';
import { PreferencesForm } from '../../components/me/preferences-form';
import { ProfileForm } from '../../components/me/profile-form';

/**
 * Vai trò hiện cho người dùng đọc; `me.get` trả mã thô của cột `users.role`.
 *
 * Phép thu hẹp xảy ra TRƯỚC khi ghép khoá, nên `t(\`me.role.${role}\`)` chỉ nhận
 * khoá có thật. Mã lạ hiện NGUYÊN MÃ, không đọc thành "Người học": một vai trò
 * mới quên dịch phải nhìn thấy được.
 */
function describeRole(role: string): string {
  if (role === 'user' || role === 'author' || role === 'admin') {
    return t(`me.role.${role}`);
  }
  return role;
}

/**
 * `/settings`: ba khối xếp dọc trong một cột hẹp (hồ sơ, mật khẩu, tuỳ chọn), mỗi
 * khối lưu riêng và tự báo trạng thái lưu cạnh nút của nó.
 *
 * ⛔ Không `<main>`. Cả trang đứng trên MỘT lượt `me.get`; ba khối nhận giá trị đã
 * lưu qua props, nên không khối nào hiện một phiên bản khác của cùng một tuỳ chọn.
 */
export function SettingsClient(): ReactElement {
  const me = api.me.get.useQuery({});

  return (
    <Page width="text" className="pb-16">
      <PageHeader
        title={t('me.settings.title')}
        lead={t('me.settings.lead')}
        back={
          <BackLink asChild>
            <Link href="/me">{t('me.settings.back')}</Link>
          </BackLink>
        }
      />
      {me.isPending ? (
        <div aria-busy="true" aria-label={t('me.settings.loading')} className="flex flex-col gap-10 pt-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : null}
      {me.isError ? (
        <ErrorBlock
          title={err('me.error.profile-load', { reason: describeTrpcError(me.error) }).what}
          retryLabel={t('common.action.retry')}
          retrying={me.isFetching}
          onRetry={() => void me.refetch()}
        >
          {err('me.error.profile-load', { reason: describeTrpcError(me.error) }).next}
        </ErrorBlock>
      ) : null}
      {me.isSuccess ? (
        <div className="flex flex-col divide-y divide-rule [&>*]:py-10 [&>*:first-child]:pt-2">
          <ProfileForm name={me.data.name} email={me.data.email} roleLabel={describeRole(me.data.role)} />
          <PasswordForm hasPassword={me.data.hasPassword} />
          <PreferencesForm
            defaultShell={me.data.preferences.defaultShell}
            terminalTheme={me.data.preferences.terminalTheme}
            leaderboardNamePublic={me.data.preferences.leaderboardNamePublic}
          />
        </div>
      ) : null}
    </Page>
  );
}
