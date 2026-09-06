'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
} from '@devops-platform/ui';
import { authClient } from '../../lib/auth-client';

/**
 * Form email/mật khẩu (đăng nhập + đăng ký) + nút OAuth. Client Component —
 * Better Auth cần `document.cookie`/`fetch` phía trình duyệt để đặt cookie phiên.
 *
 * 13.B dựng lại phần TRÌNH BÀY trên C1/C2 (token, `Card`, `Label`, `Alert`,
 * `Button loading`) và **giữ nguyên toàn bộ phần xác thực**: bootstrap
 * refresh/access token sau khi có phiên, và thông báo lỗi lấy từ Better Auth.
 * Chỗ duy nhất đổi hành vi là đích sau khi vào được: `/dashboard` → `/me`, theo
 * D12 (`/dashboard` nay chỉ còn là một 308 tới đúng chỗ đó).
 */
export function LoginForm() {
  const router = useRouter();
  const fieldId = useId();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const signingIn = mode === 'sign-in';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { error: authError } = signingIn
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name });
      if (authError) {
        setError(
          authError.message ??
            (signingIn
              ? 'Đăng nhập thất bại. Kiểm tra lại email và mật khẩu rồi thử lần nữa.'
              : 'Đăng ký thất bại. Kiểm tra lại thông tin rồi thử lần nữa.'),
        );
        return;
      }
      // Bootstrap cặp refresh/access token (luật 6,7) NGAY sau khi có session —
      // không gọi thì /api/auth/refresh và toàn bộ cơ chế rotation/revocation
      // thành code chết (không UI nào kích hoạt). Lỗi ở đây không chặn đăng
      // nhập (session Better Auth đã có) nhưng KHÔNG được nuốt im lặng.
      await fetch('/api/auth/refresh', { method: 'POST' }).catch((bootstrapError: unknown) => {
        console.error(
          '[auth] bootstrap refresh token thất bại — rotation chưa hoạt động phiên này',
          bootstrapError,
        );
      });
      router.push('/me');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function onOAuth(provider: 'google' | 'microsoft') {
    void authClient.signIn.social({ provider, callbackURL: '/me' });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{signingIn ? 'Đăng nhập' : 'Đăng ký'}</CardTitle>
        <CardDescription>Dùng email/mật khẩu hoặc tài khoản tổ chức.</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {signingIn ? null : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-name`}>Tên hiển thị</Label>
              <Input
                id={`${fieldId}-name`}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-email`}>Email</Label>
            <Input
              id={`${fieldId}-email`}
              type="email"
              placeholder="ban@vidu.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              invalid={error !== null}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-password`}>Mật khẩu</Label>
            <Input
              id={`${fieldId}-password`}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              /* `new-password` khi đăng ký để trình quản lý mật khẩu đề xuất một
                 mật khẩu mới thay vì điền lại mật khẩu cũ của trang khác. */
              autoComplete={signingIn ? 'current-password' : 'new-password'}
              minLength={8}
              invalid={error !== null}
            />
            {signingIn ? null : (
              <p className="text-xs text-muted-foreground">Tối thiểu 8 ký tự.</p>
            )}
          </div>

          {error === null ? null : (
            /* `variant="destructive"` mang sẵn `role="alert"` (C2) — trình đọc
               màn hình đọc lỗi ngay khi nó xuất hiện, không phải chờ người dùng
               tự Tab tới. */
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" loading={pending}>
            {signingIn ? 'Đăng nhập' : 'Đăng ký'}
          </Button>

          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => {
              setMode(signingIn ? 'sign-up' : 'sign-in');
              setError(null);
            }}
          >
            {signingIn ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
          </Button>
        </form>
      </CardContent>

      <Separator className="my-4" />

      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" onClick={() => onOAuth('google')}>
          Đăng nhập với Google
        </Button>
        <Button type="button" variant="outline" onClick={() => onOAuth('microsoft')}>
          Đăng nhập với Microsoft
        </Button>
      </div>
    </Card>
  );
}
