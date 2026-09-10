import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { AuthFrame } from '../../components/shell/auth-frame';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: t('auth.forgot.meta-title'),
};

/** KHÔNG render `<main>`: vỏ ứng dụng sở hữu landmark đó và bọc mọi trang. */
export default function ForgotPasswordPage() {
  return (
    <AuthFrame title={t('auth.forgot.title')} description={t('auth.forgot.description')}>
      <ForgotPasswordForm />
    </AuthFrame>
  );
}
