'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle, Button, Input, Label } from '@devops-platform/ui';
import { err, t } from '@devops-platform/copy';
import type { ErrorEntry } from '@devops-platform/copy/types';
import { authClient } from '../../lib/auth-client';
import { AuthFailure } from '../../components/shell/auth-failure';

/**
 * Màn `/forgot-password`. Từ lane 16.D, form này GỌI THẬT.
 *
 * ## Lượt trước cố ý không gọi gì, và lượt này gỡ đúng chỗ đó
 *
 * 16.B dựng màn này khi chưa có đường gửi thư, và chọn "không gọi gì, nói thẳng
 * rằng đường gửi chưa nối" thay vì gọi một endpoint không tồn tại rồi hiện "đã
 * gửi mail". Chỉ dẫn để lại: ngày backend lên thì XOÁ khoá `unavailable-*` rồi
 * thêm khoá thành công thật, đừng sửa câu tại chỗ. Đã làm đúng thế, xem
 * `packages/copy/src/surfaces/auth.ts`.
 *
 * ## ⛔ Phản hồi PHẢI giống hệt nhau dù email có tồn tại hay không
 *
 * Better Auth trả cùng một body cho cả hai ca (`dist/api/routes/password.mjs`:
 * nhánh không tìm thấy user vẫn sinh một id giả và vẫn tra một hàng giả trong
 * bảng verification, để chống cả tấn công đo thời gian). Màn này là nửa còn lại
 * của lớp phòng thủ đó: KHÔNG rẽ nhánh giao diện theo bất cứ thứ gì suy ra được
 * từ phản hồi, và câu hiện ra nói "nếu email đó có tài khoản" chứ không nói "đã
 * gửi tới bạn".
 *
 * Một rẽ nhánh vô tình ở đây, dù chỉ là một dòng chữ khác nhau, làm hỏng toàn bộ
 * phần chống dò tài khoản mà máy chủ vừa dựng. `security/password-reset.integration.test.ts`
 * khẳng định hai phản hồi giống nhau ở tầng máy chủ; ô này là quy ước ở tầng
 * giao diện.
 *
 * ## `requestPasswordReset`, KHÔNG phải `forgetPassword`
 *
 * better-auth 1.6.26 cấp endpoint `/request-password-reset` và client suy tên
 * phương thức từ đường dẫn đó. `forgetPassword` (tên trong nhiều hướng dẫn cũ)
 * KHÔNG tồn tại ở bản này: grep `dist/` ra đúng ba file, cả ba thuộc plugin
 * `email-otp`. Đọc mã thư viện chứ không đọc tài liệu.
 */
export function ForgotPasswordForm() {
  const fieldId = useId();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
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
    setSentTo(null);
    setPending(true);
    try {
      const { error: authError } = await authClient.requestPasswordReset({ email });
      if (authError) {
        // Chuỗi của thư viện là chữ NGƯỜI VẬN HÀNH đọc, nên nó ở lại tiếng Anh
        // và KHÔNG vào `packages/copy` (§1.7: log không vào bản đồ). Cùng quyết
        // định đã ghi ở `login-form.tsx`.
        console.error('[auth] request-password-reset rejected', authError);
        setFailure(err('auth.error.forgot'));
        return;
      }
      setSentTo(email);
    } catch (networkError: unknown) {
      // Mạng chết KHÁC hẳn máy chủ từ chối: ta chưa biết yêu cầu có tới nơi hay
      // không, nên câu `next` phải nói "kiểm tra kết nối", không nói "kiểm tra
      // lại email".
      console.error('[auth] request-password-reset request failed', networkError);
      setFailure(err('auth.error.network'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
            invalid={failure !== null}
          />
        </div>

        {failure === null ? null : <AuthFailure entry={failure} />}

        <Button type="submit" disabled={!hydrated || pending}>
          {t('auth.forgot.submit')}
        </Button>
      </form>

      {sentTo === null ? null : (
        /*
          `role="status"` chứ không `role="alert"`: đây là kết quả của một hành
          động người dùng vừa chủ động làm, không phải một lỗi cần ngắt lời
          trình đọc màn hình.

          `variant="success"` KHÔNG dùng ở đây dù lượt gửi đã thành công: màu
          thành công đọc ra là "email của bạn có tài khoản và thư đang tới", tức
          đúng cái khẳng định mà máy chủ cố tình không đưa ra.
        */
        <Alert role="status">
          <AlertTitle>{t('auth.forgot.sent-title')}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>{t('auth.forgot.sent-body', { email: sentTo })}</span>
            <span>{t('auth.forgot.sent-next')}</span>
          </AlertDescription>
        </Alert>
      )}

      <Link
        href="/login"
        className="rounded-sm self-start text-sm text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('auth.forgot.back')}
      </Link>
    </div>
  );
}
