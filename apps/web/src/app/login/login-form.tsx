'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardDescription, CardTitle, Input } from '@devops-platform/ui';
import { authClient } from '../../lib/auth-client';

/**
 * Form email/password (đăng nhập + đăng ký — AC P0 "Đăng ký + đăng nhập hoạt
 * động") + nút OAuth. Client Component — Better Auth cần `document.cookie`/`fetch`
 * phía trình duyệt để set session cookie.
 */
export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { error: authError } =
        mode === 'sign-in'
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name });
      if (authError) {
        setError(authError.message ?? (mode === 'sign-in' ? 'Đăng nhập thất bại' : 'Đăng ký thất bại'));
        return;
      }
      // Bootstrap cặp refresh/access token (luật 6,7) NGAY sau khi có session —
      // không gọi thì /api/auth/refresh và toàn bộ cơ chế rotation/revocation
      // thành code chết (không UI nào kích hoạt). Lỗi ở đây không chặn đăng
      // nhập (session Better Auth đã có) nhưng KHÔNG được nuốt im lặng.
      await fetch('/api/auth/refresh', { method: 'POST' }).catch((bootstrapError: unknown) => {
        console.error('[auth] bootstrap refresh token thất bại — rotation chưa hoạt động phiên này', bootstrapError);
      });
      router.push('/dashboard');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function onOAuth(provider: 'google' | 'microsoft') {
    void authClient.signIn.social({ provider, callbackURL: '/dashboard' });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardTitle>{mode === 'sign-in' ? 'Đăng nhập' : 'Đăng ký'}</CardTitle>
      <CardDescription>Dùng email/mật khẩu hoặc tài khoản tổ chức.</CardDescription>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
        {mode === 'sign-up' ? (
          <Input
            type="text"
            placeholder="Tên hiển thị"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
          />
        ) : null}
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
        />
        <Input
          type="password"
          placeholder="Mật khẩu"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
          minLength={8}
        />
        {error !== null ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending
            ? mode === 'sign-in'
              ? 'Đang đăng nhập…'
              : 'Đang đăng ký…'
            : mode === 'sign-in'
              ? 'Đăng nhập'
              : 'Đăng ký'}
        </Button>
        <button
          type="button"
          className="text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900"
          onClick={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setError(null);
          }}
        >
          {mode === 'sign-in' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
        </button>
      </form>

      <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4">
        <Button type="button" variant="secondary" onClick={() => onOAuth('google')}>
          Đăng nhập với Google
        </Button>
        <Button type="button" variant="secondary" onClick={() => onOAuth('microsoft')}>
          Đăng nhập với Microsoft
        </Button>
      </div>
    </Card>
  );
}
