'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { ArrowLeft } from 'lucide-react';
import { err, t } from '@devops-platform/copy';
import { Button, ErrorState, Skeleton } from '@devops-platform/ui';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { PageContainer, ToolHeader } from '../../components/kit';
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
 * `/settings`: ba khối Split xếp chồng (hồ sơ, mật khẩu, tuỳ chọn), mỗi khối lưu
 * riêng và tự báo trạng thái lưu ở cột nhãn.
 *
 * ⛔ Không `<main>` (C6bis). Cả trang đứng trên MỘT lượt `me.get`; ba khối nhận
 * giá trị đã lưu qua props, nên không khối nào hiện một phiên bản khác của cùng
 * một tuỳ chọn.
 */
export function SettingsClient(): ReactElement {
  const me = api.me.get.useQuery({});

  const header = (
    <ToolHeader
      kicker={t('me.settings.kicker')}
      title={t('me.settings.title')}
      actions={
        <Button asChild variant="outline">
          <Link href="/me">
            <ArrowLeft aria-hidden="true" />
            {t('me.settings.back')}
          </Link>
        </Button>
      }
    />
  );

  if (me.isPending) {
    return (
      <>
        {header}
        <PageContainer className="py-8" >
          <div aria-busy="true" aria-label={t('me.settings.loading')} className="flex flex-col gap-8">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </PageContainer>
      </>
    );
  }

  if (me.isError) {
    const entry = err('me.error.profile-load', { reason: describeTrpcError(me.error) });
    return (
      <>
        {header}
        <PageContainer className="py-8">
          <ErrorState
            title={entry.what}
            message={entry.next}
            onRetry={() => void me.refetch()}
            retrying={me.isFetching}
          />
        </PageContainer>
      </>
    );
  }

  const { name, email, role, preferences, hasPassword } = me.data;

  return (
    <>
      {header}
      <PageContainer className="pb-16">
        <ProfileForm name={name} email={email} roleLabel={describeRole(role)} />
        <PasswordForm hasPassword={hasPassword} />
        <PreferencesForm
          defaultShell={preferences.defaultShell}
          terminalTheme={preferences.terminalTheme}
          leaderboardNamePublic={preferences.leaderboardNamePublic}
        />
      </PageContainer>
    </>
  );
}
