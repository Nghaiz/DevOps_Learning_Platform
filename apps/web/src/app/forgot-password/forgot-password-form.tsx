'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, MailCheck } from 'lucide-react';
import { Button } from '@devops-platform/ui';
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
        <Button type="submit" size="lg" className="h-12 w-full" disabled={!hydrated || pending}>
          {t(pending ? 'auth.forgot.pending' : 'auth.forgot.submit')}
        </Button>
      </form>

      {submitted === null ? null : (
        <div role="status" className="flex animate-rise gap-4 border-t-4 border-success bg-card p-5">
          <MailCheck aria-hidden="true" className="size-6 shrink-0 text-success" />
          <div className="flex flex-col gap-3">
            <p className="type-title">{t('auth.forgot.success-title')}</p>
            <p className="text-sm text-muted-foreground">{t('auth.forgot.success-body', { email: submitted })}</p>
            <Button asChild variant="ink" className="h-12 self-start">
              <Link href="/reset-password">
                {t('auth.forgot.next')}
                <ArrowRight aria-hidden="true" />
              </Link>
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
