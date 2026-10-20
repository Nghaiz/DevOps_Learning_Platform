'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@devops-platform/ui';
import { err, t } from '@devops-platform/copy';
import type { ErrorEntry } from '@devops-platform/copy/types';
import { authClient } from '../../lib/auth-client';
import { AuthOAuth } from '../../components/shell/auth-oauth';
import { AUTH_LINK, AuthField, authFailureFor } from '../../components/shell/auth-failure';
import { SIGNED_IN_HOME, withReturnPath } from './return-path';

/**
 * Form đăng nhập. Client Component: Better Auth cần `fetch` phía trình duyệt để
 * đặt cookie phiên.
 *
 * `returnTo` đã qua `safeReturnPath` ở server (`page.tsx`): một đường tương đối
 * cùng origin hoặc `null`. Form không tự đọc URL.
 *
 * Message lỗi của Better Auth là chữ tiếng Anh cho người vận hành, nên nó vào
 * `console.error`; người dùng luôn đọc một `ErrorEntry` của bản đồ.
 */
export function LoginForm({ returnTo }: { readonly returnTo: string | null }) {
  const router = useRouter();
  const fieldId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<ErrorEntry | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * ⚠ MỌI nút khoá cho tới khi React gắn xong handler. Trước lúc hydrate, bấm
   * nút submit chạy đường submit NATIVE: GET lại trang, chữ vừa gõ mất, không
   * request nào tới máy chủ (đo 2026-09-07). Các ô không khai `name`, nên lượt
   * submit native đó không mang mật khẩu lên URL. `e2e/flows/flow-kit.ts` chờ
   * đúng trạng thái `enabled` này.
   */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const destination = returnTo ?? SIGNED_IN_HOME;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    setPending(true);
    try {
      const { error: authError } = await authClient.signIn.email({ email, password });
      if (authError) {
        console.error('[auth] sign-in rejected', authError);
        setFailure(authFailureFor(authError.status, 'auth.error.sign-in'));
        return;
      }
      // Bootstrap cặp refresh/access token (luật 6, 7) ngay sau khi có session.
      // Lỗi ở đây KHÔNG chặn đăng nhập nhưng cũng không được nuốt im lặng.
      await fetch('/api/auth/refresh', { method: 'POST' }).catch((bootstrapError: unknown) => {
        console.error('[auth] refresh bootstrap failed, rotation inactive', bootstrapError);
      });
      router.push(destination);
      router.refresh();
    } catch (networkError: unknown) {
      // Mạng chết KHÁC sai mật khẩu: chưa biết yêu cầu có tới nơi hay không.
      console.error('[auth] sign-in request failed', networkError);
      setFailure(err('auth.error.network'));
    } finally {
      setPending(false);
    }
  }

  const failureId = `${fieldId}-password-error`;

  return (
    <div className="flex flex-col gap-8">
      {returnTo !== null && (
        <p className="bg-muted px-4 py-3 text-sm text-muted-foreground">{t('auth.login.returning')}</p>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <AuthField
          id={`${fieldId}-email`}
          label={t('auth.field.email')}
          type="email"
          placeholder={t('auth.field.email-placeholder')}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          required
          autoComplete="email"
          invalid={failure !== null}
          describedBy={failure === null ? undefined : failureId}
        />
        <AuthField
          id={`${fieldId}-password`}
          label={t('auth.field.password')}
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          required
          autoComplete="current-password"
          failure={failure}
        />
        <div className="-mt-2 text-sm">
          <Link href={withReturnPath('/forgot-password', returnTo)} className={AUTH_LINK}>
            {t('auth.login.forgot')}
          </Link>
        </div>
        {/* `disabled` chứ không `loading` trước hydrate: spinner lúc trang vừa
            mở đọc ra là "đang gửi", trong khi sự thật là "chưa sẵn sàng nhận". */}
        <Button
          type="submit"
          size="lg"
          className="h-12 w-full"
          loading={pending}
          disabled={!hydrated}
          iconRight={<ArrowRight aria-hidden="true" />}
        >
          {t('auth.login.submit')}
        </Button>
      </form>

      <AuthOAuth hydrated={hydrated} callbackURL={destination} />

      <p className="text-sm text-muted-foreground">
        {t('auth.login.no-account')}{' '}
        <Link href={withReturnPath('/register', returnTo)} className={AUTH_LINK}>
          {t('auth.login.to-register')}
        </Link>
      </p>
    </div>
  );
}
