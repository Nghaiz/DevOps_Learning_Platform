import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { AuthFrame } from '../../components/shell/auth-frame';
import { LoginForm } from './login-form';
import { returnPathFrom } from './return-path';

export const metadata: Metadata = {
  title: t('auth.login.meta-title'),
};

/**
 * KHÔNG render `<main>`: vỏ ứng dụng sở hữu landmark đó và bọc mọi trang.
 *
 * `next` (proxy gắn khi chặn khách) và `callbackURL` đi qua `returnPathFrom` NGAY
 * Ở SERVER: form chỉ nhận một đường đã kiểm, không tự đọc URL.
 */
export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = returnPathFrom({ next: params.next, callbackURL: params.callbackURL });
  return (
    <AuthFrame title={t('auth.login.title')} description={t('auth.login.description')}>
      <LoginForm returnTo={returnTo} />
    </AuthFrame>
  );
}
