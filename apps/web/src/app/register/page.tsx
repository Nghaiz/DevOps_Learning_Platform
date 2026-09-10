import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { AuthFrame } from '../../components/shell/auth-frame';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: t('auth.register.meta-title'),
};

/** KHÔNG render `<main>`: vỏ ứng dụng sở hữu landmark đó và bọc mọi trang. */
export default function RegisterPage() {
  return (
    <AuthFrame title={t('auth.register.title')} description={t('auth.register.description')}>
      <RegisterForm />
    </AuthFrame>
  );
}
