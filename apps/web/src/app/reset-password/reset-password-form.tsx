'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button, Icon } from '@devops-platform/ds';
import { err, t } from '@devops-platform/copy';
import type { ErrorEntry } from '@devops-platform/copy/types';
import { AUTH_LINK, AuthField } from '../../components/shell/auth-failure';
import { authClient } from '../../lib/auth-client';

/**
 * Đặt mật khẩu mới bằng mã trong thư.
 *
 * ⛔ Mã chỉ vào THÂN POST, không bao giờ lên URL hay bộ nhớ trình duyệt. Luật 8
 * (`security/rule-08-no-token-in-url.test.ts`) cấm đọc mã từ query string, route
 * `/api/auth/[...all]` chặn cả hai đường mã-qua-URL của Better Auth, và thư chỉ
 * gửi đường trần `/reset-password`. Vì thế màn này KHÔNG đọc mã từ URL: đường
 * nhanh là ô mã được focus sẵn, nhận dán, tự bỏ khoảng trắng thừa.
 */
export function ResetPasswordForm() {
  const fieldId = useId();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  /* `on` = ô mà lỗi nằm dưới: mã sai dưới ô mã, còn lại dưới ô cuối của form. */
  const [failure, setFailure] = useState<{ readonly entry: ErrorEntry; readonly on: 'code' | 'form' } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (password !== confirm) {
      setFailure({ entry: err('auth.error.password-mismatch'), on: 'form' });
      return;
    }
    setPending(true);
    setFailure(null);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token: code.trim() });
      if (result.error) {
        setFailure(
          result.error.status >= 500
            ? { entry: err('auth.error.network'), on: 'form' }
            : { entry: err('auth.error.reset-invalid'), on: 'code' },
        );
      } else {
        setCode('');
        setPassword('');
        setConfirm('');
        setSubmitted(true);
      }
    } catch {
      setFailure({ entry: err('auth.error.network'), on: 'form' });
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col gap-8">
        <div role="status" className="flex animate-enter gap-4 border border-t-2 border-rule border-t-ok-mid bg-paper px-5 py-4">
          <Icon name="key" size={28} tint="neutral" className="mt-0.5 text-ok-ink" />
          <div className="flex flex-col gap-1.5">
            <p className="font-display text-lg font-semibold text-ink">{t('auth.reset.success-title')}</p>
            <p className="text-sm text-ink-2">{t('auth.reset.success-body')}</p>
          </div>
        </div>
        <Button asChild variant="primary" size="lg" iconRight="arrow-right" className="self-start">
          <Link href="/login">{t('auth.reset.to-login')}</Link>
        </Button>
      </div>
    );
  }

  const codeFailure = failure?.on === 'code' ? failure.entry : null;
  const formFailure = failure?.on === 'form' ? failure.entry : null;

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={onSubmit} className="flex flex-col gap-5" aria-busy={pending}>
        <AuthField
          id={`${fieldId}-code`}
          label={t('auth.reset.code')}
          hint={t('auth.reset.code-hint')}
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
          }}
          required
          // Màn này chỉ có một việc, và việc đầu tiên là dán mã.
          autoFocus
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={128}
          className="font-mono"
          disabled={pending}
          failure={codeFailure}
        />
        <AuthField
          id={`${fieldId}-password`}
          label={t('auth.field.new-password')}
          hint={t('auth.field.password-hint')}
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          required
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          disabled={pending}
          invalid={formFailure !== null}
        />
        <AuthField
          id={`${fieldId}-confirm`}
          label={t('auth.field.confirm-password')}
          type="password"
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value);
          }}
          required
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          disabled={pending}
          failure={formFailure}
        />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} disabled={!hydrated || pending}>
          {t(pending ? 'auth.reset.pending' : 'auth.reset.submit')}
        </Button>
      </form>
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-ink-2">
          {t('auth.reset.no-code')}{' '}
          <Link href="/forgot-password" className={AUTH_LINK}>
            {t('auth.reset.request-code')}
          </Link>
        </p>
        <Link href="/login" className={`${AUTH_LINK} self-start`}>
          {t('auth.reset.back')}
        </Link>
      </div>
    </div>
  );
}
