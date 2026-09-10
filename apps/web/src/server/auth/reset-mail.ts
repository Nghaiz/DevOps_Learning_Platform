import { sendMail, type MailOutcome } from './mail';
import { RESET_TOKEN_TTL_SECONDS, buildResetLink } from './reset-link';

/**
 * Soạn và gửi thư đặt lại mật khẩu.
 *
 * ## ⚠ Chữ trong thư KHÔNG nằm trong `packages/copy`, và đó là một lỗ có thật
 *
 * Mọi chữ người dùng đọc đáng ra đi qua bản đồ copy. Thư này thì không, vì cổng
 * ngược của lane (`components/shell/copy-gate.test.ts`, mục "mọi khoá của hai
 * surface đều có nơi gọi") chỉ quét năm thư mục GIAO DIỆN: `components/shell`,
 * `app/login`, `app/register`, `app/forgot-password`, `app/reset-password`. Một
 * khoá `auth.*` gọi từ `server/**` sẽ bị cổng đó đọc thành khoá chết và làm
 * suite đỏ.
 *
 * Nên hai lựa chọn đều xấu: nới cổng của lane (mở đường cho khoá chết thật), hay
 * để chữ nằm ngoài bản đồ (không cổng chính tả/dấu tiếng Việt nào nhìn thấy).
 * Chọn cái thứ hai và ghi nó ra ở đây, vì nới một cổng an ninh để lách một quy
 * ước là đổi một khoản nợ nhìn thấy được lấy một khoản nợ vô hình. Lượt tích
 * hợp nào mở rộng glob của cổng ngược sang `server/auth/**` thì chuyển được ba
 * chuỗi dưới đây vào `packages/copy` mà không đổi gì khác.
 *
 * ## Thư là VĂN BẢN THUẦN, không HTML
 *
 * Không có gì trong thư này cần định dạng, và một thân HTML kéo theo cả một bộ
 * quy tắc riêng (ảnh chặn mặc định, CSS bị lột, tỷ lệ vào spam cao hơn). Một
 * liên kết trần trong text được mọi trình đọc thư biến thành liên kết bấm được.
 */

const TTL_MINUTES = Math.round(RESET_TOKEN_TTL_SECONDS / 60);

export function buildResetPasswordMailBody(link: string): string {
  return [
    'Chào bạn,',
    '',
    'Có người vừa yêu cầu đặt lại mật khẩu cho tài khoản này trên DevOps Learning Platform.',
    'Mở liên kết dưới đây để chọn mật khẩu mới:',
    '',
    link,
    '',
    `Liên kết dùng được một lần và hết hạn sau ${String(TTL_MINUTES)} phút.`,
    'Nếu bạn không yêu cầu điều này, bỏ qua thư này. Mật khẩu hiện tại của bạn không đổi.',
  ].join('\n');
}

export const RESET_PASSWORD_MAIL_SUBJECT = 'Đặt lại mật khẩu DevOps Learning Platform';

export async function sendResetPasswordMail(
  origin: string,
  email: string,
  token: string,
): Promise<MailOutcome> {
  return sendMail({
    to: email,
    subject: RESET_PASSWORD_MAIL_SUBJECT,
    text: buildResetPasswordMailBody(buildResetLink(origin, token)),
  });
}
