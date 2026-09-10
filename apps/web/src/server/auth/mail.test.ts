import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeHeaderValue, decodeMailText, startFakeSmtp, type FakeSmtp } from './fake-smtp';
import { sendMail, smtpSettings } from './mail';
import { RESET_PASSWORD_MAIL_SUBJECT, sendResetPasswordMail } from './reset-mail';
import { buildResetLink } from './reset-link';

/**
 * Đường gửi thư, đo trên MỘT SOCKET THẬT.
 *
 * Máy chủ SMTP giả (`fake-smtp.ts`) chạy trên loopback và nhận byte thật, nên bộ
 * này phân biệt được "đã gọi `sendMail`" với "thư đã ra khỏi tiến trình". Một
 * `vi.mock('nodemailer')` xanh y hệt khi cấu hình transport sai.
 *
 * ## ⛔ Ô quan trọng nhất là ô KHÔNG NÉM
 *
 * `sendMail` không được ném trong bất kỳ ca nào, và đó là một tính chất BẢO MẬT
 * chứ không phải sự lịch sự với người gọi. Better Auth thoát SỚM cho email không
 * tồn tại (không chạm đường gửi thư) và chỉ gọi vào đây cho email CÓ THẬT. Một
 * lỗi SMTP ném xuyên qua sẽ làm endpoint trả 500 cho đúng những email có thật và
 * 200 cho những email không có: một máy dò tài khoản đọc được bằng mã trạng
 * thái, không cần đọc nội dung. Bốn ca hỏng dưới đây khoá tính chất đó.
 */

const SMTP_KEYS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM',
] as const;

const saved = new Map<string, string | undefined>();

function setEnv(values: Readonly<Record<string, string | undefined>>): void {
  for (const key of SMTP_KEYS) {
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

beforeEach(() => {
  for (const key of SMTP_KEYS) {
    saved.set(key, process.env[key]);
  }
});

afterEach(() => {
  for (const key of SMTP_KEYS) {
    const value = saved.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.restoreAllMocks();
});

describe('smtpSettings', () => {
  it('thiếu SMTP_HOST hoặc SMTP_FROM ⇒ null (chưa cấu hình), KHÔNG ném', () => {
    setEnv({});
    expect(smtpSettings()).toBeNull();
    setEnv({ SMTP_HOST: '127.0.0.1' });
    expect(smtpSettings()).toBeNull();
    setEnv({ SMTP_FROM: 'a@b.local' });
    expect(smtpSettings()).toBeNull();
  });

  it('đủ hai biến ⇒ đọc được, cổng mặc định 587, secure tắt', () => {
    setEnv({ SMTP_HOST: 'mail.local', SMTP_FROM: 'a@b.local' });
    expect(smtpSettings()).toEqual({
      host: 'mail.local',
      port: 587,
      secure: false,
      user: null,
      password: null,
      from: 'a@b.local',
    });
  });

  /**
   * Có mặt nhưng SAI thì NÉM. Rơi về 587 trong im lặng nghĩa là gửi vào hư
   * không đúng lúc người vận hành tin rằng vừa cấu hình xong.
   */
  it('SMTP_PORT không phải cổng hợp lệ ⇒ NÉM, không rơi về mặc định', () => {
    setEnv({ SMTP_HOST: 'mail.local', SMTP_FROM: 'a@b.local', SMTP_PORT: 'xyz' });
    expect(() => smtpSettings()).toThrow(/SMTP_PORT/);
    setEnv({ SMTP_HOST: 'mail.local', SMTP_FROM: 'a@b.local', SMTP_PORT: '70000' });
    expect(() => smtpSettings()).toThrow(/SMTP_PORT/);
  });

  it('khai một nửa cặp user/password ⇒ NÉM', () => {
    setEnv({ SMTP_HOST: 'mail.local', SMTP_FROM: 'a@b.local', SMTP_USER: 'u' });
    expect(() => smtpSettings()).toThrow(/SMTP_USER/);
  });
});

describe('sendMail đi qua một máy chủ SMTP thật trên loopback', () => {
  let smtp: FakeSmtp;

  beforeEach(async () => {
    smtp = await startFakeSmtp();
    setEnv({
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtp.port),
      SMTP_FROM: 'DLP <no-reply@dlp.local>',
    });
  });

  afterEach(async () => {
    await smtp.close();
  });

  it('thư TỚI NƠI, với đúng người nhận, tiêu đề và thân', async () => {
    const outcome = await sendMail({
      to: 'ai-do@test.local',
      subject: 'Tiêu đề có dấu tiếng Việt',
      text: 'Dòng một.\nDòng hai.',
    });

    expect(outcome).toBe('sent');
    const message = await smtp.waitFor('ai-do@test.local');
    expect(message.from).toBe('no-reply@dlp.local');
    expect(message.to).toEqual(['ai-do@test.local']);
    expect(decodeHeaderValue(message.data, 'Subject')).toBe('Tiêu đề có dấu tiếng Việt');
    const body = decodeMailText(message.data);
    expect(body).toContain('Dòng một.');
    expect(body).toContain('Dòng hai.');
  });

  it('thư đặt lại mật khẩu mang đúng liên kết và đúng tiêu đề', async () => {
    const fakeToken = 'tokAbc123XYZ';
    const outcome = await sendResetPasswordMail(
      'http://localhost:3000',
      'nguoi-hoc@test.local',
      fakeToken,
    );

    expect(outcome).toBe('sent');
    const message = await smtp.waitFor('nguoi-hoc@test.local');
    expect(decodeHeaderValue(message.data, 'Subject')).toBe(RESET_PASSWORD_MAIL_SUBJECT);
    const body = decodeMailText(message.data);
    expect(body).toContain(buildResetLink('http://localhost:3000', fakeToken));
    // Nửa còn lại của luật 8, đo trên THÂN THƯ đã giải mã: không tham số truy
    // vấn nào mang mã.
    expect(/[?&]token=/i.test(body)).toBe(false);
  });
});

describe('mọi ca hỏng đều trả về, không ca nào ném', () => {
  it('chưa cấu hình ⇒ skipped, và nó KÊU (console.warn có địa chỉ người nhận)', async () => {
    setEnv({});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(sendMail({ to: 'x@test.local', subject: 's', text: 't' })).resolves.toBe(
      'skipped',
    );

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain('x@test.local');
  });

  it('cấu hình sai định dạng ⇒ failed + console.error, KHÔNG ném', async () => {
    setEnv({ SMTP_HOST: 'mail.local', SMTP_FROM: 'a@b.local', SMTP_PORT: 'xyz' });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(sendMail({ to: 'x@test.local', subject: 's', text: 't' })).resolves.toBe('failed');

    expect(error).toHaveBeenCalledOnce();
  });

  /**
   * Ca thật nhất trong bốn ca: máy chủ thư chết. Cổng 1 trên loopback không có
   * ai nghe, nên nodemailer ném ECONNREFUSED từ bên trong.
   */
  it('máy chủ thư không có ai nghe ⇒ failed + console.error, KHÔNG ném', async () => {
    setEnv({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', SMTP_FROM: 'a@b.local' });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      sendResetPasswordMail('http://localhost:3000', 'x@test.local', 'tok'),
    ).resolves.toBe('failed');

    expect(error).toHaveBeenCalledOnce();
  });
});
