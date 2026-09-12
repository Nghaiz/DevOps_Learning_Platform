'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle, Button, Input, Label } from '@devops-platform/ui';
import { err, t } from '@devops-platform/copy';
import type { ErrorEntry } from '@devops-platform/copy/types';
import { authClient } from '../../lib/auth-client';
import { AuthFailure } from '../../components/shell/auth-failure';

/** The success response intentionally does not reveal whether an account exists. */
export function ForgotPasswordForm() {
  const fieldId = useId();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [failure, setFailure] = useState<ErrorEntry | null>(null);
  const [pending, setPending] = useState(false);
  // Prevent native GET submission before the client event handler is attached.
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
        setFailure(err('auth.error.reset-request'));
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
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-busy={pending}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${fieldId}-email`}>{t('auth.field.email')}</Label>
          <Input
            id={`${fieldId}-email`}
            type="email"
            placeholder={t('auth.field.email-placeholder')}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            disabled={pending}
          />
        </div>
        {failure === null ? null : <AuthFailure entry={failure} />}
        <Button type="submit" disabled={!hydrated || pending}>
          {t(pending ? 'auth.forgot.pending' : 'auth.forgot.submit')}
        </Button>
      </form>

      {submitted === null ? null : (
        <Alert role="status">
          <AlertTitle>{t('auth.forgot.success-title')}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>{t('auth.forgot.success-body', { email: submitted })}</span>
            <Link href="/reset-password" className="text-primary underline underline-offset-4">
              {t('auth.forgot.next')}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <Link
        href="/login"
        className="rounded-sm self-start text-sm text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('auth.forgot.back')}
      </Link>
    </div>
  );
}
