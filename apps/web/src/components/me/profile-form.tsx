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
          <CardTitle>Hồ sơ</CardTitle>
          <CardDescription>Tên này hiện trên bảng xếp hạng khi bạn cho phép.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-name`}>Tên hiển thị</Label>
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
              <p className="text-xs text-destructive">Tên không được để trống. Nhập ít nhất một ký tự.</p>
            )}
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="text-foreground">{props.email}</dd>
            <dt className="text-muted-foreground">Vai trò</dt>
            <dd className="text-foreground">{props.roleLabel}</dd>
          </dl>

          {updateProfile.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {describeTrpcError(updateProfile.error)} Sửa lại tên rồi lưu; nếu vẫn hỏng thì tải
                lại trang.
              </AlertDescription>
            </Alert>
          )}

          {saved && !updateProfile.isPending && (
            <Alert variant="success">
              <AlertDescription>Đã lưu tên hiển thị.</AlertDescription>
            </Alert>
          )}

          <div>
            <Button type="submit" loading={updateProfile.isPending} disabled={invalid}>
              Lưu tên
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
