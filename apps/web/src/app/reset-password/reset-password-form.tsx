'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle, Button, Input, Label } from '@devops-platform/ui';
import { err, t } from '@devops-platform/copy';
import type { ErrorEntry } from '@devops-platform/copy/types';
import { AuthFailure } from '../../components/shell/auth-failure';

/**
 * Màn `/reset-password`, FRONTEND-ONLY ở đợt này. Cùng lý lẽ với
 * `/forgot-password`: biểu mẫu này KHÔNG gọi mạng.
 *
 * ## KHÔNG đọc token từ URL, và đó là LUẬT 8 chứ không phải sở thích
 *
 * Bản đầu của màn này đọc mã dùng một lần ra khỏi query string rồi phân hai
 * nhánh: có mã
 * thì hiện form, không có mã thì hiện một bảng "liên kết thiếu mã". Nó bị
 * `src/security/rule-08-no-token-in-url.test.ts` bắt, và cổng đó ĐÚNG: luật 8
 * của dự án cấm mọi token đi qua query string, vì URL nằm trong lịch sử trình
 * duyệt, trong log của proxy, và trong header `Referer` gửi kèm mọi tài nguyên
 * bên thứ ba mà trang nạp.
 *
 * Nên hình dạng ở đây không phải "đọc mã rồi phân nhánh" mà là "không có mã nào
 * để đọc". Ngày backend lên, mã dùng một lần phải tới qua một đường khác (thân
 * POST, hoặc một cookie do chính đường xử lý liên kết đặt), và phần dựng dưới
 * đây không phải đổi. Ghi rõ ra vì đây là một quyết định đã bị một phép đo bác
 * bỏ một lần, và lần sau sẽ có người nghĩ cổng kia sai.
 *
 * ## Phép kiểm hai ô khớp nhau CHẠY THẬT
 *
 * Nó là logic thuần, không cần backend, và nó là thứ duy nhất trong màn này hôm
 * nay có thể đúng hay sai. Giữ nó chạy nghĩa là ngày backend lên thì chỉ còn
 * phải nối một lệnh gọi vào, không phải viết lại phần kiểm.
 */
export function ResetPasswordForm() {
  const fieldId = useId();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [failure, setFailure] = useState<ErrorEntry | null>(null);
  const [submitted, setSubmitted] = useState(false);

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
    if (password !== confirm) {
      setFailure(err('auth.error.password-mismatch'));
      setSubmitted(false);
      return;
    }
    setFailure(null);
    setSubmitted(true);
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

        <Button type="submit" disabled={!hydrated}>
          {t('auth.reset.submit')}
        </Button>
      </form>

      {!submitted ? null : (
        <Alert variant="warning" role="status">
          <AlertTitle>{t('auth.reset.unavailable-title')}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>{t('auth.reset.unavailable-body')}</span>
            <span>{t('auth.reset.unavailable-next')}</span>
          </AlertDescription>
        </Alert>
      )}

      <BackToLogin />
    </div>
  );
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
