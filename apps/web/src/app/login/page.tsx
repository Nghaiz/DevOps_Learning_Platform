import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Đăng nhập — DevOps Learning Platform',
};

/**
 * KHÔNG render `<main>` (vỏ ứng dụng sở hữu landmark đó) và KHÔNG
 * `min-h-screen` — xem chú thích cùng lý do ở `app/page.tsx`.
 */
export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 min-[769px]:px-6">
      <LoginForm />
    </div>
  );
}
