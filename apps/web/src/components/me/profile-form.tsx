'use client';

import { useEffect, useId, useState, type FormEvent, type ReactElement } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@devops-platform/ui';
import { err, t } from '@devops-platform/copy';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';

/** Khớp `updateProfileInput` của `routers/me.ts` — `z.string().min(1).max(80)`. */
const MAX_NAME_LENGTH = 80;

/**
 * Tên hiển thị. Vai trò và email chỉ ĐỌC ở đây.
 *
 * `me.updateProfile` chỉ nhận `name`; email đổi qua Better Auth (`changeEmail`,
 * cần xác thực lại) và vai trò chỉ admin đổi được (`admin.users.setRole`). Hiện
 * chúng dưới dạng ô nhập rồi từ chối lúc lưu sẽ tệ hơn là không hiện ô nhập.
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

  // Tên trên server là nguồn sự thật; ô nhập chỉ là bản nháp của lượt sửa này.
  // Khi `me.get` trả về giá trị mới (lưu xong, hoặc đổi ở tab khác) thì nháp
  // phải đi theo — nếu không, người dùng nhìn một cái tên cũ và tin nó là thật.
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

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSaved(false);
    if (invalid) {
      return;
    }
    updateProfile.mutate({ name: trimmed });
  }

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <CardHeader>
          <CardTitle>{t('me.profile.title')}</CardTitle>
          <CardDescription>{t('me.profile.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-name`}>{t('me.profile.name-label')}</Label>
            <Input
              id={`${fieldId}-name`}
              value={name}
              maxLength={MAX_NAME_LENGTH}
              invalid={invalid}
              autoComplete="name"
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
            />
            {trimmed === '' && (
              <p className="text-xs text-destructive">{t('me.profile.name-empty')}</p>
            )}
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t('me.profile.email-label')}</dt>
            <dd className="text-foreground">{props.email}</dd>
            <dt className="text-muted-foreground">{t('me.profile.role-label')}</dt>
            <dd className="text-foreground">{props.roleLabel}</dd>
          </dl>

          {updateProfile.isError && <SaveError error={updateProfile.error} />}

          {saved && !updateProfile.isPending && (
            <Alert variant="success">
              <AlertDescription>{t('me.profile.saved')}</AlertDescription>
            </Alert>
          )}

          <div>
            <Button type="submit" loading={updateProfile.isPending} disabled={invalid}>
              {t('me.profile.save')}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}

/**
 * `Alert` chỉ có MỘT khe nội dung, nên hai nửa của `ErrorEntry` được ghép ở
 * đây. Đó là ca ghép hợp lệ mà `session-summary.ts` mô tả: ghép khi nơi nhận
 * có đúng một khe, tách khi nó có hai (`ErrorState`).
 */
function SaveError({ error }: { readonly error: unknown }): ReactElement {
  const entry = err('me.error.profile-save', { reason: describeTrpcError(error) });
  return (
    <Alert variant="destructive">
      <AlertDescription>{`${entry.what} ${entry.next}`}</AlertDescription>
    </Alert>
  );
}
