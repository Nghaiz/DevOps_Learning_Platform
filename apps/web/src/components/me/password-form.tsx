'use client';

import { useState, type FormEvent, type ReactElement } from 'react';
import { Button, Field, Input, Notice, Section } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import { authClient } from '../../lib/auth-client';
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
  const section = describePasswordSection(hasPassword);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!section.visible) {
    return (
      <Section title={t('me.password.title')} icon="key">
        <Notice tone="info" title={t('me.password.hidden-title')}>
          {section.reason}
        </Notice>
      </Section>
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

  const touch = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setDone(false);
  };

  return (
    <Section
      title={t('me.password.title')}
      description={t('me.password.description', { min: MIN_PASSWORD_LENGTH })}
      icon="key"
    >
      <form
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        className="flex flex-col gap-5"
      >
        <Field label={t('me.password.field.current')}>
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            invalid={error !== null}
            onChange={(event) => touch(setCurrent)(event.target.value)}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('me.password.field.next')}>
            <Input
              type="password"
              autoComplete="new-password"
              value={next}
              invalid={error !== null}
              onChange={(event) => touch(setNext)(event.target.value)}
            />
          </Field>
          <Field label={t('me.password.field.confirm')}>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              invalid={error !== null}
              onChange={(event) => touch(setConfirm)(event.target.value)}
            />
          </Field>
        </div>

        {error === null ? null : (
          <Notice tone="bad" role="alert">
            {error}
          </Notice>
        )}
        {done ? (
          <Notice tone="ok" role="status">
            {t('me.password.done')}
          </Notice>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>
            {t('me.password.submit')}
          </Button>
          {/* "Đã lưu" đã có câu đầy đủ ở thông báo phía trên, không nói hai lần. */}
          <SaveStatus state={state === 'saved' ? 'idle' : state} />
        </div>
      </form>
    </Section>
  );
}
