'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { Button, Field, Input, Notice, Section, SummaryList } from '@devops-platform/ds';
import { err, t } from '@devops-platform/copy';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { saveStateOf } from './account-sections';
import { SaveStatus } from './save-status';

/** Khớp `updateProfileInput` của `routers/me.ts`: `z.string().min(1).max(80)`. */
const MAX_NAME_LENGTH = 80;

/**
 * Khối "Hồ sơ": sửa tên hiển thị. Email và vai trò chỉ ĐỌC: `me.updateProfile`
 * chỉ nhận `name`; email đổi qua Better Auth (cần xác thực lại), vai trò chỉ
 * admin đổi được. Hiện chúng thành ô nhập rồi từ chối lúc lưu là tệ hơn.
 *
 * Lưu xong thì `router.refresh()`: tên trên thanh đầu trang đến từ phiên đọc ở
 * server, không đến từ `me.get`, nên chỉ invalidate query thì thanh trên vẫn giữ
 * tên cũ cho tới lần tải trang sau.
 */
export function ProfileForm(props: {
  readonly name: string;
  readonly email: string;
  readonly roleLabel: string;
}): ReactElement {
  const router = useRouter();
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
      router.refresh();
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
    if (invalid) return;
    updateProfile.mutate({ name: trimmed });
  }

  const saveError = updateProfile.isError
    ? err('me.error.profile-save', { reason: describeTrpcError(updateProfile.error) })
    : null;

  return (
    <Section title={t('me.profile.title')} description={t('me.profile.description')} icon="user">
      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <Field label={t('me.profile.name-label')} error={trimmed === '' ? t('me.profile.name-empty') : undefined}>
          <Input
            value={name}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="name"
            inputSize="lg"
            onChange={(event) => {
              setName(event.target.value);
              setSaved(false);
            }}
          />
        </Field>

        <SummaryList
          items={[
            { key: 'email', label: t('me.profile.email-label'), value: <span className="break-all">{props.email}</span> },
            { key: 'role', label: t('me.profile.role-label'), value: props.roleLabel },
          ]}
        />

        {saveError === null ? null : (
          <Notice tone="bad" role="alert" title={saveError.what}>
            {saveError.next}
          </Notice>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" loading={updateProfile.isPending} disabled={invalid || !dirty}>
            {t('me.profile.save')}
          </Button>
          <SaveStatus state={state} />
        </div>
      </form>
    </Section>
  );
}
