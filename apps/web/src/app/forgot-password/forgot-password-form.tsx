'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle, Button, Input, Label } from '@devops-platform/ui';
import { t } from '@devops-platform/copy';

/**
 * Màn `/forgot-password`, FRONTEND-ONLY ở đợt này.
 *
 * ## Biểu mẫu này KHÔNG gọi mạng, và đó là một lựa chọn
 *
 * `phase-16.md` 16.B: chưa có backend gửi mail. Ba đường đi có thể:
 *
 * 1. Gọi một endpoint chưa tồn tại, rồi hiện "Đã gửi mail" khi nó trả 404. Đó
 *    là nói dối, và nó là rủi ro có tên trong §5 của plan.
 * 2. Gọi endpoint đó rồi hiện một lỗi 404 thô. Người dùng đọc ra là "hệ thống
 *    hỏng", trong khi sự thật là "tính năng chưa bật".
 * 3. KHÔNG gọi gì, và nói thẳng rằng đường gửi thư chưa được nối.
 *
 * Chọn 3. Một request tới một đường không tồn tại không mua được gì: nó không
 * làm thư được gửi, không cho ta thêm thông tin nào, và nó để lại một dòng 404
 * trong log mà người trực sẽ phải giải thích. Trạng thái `submitted` dưới đây
 * là trạng thái của GIAO DIỆN, không phải của một yêu cầu nào.
 *
 * ## Vẫn giữ đủ form thay vì chỉ hiện một bảng thông báo
 *
 * Vì hai thứ. Bố cục, mã tầng lỗi và nút sẽ phải đứng đúng chỗ khi backend lên,
 * nên dựng chúng bây giờ là dựng một lần. Và một trang chỉ có một câu "chưa
 * bật" không nói cho người dùng biết họ đã tới ĐÚNG CHỖ; họ vẫn nhập email, vẫn
 * bấm, và vẫn nhận một câu trả lời thẳng.
 *
 * ⛔ Không khoá nào tên `sent` hay `check-inbox` trong `packages/copy`. Ngày
 * backend lên thì XOÁ `auth.forgot.unavailable-*` rồi thêm khoá thành công
 * thật, đừng sửa câu tại chỗ để nó nghe giống thành công.
 */
export function ForgotPasswordForm() {
  const fieldId = useId();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);

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

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(email);
  }

  return (
    <div className="flex flex-col gap-5">
      {/*
        Cảnh báo đặt TRƯỚC form, không phải sau. Người dùng phải biết đường gửi
        chưa bật TRƯỚC khi gõ email, chứ không phải sau khi đã gõ rồi bấm.

        `variant="warning"` chứ không `destructive`: không có gì hỏng, chỉ là
        một phần chưa được nối. Dùng màu lỗi ở đây sẽ dạy người dùng rằng màu đó
        có nghĩa là "bình thường thôi", và lần sau một lỗi thật sẽ trôi qua mắt.
      */}
      <Alert variant="warning">
        <AlertTitle>{t('auth.forgot.notice-title')}</AlertTitle>
        <AlertDescription>{t('auth.forgot.notice-body')}</AlertDescription>
      </Alert>

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
          />
        </div>

        <Button type="submit" disabled={!hydrated}>
          {t('auth.forgot.submit')}
        </Button>
      </form>

      {submitted === null ? null : (
        /*
          `role="status"` chứ không `role="alert"`: đây là kết quả của một hành
          động người dùng vừa chủ động làm, không phải một lỗi cần ngắt lời
          trình đọc màn hình.
        */
        <Alert variant="warning" role="status">
          <AlertTitle>{t('auth.forgot.unavailable-title')}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>{t('auth.forgot.unavailable-body', { email: submitted })}</span>
            <span>{t('auth.forgot.unavailable-next')}</span>
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
