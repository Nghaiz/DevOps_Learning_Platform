import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { AuthFrame } from '../../components/shell/auth-frame';
import { returnPathFrom } from '../login/return-path';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: t('auth.register.meta-title'),
};

/** KHÔNG render `<main>`. `next` đi qua cùng cổng `returnPathFrom` với `/login`. */
export default async function RegisterPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = returnPathFrom({ next: params.next, callbackURL: params.callbackURL });
  return (
    <AuthFrame title={t('auth.register.title')} description={t('auth.register.description')}>
      <RegisterForm returnTo={returnTo} />
    </AuthFrame>
  );
}
