'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@devops-platform/ui';
import { err, t } from '@devops-platform/copy';
import type { ErrorEntry } from '@devops-platform/copy/types';
import { authClient } from '../../lib/auth-client';
import { AuthOAuth } from '../../components/shell/auth-oauth';
import { AuthFailure } from '../../components/shell/auth-failure';

/**
 * Form đăng ký, tách khỏi `/login` ở 16.B.
 *
 * Ba khác biệt THẬT so với form đăng nhập, và cả ba đều là lý do để hai màn
 * hình là hai file chứ không phải một biến `mode`:
 *
 * 1. Có trường tên hiển thị, và nó bắt buộc ở tầng HTML.
 * 2. `autoComplete="new-password"` để trình quản lý mật khẩu đề xuất một mật
 *    khẩu mới thay vì điền lại mật khẩu của trang khác.
 * 3. `minLength={8}` cộng một dòng gợi ý ngay dưới ô. Trang đăng nhập KHÔNG
 *    được có ràng buộc đó: một tài khoản cũ với mật khẩu 6 ký tự sẽ bị chính
 *    trình duyệt chặn ngay tại ô nhập, trước khi có request nào, và người dùng
 *    không có cách nào hiểu vì sao.
 *
 * Ba khác biệt đó là ba dòng `if (signingIn)` trong bản cũ. Chúng không biến
 * mất khi gộp hai màn, chúng chỉ chuyển từ ranh giới file sang ranh giới câu
 * lệnh, chỗ khó đọc hơn.
 */
export function RegisterForm() {
  const router = useRouter();
  const fieldId = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<ErrorEntry | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * ⚠ MỌI nút trong form này khoá cho tới khi React gắn xong handler.
   *
   * Trước bản này, `<form onSubmit>` cộng `<button type="submit">` do server
   * render nên nút bấm được NGAY, nhưng cho tới lúc hydrate, một cú bấm chạy
   * đường submit NATIVE của trình duyệt: GET lại chính trang này, chữ vừa gõ
   * mất, và không một request nào tới máy chủ xác thực. Người dùng thấy đúng
   * một thứ: trang tự tải lại, không lý do. Đo 2026-09-07
   * (`reports/2026-09-07-verify-p13.md` mục 3.4a).
   *
   * Không rò rỉ khi bấm sớm (đã kiểm): các `Input` không khai `name`, nên lượt
   * submit native không mang tham số nào, mật khẩu không lên URL. Bản vá này
   * đóng phần mất dữ liệu và mất lòng tin, không phải một lỗ bảo mật.
   */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    setPending(true);
    try {
      const { error: authError } = await authClient.signUp.email({ email, password, name });
      if (authError) {
        console.error('[auth] sign-up rejected', authError);
        setFailure(err('auth.error.sign-up'));
        return;
      }
      await fetch('/api/auth/refresh', { method: 'POST' }).catch((bootstrapError: unknown) => {
        console.error('[auth] refresh bootstrap failed, rotation inactive', bootstrapError);
      });
      router.push('/me');
      router.refresh();
    } catch (networkError: unknown) {
      console.error('[auth] sign-up request failed', networkError);
      setFailure(err('auth.error.network'));
    } finally {
      setPending(false);
    }
  }

  const invalid = failure !== null;

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${fieldId}-name`}>{t('auth.field.name')}</Label>
          <Input
            id={`${fieldId}-name`}
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            required
            autoComplete="name"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${fieldId}-email`}>{t('auth.field.email')}</Label>
          <Input
            id={`${fieldId}-email`}
            type="email"
            placeholder={t('auth.field.email-placeholder')}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            required
            autoComplete="email"
            invalid={invalid}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${fieldId}-password`}>{t('auth.field.password')}</Label>
          <Input
            id={`${fieldId}-password`}
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            required
            autoComplete="new-password"
            minLength={8}
            invalid={invalid}
          />
          <p className="text-xs text-muted-foreground">{t('auth.field.password-hint')}</p>
        </div>

        {failure === null ? null : <AuthFailure entry={failure} />}

        <Button type="submit" loading={pending} disabled={!hydrated}>
          {t('auth.register.submit')}
        </Button>
      </form>

      <AuthOAuth hydrated={hydrated} />

      <Link
        href="/login"
        className="rounded-sm self-start text-sm text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('auth.register.to-login')}
      </Link>
    </div>
  );
}
