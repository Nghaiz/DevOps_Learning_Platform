'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle, Button, Input, Label } from '@devops-platform/ui';
import { err, t } from '@devops-platform/copy';
import type { ErrorEntry } from '@devops-platform/copy/types';
import { AuthFailure } from '../../components/shell/auth-failure';

/**
 * Màn `/reset-password`. Từ lane 16.D, form này GỌI THẬT.
 *
 * ## KHÔNG đọc mã từ URL, và đó là LUẬT 8 chứ không phải sở thích
 *
 * Bản đầu của màn này đọc mã dùng một lần ra khỏi query string rồi phân hai
 * nhánh: có mã thì hiện form, không có mã thì hiện một bảng "liên kết thiếu mã".
 * Nó bị `src/security/rule-08-no-token-in-url.test.ts` bắt, và cổng đó ĐÚNG:
 * luật 8 của dự án cấm mọi token đi qua query string, vì URL nằm trong lịch sử
 * trình duyệt, trong log của proxy, và trong header `Referer` gửi kèm mọi tài
 * nguyên bên thứ ba mà trang nạp.
 *
 * Chỉ dẫn để lại lúc ấy: "ngày backend lên, mã dùng một lần phải tới qua một
 * đường khác (thân POST, hoặc một cookie do chính đường xử lý liên kết đặt), và
 * phần dựng dưới đây không phải đổi."
 *
 * Lượt này chọn đường COOKIE, và phần dựng thật sự không phải đổi. Toàn bộ ba
 * bước nằm ở `server/auth/reset-link.ts`. Điều component này cần biết gọn trong
 * một câu: mã nằm trong một cookie `HttpOnly` mà JavaScript ở đây KHÔNG đọc
 * được, nên form chỉ gửi mật khẩu mới, và máy chủ tự ghép mã vào.
 *
 * Hệ quả đáng nói: `authClient.resetPassword` KHÔNG dùng được từ đây, vì nó cần
 * mã trong tham số. Đường đi là `POST /api/auth/reset-finish`, cùng khuôn với
 * `fetch('/api/auth/refresh')` mà `login-form.tsx` đã dùng.
 *
 * ## Phép kiểm hai ô khớp nhau chạy TRƯỚC khi gọi mạng
 *
 * Nó là logic thuần và nó biết câu trả lời chắc chắn, nên gửi một request để
 * máy chủ nói lại điều ta đã biết chỉ mua thêm một vòng chờ.
 */
export function ResetPasswordForm() {
  const fieldId = useId();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [failure, setFailure] = useState<ErrorEntry | null>(null);
  const [done, setDone] = useState(false);
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
    if (password !== confirm) {
      setFailure(err('auth.error.password-mismatch'));
      return;
    }
    setFailure(null);
    setPending(true);
    try {
      const response = await fetch('/api/auth/reset-finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newPassword: password }),
      });
      if (response.ok) {
        setDone(true);
        setPassword('');
        setConfirm('');
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      const code =
        typeof body === 'object' && body !== null
          ? (body as Record<string, unknown>)['error']
          : undefined;
      console.error('[auth] reset-finish rejected', response.status, code);
      setFailure(err(failureKeyFor(code)));
    } catch (networkError: unknown) {
      console.error('[auth] reset-finish request failed', networkError);
      setFailure(err('auth.error.network'));
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-5">
        <Alert role="status">
          <AlertTitle>{t('auth.reset.done-title')}</AlertTitle>
          <AlertDescription>{t('auth.reset.done-body')}</AlertDescription>
        </Alert>
        <BackToLogin />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${fieldId}-password`}>{t('auth.field.new-password')}</Label>
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
            onChange={(event) => {
              setConfirm(event.target.value);
            }}
            required
            autoComplete="new-password"
            minLength={8}
            invalid={failure !== null}
          />
        </div>

        {failure === null ? null : <AuthFailure entry={failure} />}

        <Button type="submit" disabled={!hydrated || pending}>
          {t('auth.reset.submit')}
        </Button>
      </form>

      <BackToLogin />
    </div>
  );
}

/**
 * Ba mã lỗi của `/api/auth/reset-finish` về hai câu, và một nhánh cho thứ không
 * nằm trong hợp đồng.
 *
 * `no-link` và `invalid-link` tách nhau ở tầng máy chủ để log phân biệt được
 * "tới thẳng trang" với "liên kết hết hạn", nhưng người dùng phải làm CÙNG một
 * việc, nên chúng về cùng một câu.
 *
 * Nhánh mặc định dùng `auth.error.network` cho một mã trạng thái ngoài hợp đồng
 * (một 500 chưa bắt được ở đâu đó). Câu đó nói "chưa biết yêu cầu vừa rồi có
 * thành công hay không", và với một lỗi chưa xử lý thì đó đúng là sự thật: mật
 * khẩu CÓ THỂ đã đổi trước lúc sập.
 */
function failureKeyFor(
  code: unknown,
): 'auth.error.reset-link' | 'auth.error.password-too-short' | 'auth.error.network' {
  if (code === 'no-link' || code === 'invalid-link') {
    return 'auth.error.reset-link';
  }
  if (code === 'weak-password') {
    return 'auth.error.password-too-short';
  }
  return 'auth.error.network';
}

function BackToLogin() {
  return (
    <Link
      href="/login"
      className="rounded-sm self-start text-sm text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {t('auth.reset.back')}
    </Link>
  );
}
