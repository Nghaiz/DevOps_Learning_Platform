import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@devops-platform/ui';
import { t } from '@devops-platform/copy';
import { AuthFrame } from '../../components/shell/auth-frame';
import { RESET_COOKIE_NAME } from '../../server/auth/reset-link';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: t('auth.reset.meta-title'),
};

/**
 * KHÔNG render `<main>`: vỏ ứng dụng sở hữu landmark đó và bọc mọi trang.
 *
 * ## Vì sao trang này ĐỌC COOKIE thay vì luôn hiện form
 *
 * Cookie `dlp_reset` do route đổi liên kết đặt (`api/auth/reset-link/[token]`),
 * và nó là thứ duy nhất ở phía trình duyệt cho biết người dùng có thật sự tới
 * đây từ một liên kết hay không. Không đọc nó thì trang hiện form cho mọi
 * người, kể cả người gõ thẳng địa chỉ hoặc bấm một liên kết đã quá 30 phút, và
 * họ chỉ biết mình đang gõ vào hư không SAU KHI đã chọn xong mật khẩu mới.
 *
 * Cùng lý lẽ đã dựng `/forgot-password` ở 16.B: cảnh báo đặt TRƯỚC form, không
 * phải sau.
 *
 * ## Nó kiểm SỰ CÓ MẶT, không kiểm tính hợp lệ, và điều đó là cố ý
 *
 * Xác minh mã ở đây có nghĩa là tra bảng `verifications` bằng quy ước đặt tên
 * nội bộ của Better Auth (`reset-password:<mã>`), tức buộc trang này vào một
 * chi tiết cài đặt của thư viện để đổi lấy một thông báo sớm hơn vài giây. Mã
 * hết hạn vẫn đi tới bước gửi, và ở đó `auth.error.reset-link` nói đúng chuyện
 * đã xảy ra. Ca mà cổng này thật sự đóng là ca thường gặp nhất: KHÔNG có liên
 * kết nào cả.
 *
 * Đọc cookie làm trang thành dynamic. Đúng: nó vốn không có gì để cache, và
 * `metadata` tĩnh ở trên vẫn tĩnh.
 */
export default async function ResetPasswordPage() {
  const store = await cookies();
  const hasLink = (store.get(RESET_COOKIE_NAME)?.value ?? '') !== '';

  return (
    <AuthFrame title={t('auth.reset.title')} description={t('auth.reset.description')}>
      {hasLink ? <ResetPasswordForm /> : <NoResetLink />}
    </AuthFrame>
  );
}

function NoResetLink() {
  return (
    <div className="flex flex-col gap-5">
      {/*
        `variant="warning"` chứ không `destructive`: không có gì hỏng, người
        dùng chỉ đang ở một trang cần một liên kết mà họ không có. Dùng màu lỗi
        ở đây sẽ dạy người dùng rằng màu đó có nghĩa là "bình thường thôi", và
        lần sau một lỗi thật sẽ trôi qua mắt.
      */}
      <Alert variant="warning">
        <AlertTitle>{t('auth.reset.no-link-title')}</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <span>{t('auth.reset.no-link-body')}</span>
          <span>{t('auth.reset.no-link-next')}</span>
        </AlertDescription>
      </Alert>

      <Link
        href="/forgot-password"
        className="rounded-sm self-start text-sm text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('auth.login.forgot')}
      </Link>
    </div>
  );
}
