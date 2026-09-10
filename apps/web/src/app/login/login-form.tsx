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
 * Form đăng nhập. Client Component: Better Auth cần `document.cookie` và
 * `fetch` phía trình duyệt để đặt cookie phiên.
 *
 * ## 16.B tách đăng ký ra `/register`
 *
 * Trước P16 file này gánh CẢ đăng nhập lẫn đăng ký qua một
 * `useState<'sign-in' | 'sign-up'>`, 218 dòng. Hai hệ quả đo được: đăng ký
 * không có URL riêng nên nó không vào được `SCREENS` của cổng a11y dưới tên của
 * chính nó, và một nửa số trường trên màn hình chỉ tồn tại ở một trong hai chế
 * độ, nên `autoComplete` phải đổi theo `mode` thay vì đứng yên.
 *
 * ## Thông báo lỗi KHÔNG còn lấy từ Better Auth
 *
 * Bản cũ hiện `authError.message` khi thư viện có gửi, chỉ rơi về câu tiếng
 * Việt khi nó vắng mặt. Message đó là chuỗi tiếng Anh do thư viện sinh
 * (`Invalid email or password`), nằm ngoài `packages/copy`, nên không cổng nào
 * của P16 nhìn thấy nó và nó vi phạm luật 6 của design §5. Nay message của thư
 * viện đi vào `console.error` cho người vận hành, còn người dùng luôn đọc
 * `auth.error.sign-in`.
 *
 * Cái mất được nói ra: một ca lỗi hiếm mà thư viện mô tả cụ thể hơn ta. Cái
 * được: mọi câu người dùng đọc đều đi qua một cổng.
 */
export function LoginForm() {
  const router = useRouter();
  const fieldId = useId();
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
      const { error: authError } = await authClient.signIn.email({ email, password });
      if (authError) {
        // Chuỗi của thư viện là chữ NGƯỜI VẬN HÀNH đọc, nên nó ở lại tiếng
        // Anh và KHÔNG vào `packages/copy` (§1.7: log không vào bản đồ).
        // Cổng T4 của lane bắt đúng lớp lỗi ngược lại, và nó đã bắt một câu
        // `console.error` tiếng Việt trong `user-menu.tsx` ở lượt đầu.
        console.error('[auth] sign-in rejected', authError);
        setFailure(err('auth.error.sign-in'));
        return;
      }
      // Bootstrap cặp refresh/access token (luật 6,7) NGAY sau khi có session:
      // không gọi thì `/api/auth/refresh` và toàn bộ cơ chế rotation cùng
      // revocation thành mã chết, vì không UI nào kích hoạt chúng. Lỗi ở đây
      // KHÔNG chặn đăng nhập (session Better Auth đã có) nhưng cũng KHÔNG được
      // nuốt im lặng.
      await fetch('/api/auth/refresh', { method: 'POST' }).catch((bootstrapError: unknown) => {
        console.error('[auth] refresh bootstrap failed, rotation inactive', bootstrapError);
      });
      router.push('/me');
      router.refresh();
    } catch (networkError: unknown) {
      // Mạng chết KHÁC hẳn sai mật khẩu: ta chưa biết yêu cầu có tới nơi hay
      // không, nên câu `next` phải nói "kiểm tra kết nối", không nói "gõ lại
      // mật khẩu". Đó là lý do `auth.error.network` là một mục riêng chứ không
      // phải mục độn thêm cho nhóm lỗi khỏi đúng ba.
      console.error('[auth] sign-in request failed', networkError);
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
            autoComplete="current-password"
            invalid={invalid}
          />
        </div>

        {failure === null ? null : <AuthFailure entry={failure} />}

        {/* `disabled` chứ không `loading`: một spinner ngay lúc trang vừa mở
            đọc ra là "đang gửi gì đó", trong khi sự thật là "chưa sẵn sàng
            nhận". Khoảng khoá này dài đúng bằng thời gian hydrate. */}
        <Button type="submit" loading={pending} disabled={!hydrated}>
          {t('auth.login.submit')}
        </Button>
      </form>

      <AuthOAuth hydrated={hydrated} />

      <div className="flex flex-col items-start gap-1 text-sm">
        <Link
          href="/forgot-password"
          className="rounded-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('auth.login.forgot')}
        </Link>
        <Link
          href="/register"
          className="rounded-sm text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('auth.login.to-register')}
        </Link>
      </div>
    </div>
  );
}
