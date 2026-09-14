'use client';

import { useId, useState, type FormEvent, type ReactElement } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@devops-platform/ui';
import { t } from '@devops-platform/copy';
import { authClient } from '../../lib/auth-client';
import {
  MIN_PASSWORD_LENGTH,
  describePasswordChangeError,
  describePasswordSection,
  validatePasswordChange,
} from './account-sections';

/**
 * Đổi mật khẩu — đi qua Better Auth, KHÔNG qua tRPC.
 *
 * `/api/auth/change-password` là route của Better Auth (catch-all
 * `app/api/auth/[...all]`), không phải một procedure trong `routers/me.ts`. Bọc
 * lại nó bằng một procedure của mình sẽ phải tự cầm mật khẩu thô đi qua một
 * tầng nữa — đúng thứ không nên tự viết khi thư viện đã có đường.
 *
 * Ẩn/hiện quyết định bởi `describePasswordSection(hasPassword)`; xem ở đó vì
 * sao "ẩn" phải kèm một câu giải thích, không phải một `&&` im lặng.
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
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t('me.password.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTitle>{t('me.password.hidden-title')}</AlertTitle>
            <AlertDescription>{section.reason}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

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
        // KHÔNG thu hồi phiên đăng nhập khác: người học có thể đang chạy một
        // lab ở tab/máy khác, và đá họ ra giữa bài là một tác dụng phụ không ai
        // xin. Đây là một quyết định, không phải một mặc định bỏ quên.
        revokeOtherSessions: false,
      });
      if (result.error != null) {
        setError(
          describePasswordChangeError(result.error.code ?? null, result.error.message ?? null),
        );
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

  return (
    <Card>
      <form
        onSubmit={(event) => {
          void onSubmit(event);
        }}
      >
        <CardHeader>
          <CardTitle as="h2">{t('me.password.title')}</CardTitle>
          <CardDescription>
            {t('me.password.description', { min: MIN_PASSWORD_LENGTH })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex max-w-md flex-col gap-4">
          <PasswordField
            id={`${fieldId}-current`}
            label={t('me.password.field.current')}
            autoComplete="current-password"
            value={current}
            onChange={(value) => {
              setCurrent(value);
              setDone(false);
            }}
          />
          <PasswordField
            id={`${fieldId}-next`}
            label={t('me.password.field.next')}
            autoComplete="new-password"
            value={next}
            onChange={(value) => {
              setNext(value);
              setDone(false);
            }}
          />
          <PasswordField
            id={`${fieldId}-confirm`}
            label={t('me.password.field.confirm')}
            autoComplete="new-password"
            value={confirm}
            onChange={(value) => {
              setConfirm(value);
              setDone(false);
            }}
          />

          {error !== null && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {done && (
            <Alert variant="success">
              <AlertDescription>{t('me.password.done')}</AlertDescription>
            </Alert>
          )}

          <div>
            <Button type="submit" loading={saving}>
              {t('me.password.submit')}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}

function PasswordField(props: {
  readonly id: string;
  readonly label: string;
  readonly autoComplete: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        type="password"
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
    </div>
  );
}
