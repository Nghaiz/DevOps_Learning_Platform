import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { AuthFrame } from '../../components/shell/auth-frame';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: t('auth.login.meta-title'),
};

/**
 * KHÔNG render `<main>`: vỏ ứng dụng sở hữu landmark đó và bọc mọi trang.
 * KHÔNG `min-h-screen` (cùng lý do đã ghi ở `app/page.tsx`): `AuthFrame` nhận
 * `flex-1` từ `<main>` nên nó cao đúng phần còn lại của viewport, còn
 * `min-h-screen` sẽ cộng thêm chiều cao thanh đầu trang và sinh ra một thanh
 * cuộn dọc trên một trang không có gì để cuộn.
 */
export default function LoginPage() {
  return (
    <AuthFrame title={t('auth.login.title')} description={t('auth.login.description')}>
      <LoginForm />
    </AuthFrame>
  );
}
