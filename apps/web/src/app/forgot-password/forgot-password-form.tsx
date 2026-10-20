'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button, Icon } from '@devops-platform/ds';
import { err, t } from '@devops-platform/copy';
import type { ErrorEntry } from '@devops-platform/copy/types';
import { authClient } from '../../lib/auth-client';
import { AUTH_LINK, AuthField } from '../../components/shell/auth-failure';

/**
 * Yêu cầu mã đặt lại mật khẩu. Câu báo thành công cố ý KHÔNG nói một địa chỉ có
 * tài khoản hay không. 503 (đường gửi thư hỏng) phải hiện lỗi, không hiện "đã
 * nhận": `password-reset-forms.test.tsx` ghim đúng hai ca đó.
 */
export function ForgotPasswordForm() {
  const fieldId = useId();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorEntry | null>(null);
  const [pending, setPending] = useState(false);
  // Chặn submit native (GET) trước khi handler được gắn.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setFailure(null);
    setSubmitted(null);
    try {
      const result = await authClient.requestPasswordReset({ email: email.trim() });
      if (result.error) {
        setFailure(err(result.error.status === 429 ? 'auth.error.rate-limit' : 'auth.error.reset-request'));
      } else {
        setSubmitted(email.trim());
      }
    } catch {
      setFailure(err('auth.error.network'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={onSubmit} className="flex flex-col gap-5" aria-busy={pending}>
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
          disabled={pending}
          failure={failure}
        />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} disabled={!hydrated || pending}>
          {t(pending ? 'auth.forgot.pending' : 'auth.forgot.submit')}
        </Button>
      </form>

      {submitted === null ? null : (
        <div role="status" className="flex animate-enter gap-4 border border-t-2 border-rule border-t-ok-mid bg-paper px-5 py-4">
          <Icon name="mail" size={28} tint="neutral" className="mt-0.5 text-ok-ink" />
          <div className="flex flex-col gap-2">
            <p className="font-display text-lg font-semibold text-ink">{t('auth.forgot.success-title')}</p>
            <p className="text-sm text-ink-2">{t('auth.forgot.success-body', { email: submitted })}</p>
            <Button asChild variant="primary" size="lg" iconRight="arrow-right" className="mt-1 self-start">
              <Link href="/reset-password">{t('auth.forgot.next')}</Link>
            </Button>
          </div>
        </div>
      )}

      <Link href="/login" className={`${AUTH_LINK} self-start text-sm`}>
        {t('auth.forgot.back')}
      </Link>
    </div>
  );
}
