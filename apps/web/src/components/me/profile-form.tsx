'use client';

import { useEffect, useId, useState, type FormEvent, type ReactElement } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Input, Label } from '@devops-platform/ui';
import { err, t } from '@devops-platform/copy';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { Split } from '../kit';
import { saveStateOf } from './account-sections';
import { SaveStatus } from './save-status';

/** Khớp `updateProfileInput` của `routers/me.ts`: `z.string().min(1).max(80)`. */
const MAX_NAME_LENGTH = 80;

/**
 * Khối "Hồ sơ": sửa tên hiển thị. Email và vai trò chỉ ĐỌC: `me.updateProfile`
 * chỉ nhận `name`; email đổi qua Better Auth (cần xác thực lại), vai trò chỉ
 * admin đổi được. Hiện chúng thành ô nhập rồi từ chối lúc lưu là tệ hơn.
 */
export function ProfileForm(props: {
  readonly name: string;
  readonly email: string;
  readonly roleLabel: string;
}): ReactElement {
  const fieldId = useId();
  const utils = api.useUtils();
  const [name, setName] = useState(props.name);
  const [saved, setSaved] = useState(false);

  // Tên trên server là nguồn sự thật; ô nhập là nháp. Server đổi thì nháp theo.
  useEffect(() => {
    setName(props.name);
  }, [props.name]);

  const updateProfile = api.me.updateProfile.useMutation({
    onSuccess: async () => {
      setSaved(true);
      await utils.me.get.invalidate();
    },
  });

  const trimmed = name.trim();
  const invalid = trimmed === '' || trimmed.length > MAX_NAME_LENGTH;
  const dirty = trimmed !== props.name;
  const state = saveStateOf({
    dirty,
    pending: updateProfile.isPending,
    saved,
    failed: updateProfile.isError,
  });

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSaved(false);
    if (invalid) {
      return;
    }
    updateProfile.mutate({ name: trimmed });
  }

  const errorId = `${fieldId}-name-error`;
  const saveError = updateProfile.isError
    ? err('me.error.profile-save', { reason: describeTrpcError(updateProfile.error) })
    : null;

  return (
    <Split
      index="01"
      title={t('me.profile.title')}
      aside={
        <>
          <p>{t('me.profile.description')}</p>
          <SaveStatus state={state} />
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${fieldId}-name`} className="text-[13px]">
            {t('me.profile.name-label')}
          </Label>
          <Input
            id={`${fieldId}-name`}
            value={name}
            maxLength={MAX_NAME_LENGTH}
            invalid={trimmed === ''}
            aria-describedby={trimmed === '' ? errorId : undefined}
            autoComplete="name"
            onChange={(event) => {
              setName(event.target.value);
              setSaved(false);
            }}
          />
          {trimmed === '' && (
            <p id={errorId} className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
              {t('me.profile.name-empty')}
            </p>
          )}
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y border-border py-4 text-sm">
          <dt className="type-label text-muted-foreground">{t('me.profile.email-label')}</dt>
          <dd className="break-all">{props.email}</dd>
          <dt className="type-label text-muted-foreground">{t('me.profile.role-label')}</dt>
          <dd>{props.roleLabel}</dd>
        </dl>

        {saveError !== null && (
          <p role="alert" className="flex items-start gap-2 text-sm">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>
              <span className="block font-semibold text-destructive">{saveError.what}</span>
              <span className="block text-muted-foreground">{saveError.next}</span>
            </span>
          </p>
        )}

        <div>
          <Button type="submit" loading={updateProfile.isPending} disabled={invalid || !dirty}>
            {t('me.profile.save')}
          </Button>
        </div>
      </form>
    </Split>
  );
}
