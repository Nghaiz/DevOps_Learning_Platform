'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle, Button, Input, Label } from '@devops-platform/ui';
import { err, t } from '@devops-platform/copy';
import type { ErrorEntry } from '@devops-platform/copy/types';
import { AuthFailure } from '../../components/shell/auth-failure';
import { authClient } from '../../lib/auth-client';

/** Email codes enter the POST body only, never the URL or browser storage. */
export function ResetPasswordForm() {
  const fieldId = useId();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [failure, setFailure] = useState<ErrorEntry | null>(null);
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
      setFailure(err('auth.error.password-mismatch'));
      return;
    }
    setPending(true);
    setFailure(null);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token: code.trim() });
      if (result.error) {
        setFailure(
          err(result.error.status >= 500 ? 'auth.error.network' : 'auth.error.reset-invalid'),
        );
      } else {
        setCode('');
        setPassword('');
        setConfirm('');
        setSubmitted(true);
      }
    } catch {
      setFailure(err('auth.error.network'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {submitted ? (
        <Alert role="status">
          <AlertTitle>{t('auth.reset.success-title')}</AlertTitle>
          <AlertDescription>{t('auth.reset.success-body')}</AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-busy={pending}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-code`}>{t('auth.reset.code')}</Label>
            <Input
              id={`${fieldId}-code`}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={128}
              disabled={pending}
              aria-describedby={`${fieldId}-code-hint`}
            />
            <p id={`${fieldId}-code-hint`} className="text-xs text-muted-foreground">
              {t('auth.reset.code-hint')}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-password`}>{t('auth.field.new-password')}</Label>
            <Input
              id={`${fieldId}-password`}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              disabled={pending}
              invalid={failure !== null}
            />
            <p className="text-xs text-muted-foreground">{t('auth.field.password-hint')}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-confirm`}>{t('auth.field.confirm-password')}</Label>
            <Input
              id={`${fieldId}-confirm`}
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              disabled={pending}
              invalid={failure !== null}
            />
          </div>
          {failure === null ? null : <AuthFailure entry={failure} />}
          <Button type="submit" disabled={!hydrated || pending}>
            {t(pending ? 'auth.reset.pending' : 'auth.reset.submit')}
          </Button>
        </form>
      )}
      <Link
        href="/login"
        className="rounded-sm self-start text-sm text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('auth.reset.back')}
      </Link>
    </div>
  );
}
