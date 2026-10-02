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
import { SIGNED_IN_HOME, withReturnPath } from '../login/return-path';

/**
 * Form tạo tài khoản. Ba khác biệt THẬT so với đăng nhập, và là lý do hai màn là
 * hai file: có ô tên bắt buộc; `autoComplete="new-password"`; `minLength={8}`
 * kèm gợi ý dưới ô. Trang đăng nhập KHÔNG có ràng buộc độ dài: một tài khoản cũ
 * với mật khẩu ngắn sẽ bị chính trình duyệt chặn trước khi có request nào.
 */
export function RegisterForm({ returnTo }: { readonly returnTo: string | null }) {
  const router = useRouter();
  const fieldId = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<ErrorEntry | null>(null);
  const [pending, setPending] = useState(false);

  /** Khoá nút tới khi hydrate, cùng lý do với `login-form.tsx`. */
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
      const { error: authError } = await authClient.signUp.email({ email, password, name });
      if (authError) {
        console.error('[auth] sign-up rejected', authError);
        setFailure(authFailureFor(authError.status, 'auth.error.sign-up'));
        return;
      }
      await fetch('/api/auth/refresh', { method: 'POST' }).catch((bootstrapError: unknown) => {
        console.error('[auth] refresh bootstrap failed, rotation inactive', bootstrapError);
      });
      router.push(destination);
      router.refresh();
    } catch (networkError: unknown) {
      console.error('[auth] sign-up request failed', networkError);
      setFailure(err('auth.error.network'));
    } finally {
      setPending(false);
    }
  }

  const failureId = `${fieldId}-password-error`;
  const invalid = failure !== null;

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <AuthField
          id={`${fieldId}-name`}
          label={t('auth.field.name')}
          hint={t('auth.field.name-hint')}
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          required
          autoComplete="name"
        />
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
          invalid={invalid}
          describedBy={invalid ? failureId : undefined}
        />
        <AuthField
          id={`${fieldId}-password`}
          label={t('auth.field.password')}
          hint={t('auth.field.password-hint')}
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          required
          autoComplete="new-password"
          minLength={8}
          failure={failure}
        />
        <Button
          type="submit"
          size="lg"
          className="h-12 w-full"
          loading={pending}
          disabled={!hydrated}
          iconRight={<ArrowRight aria-hidden="true" />}
        >
          {t('auth.register.submit')}
        </Button>
      </form>

      <AuthOAuth hydrated={hydrated} callbackURL={destination} />

      <p className="text-sm text-muted-foreground">
        {t('auth.register.has-account')}{' '}
        <Link href={withReturnPath('/login', returnTo)} className={AUTH_LINK}>
          {t('auth.register.to-login')}
        </Link>
      </p>
    </div>
  );
}
