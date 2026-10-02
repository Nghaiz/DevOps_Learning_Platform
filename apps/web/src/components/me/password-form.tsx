'use client';

import { useId, useState, type FormEvent, type ReactElement } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Input, Label } from '@devops-platform/ui';
import { t } from '@devops-platform/copy';
import { authClient } from '../../lib/auth-client';
import { Split } from '../kit';
import {
  MIN_PASSWORD_LENGTH,
  describePasswordChangeError,
  describePasswordSection,
  saveStateOf,
  validatePasswordChange,
} from './account-sections';
import { SaveStatus } from './save-status';

/**
 * Khối "Mật khẩu": đổi qua Better Auth (`/api/auth/change-password`), KHÔNG qua
 * tRPC. Bọc lại bằng một procedure riêng nghĩa là tự cầm mật khẩu thô đi qua một
 * tầng nữa.
 *
 * Tài khoản Google/Microsoft không có mật khẩu: form ẩn và một câu nói vì sao
 * (`describePasswordSection`), không phải một khối trống.
 */
export function PasswordForm({ hasPassword }: { readonly hasPassword: boolean }): ReactElement {
  const fieldId = useId();
  const section = describePasswordSection(hasPassword);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!section.visible) {
    return (
      <Split index="02" title={t('me.password.title')}>
        <div className="max-w-xl border-t-4 border-border bg-card p-5">
          <p className="type-title">{t('me.password.hidden-title')}</p>
          <p className="mt-2 text-sm text-muted-foreground">{section.reason}</p>
        </div>
      </Split>
    );
  }

  const dirty = current !== '' || next !== '' || confirm !== '';
  const state = saveStateOf({ dirty, pending: saving, saved: done, failed: error !== null });

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setDone(false);

    const invalid = validatePasswordChange({ current, next, confirm });
    if (invalid !== null) {
      setError(invalid);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const result = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        // KHÔNG thu hồi phiên khác: người học có thể đang chạy lab ở tab khác, và
        // đá họ ra giữa bài là tác dụng phụ không ai xin.
        revokeOtherSessions: false,
      });
      if (result.error != null) {
        setError(describePasswordChangeError(result.error.code ?? null, result.error.message ?? null));
        return;
      }
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (cause: unknown) {
      setError(describePasswordChangeError(null, cause instanceof Error ? cause.message : null));
    } finally {
      setSaving(false);
    }
  }

  const errorId = `${fieldId}-error`;
  const touch = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setDone(false);
  };

  return (
    <Split
      index="02"
      title={t('me.password.title')}
      aside={
        <>
          <p>{t('me.password.description', { min: MIN_PASSWORD_LENGTH })}</p>
          <SaveStatus state={state} />
        </>
      }
    >
      <form
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        className="flex max-w-xl flex-col gap-5"
      >
        <PasswordField
          id={`${fieldId}-current`}
          label={t('me.password.field.current')}
          autoComplete="current-password"
          value={current}
          onChange={touch(setCurrent)}
          describedBy={error === null ? undefined : errorId}
        />
        <PasswordField
          id={`${fieldId}-next`}
          label={t('me.password.field.next')}
          autoComplete="new-password"
          value={next}
          onChange={touch(setNext)}
          describedBy={error === null ? undefined : errorId}
        />
        <PasswordField
          id={`${fieldId}-confirm`}
          label={t('me.password.field.confirm')}
          autoComplete="new-password"
          value={confirm}
          onChange={touch(setConfirm)}
          describedBy={error === null ? undefined : errorId}
        />

        {error !== null && (
          <p id={errorId} role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}
        {done && <p className="text-sm text-success">{t('me.password.done')}</p>}

        <div>
          <Button type="submit" loading={saving}>
            {t('me.password.submit')}
          </Button>
        </div>
      </form>
    </Split>
  );
}

function PasswordField(props: {
  readonly id: string;
  readonly label: string;
  readonly autoComplete: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly describedBy: string | undefined;
}): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={props.id} className="text-[13px]">
        {props.label}
      </Label>
      <Input
        id={props.id}
        type="password"
        autoComplete={props.autoComplete}
        value={props.value}
        aria-describedby={props.describedBy}
        invalid={props.describedBy !== undefined}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
    </div>
  );
}
