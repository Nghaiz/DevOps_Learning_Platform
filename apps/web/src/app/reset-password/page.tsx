import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { AuthFrame } from '../../components/shell/auth-frame';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: t('auth.reset.meta-title'),
};

/** KHÔNG render `<main>`: vỏ ứng dụng sở hữu landmark đó và bọc mọi trang. */
export default function ResetPasswordPage() {
  return (
    <AuthFrame title={t('auth.reset.title')} description={t('auth.reset.description')}>
      <ResetPasswordForm />
    </AuthFrame>
  );
}
