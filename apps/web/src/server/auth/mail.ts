import { createTransport } from 'nodemailer';

/**
 * Đường gửi thư của BFF. Hôm nay có đúng MỘT người gọi: `sendResetPassword`
 * trong `auth/config.ts`.
 *
 * ## Vì sao SMTP chứ không phải một dịch vụ HTTP (Resend/SendGrid/Postmark)
 *
 * Ba lý do, theo thứ tự sức nặng:
 *
 * 1. Repo này không có API key của dịch vụ nào, và luật `no-outbound-from-this-project`
 *    cấm đẩy dữ liệu ra ngoài máy. Một nhà cung cấp HTTP bắt phải có tài khoản
 *    trước khi chạy được lượt đầu tiên.
 * 2. SMTP trỏ được vào một máy chủ giả CỤC BỘ, nên luồng đặt lại mật khẩu chạy
 *    thật đầu-đến-cuối trên máy dev mà không thư nào rời khỏi loopback. Bộ test
 *    của file này làm đúng điều đó: dựng một máy chủ SMTP bằng `node:net` rồi
 *    đọc lại thư nhận được.
 * 3. Ngày lên prod chỉ cần đổi năm biến môi trường, không đổi dòng mã nào.
 *
 * ## Thiếu cấu hình thì BỎ QUA, và nó phải KÊU
 *
 * `smtpSettings()` trả `null` khi chưa khai `SMTP_HOST`/`SMTP_FROM`. Ở đó ta
 * `console.warn` rồi trả `'skipped'` chứ không ném. Đây là một fallback ĐƯỢC
 * GHI RA và ĐƯỢC LOG, không phải một lượt nuốt im lặng
 * (`rules/development-principles.md` § "Errors Over Silent Fallbacks").
 *
 * ## ⛔ HÀM NÀY KHÔNG BAO GIỜ ĐƯỢC NÉM RA NGOÀI, và lý do là chống dò tài khoản
 *
 * Better Auth trả cùng một body cho email có thật lẫn email không tồn tại, và
 * đó là toàn bộ lớp phòng thủ chống liệt kê tài khoản của `/request-password-reset`.
 * Nhánh "email không tồn tại" thoát SỚM, trước khi chạm tới đường gửi thư; nhánh
 * "email có thật" thì gọi vào đây. Nên nếu một lỗi SMTP (máy chủ chết, sai mật
 * khẩu, DNS hỏng) ném xuyên qua, endpoint trả 500 cho ĐÚNG những email có thật
 * và 200 cho những email không có. Kẻ tấn công đọc mã trạng thái là biết tài
 * khoản nào tồn tại, mà không cần đọc nội dung gì.
 *
 * Vì vậy mọi lỗi bị bắt ở đây, ghi vào `console.error` cho người vận hành, và
 * hàm trả `'failed'`. Người dùng vẫn thấy đúng câu "nếu email đó có tài khoản
 * thì thư đã được gửi" — câu đó vẫn không nói dối, vì nó không hứa thư đã tới.
 *
 * ## KHÔNG cache transporter
 *
 * Mỗi lượt gửi dựng một transporter mới. Một người dùng xin đặt lại mật khẩu
 * vài lần một năm, nên pool kết nối không mua được gì; còn một transporter
 * memo hoá theo module thì làm việc đổi biến môi trường giữa chừng KHÔNG ăn, và
 * bộ test sẽ phải mở một cửa hậu chỉ để dựng lại nó. Không cache thì test chạy
 * đúng đường mã sản phẩm, không đường nào khác.
 */

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface SmtpSettings {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user: string | null;
  readonly password: string | null;
  readonly from: string;
}

/**
 * ⚠ Hàm này ĐÁNG RA nằm ở `server/env.ts` — file đó tự khai là chỗ đọc env duy
 * nhất của app. Nó nằm đây vì lane 16.D sở hữu `server/auth/**` chứ không sở
 * hữu `server/env.ts`, và hai lane cùng ghi một file ngoài phạm vi là đúng lớp
 * đua ghi mà bảng sở hữu tồn tại để chặn. Lượt tích hợp nên dời nó về `env.ts`;
 * chữ ký giữ nguyên thì call-site không phải đổi.
 *
 * `null` = CHƯA CẤU HÌNH (thiếu `SMTP_HOST` hoặc `SMTP_FROM`), người gọi bỏ qua
 * và log. Có mặt nhưng SAI thì NÉM: một `SMTP_PORT=xyz` rơi về 587 trong im
 * lặng là gửi thư vào hư không đúng lúc người vận hành tin rằng vừa cấu hình
 * xong.
 */
export function smtpSettings(): SmtpSettings | null {
  const host = process.env['SMTP_HOST'] ?? '';
  const from = process.env['SMTP_FROM'] ?? '';
  if (host === '' || from === '') {
    return null;
  }

  const rawPort = process.env['SMTP_PORT'] ?? '';
  const port = rawPort === '' ? 587 : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`SMTP_PORT không hợp lệ: ${rawPort} (cần một cổng 1..65535)`);
  }

  const user = process.env['SMTP_USER'] ?? '';
  const password = process.env['SMTP_PASSWORD'] ?? '';
  if ((user === '') !== (password === '')) {
    throw new Error(
      'SMTP_USER và SMTP_PASSWORD phải cùng có hoặc cùng vắng — khai một nửa là gửi ẩn danh trong khi tưởng đã xác thực',
    );
  }

  return {
    host,
    port,
    // `SMTP_SECURE=1` = TLS ngay từ byte đầu (cổng 465). Bỏ trống = STARTTLS
    // (cổng 587) hoặc cleartext với máy chủ giả cục bộ, do nodemailer tự thương
    // lượng theo `EHLO`.
    secure: process.env['SMTP_SECURE'] === '1',
    user: user === '' ? null : user,
    password: password === '' ? null : password,
    from,
  };
}

/** `skipped` = chưa cấu hình SMTP. `failed` = đã thử và hỏng. Cả hai đều đã log. */
export type MailOutcome = 'sent' | 'skipped' | 'failed';

export async function sendMail(message: MailMessage): Promise<MailOutcome> {
  let settings;
  try {
    settings = smtpSettings();
  } catch (cause: unknown) {
    // Biến có mặt nhưng sai định dạng (SMTP_PORT không phải số, chỉ khai một
    // nửa cặp user/password). `smtpSettings` ném đúng chỗ đó; ta không được
    // để nó xuyên ra ngoài (xem ghi chú chống dò tài khoản ở đầu file).
    console.error('[mail] cấu hình SMTP không hợp lệ, không gửi được thư', cause);
    return 'failed';
  }

  if (settings === null) {
    console.warn(
      `[mail] SMTP chưa cấu hình (SMTP_HOST/SMTP_FROM) — BỎ QUA thư gửi tới ${message.to}. ` +
        'Xem apps/web/.env.example mục "Mail / SMTP".',
    );
    return 'skipped';
  }

  try {
    const transport = createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      ...(settings.user === null || settings.password === null
        ? {}
        : { auth: { user: settings.user, pass: settings.password } }),
    });
    await transport.sendMail({
      from: settings.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    transport.close();
    return 'sent';
  } catch (cause: unknown) {
    console.error(`[mail] gửi thư tới ${message.to} thất bại`, cause);
    return 'failed';
  }
}
