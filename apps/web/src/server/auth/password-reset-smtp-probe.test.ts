import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import { forgetPasswordResetSmtpProbe, verifyPasswordResetSmtp } from './password-reset-mail';

/**
 * Phép thăm dò SMTP chạy ở `before` hook của `/request-password-reset` — một
 * route CÔNG KHAI. Bản trước mở một kết nối MỚI cho MỌI request, với timeout 10
 * giây; file này gác cái trần đã thay nó: một lượt thăm dò cho mỗi cửa sổ, cho
 * cả tiến trình, gộp chung các lượt đồng thời.
 *
 * Không dùng SMTP thật: thứ cần chứng minh là SỐ LƯỢT nodemailer bị gọi, và
 * `nodemailer` giả đếm đúng con số đó mà không phải dựng socket. Phần đi socket
 * thật (503 cho mọi địa chỉ khi nhà cung cấp sập) nằm ở
 * `password-reset.integration.test.ts`.
 *
 * Một review độc lập chỉ ra (Q3, 2026-09-13).
 */
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn() },
}));

const createTransport = vi.mocked(nodemailer.createTransport);

/** Transport giả: `verify` do từng ô quyết định, `close` chỉ để đếm. */
function fakeTransport(verify: () => Promise<true>) {
  return { verify: vi.fn(verify), close: vi.fn() } as unknown as ReturnType<
    typeof nodemailer.createTransport
  >;
}

function stubValidSmtpEnv() {
  vi.stubEnv('SMTP_HOST', '127.0.0.1');
  vi.stubEnv('SMTP_PORT', '2525');
  vi.stubEnv('SMTP_TLS', 'local');
  vi.stubEnv('SMTP_USER', '');
  vi.stubEnv('SMTP_PASSWORD', '');
  vi.stubEnv('SMTP_FROM', 'no-reply@example.test');
}

beforeEach(() => {
  vi.useFakeTimers();
  stubValidSmtpEnv();
  createTransport.mockReset();
  createTransport.mockImplementation(() => fakeTransport(async () => true));
  // Mỗi ô bắt đầu như một replica vừa khởi động.
  forgetPasswordResetSmtpProbe();
});

afterEach(() => {
  forgetPasswordResetSmtpProbe();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('phép thăm dò SMTP trước lượt tra cứu tài khoản', () => {
  it('nhiều request liên tiếp trong cùng cửa sổ chỉ mở MỘT kết nối thăm dò', async () => {
    await verifyPasswordResetSmtp();
    await verifyPasswordResetSmtp();
    await verifyPasswordResetSmtp();

    expect(createTransport).toHaveBeenCalledTimes(1);
    const transport = createTransport.mock.results[0]?.value as ReturnType<typeof fakeTransport>;
    expect(transport.verify).toHaveBeenCalledTimes(1);
    // Kết nối phải được đóng, không để rò socket sang cửa sổ sau.
    expect(transport.close).toHaveBeenCalledTimes(1);
  });

  it('các request ĐỒNG THỜI chờ chung một lượt thăm dò', async () => {
    let finish!: () => void;
    createTransport.mockImplementationOnce(() =>
      fakeTransport(
        () =>
          new Promise<true>((resolve) => {
            finish = () => resolve(true);
          }),
      ),
    );

    // Năm request ập tới trong lúc lượt thăm dò đầu còn đang chạy. Không có phần
    // gộp, đây là năm kết nối TCP tới nhà cung cấp.
    const waiting = Array.from({ length: 5 }, () => verifyPasswordResetSmtp());
    await Promise.resolve();
    expect(createTransport).toHaveBeenCalledTimes(1);

    finish();
    await expect(Promise.all(waiting)).resolves.toHaveLength(5);
    expect(createTransport).toHaveBeenCalledTimes(1);
  });

  it('kết quả HỎNG cũng được nhớ — một nhà cung cấp đang sập không bị dò lại mỗi request', async () => {
    createTransport.mockImplementation(() =>
      fakeTransport(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    await expect(verifyPasswordResetSmtp()).rejects.toThrow('SMTP provider is unavailable');
    await expect(verifyPasswordResetSmtp()).rejects.toThrow('SMTP provider is unavailable');
    expect(createTransport).toHaveBeenCalledTimes(1);
  });

  it('hết cửa sổ thì dò lại, cả sau lượt đạt lẫn sau lượt hỏng', async () => {
    await verifyPasswordResetSmtp();
    expect(createTransport).toHaveBeenCalledTimes(1);

    // Ngay trước mép cửa sổ: vẫn dùng bộ nhớ.
    vi.advanceTimersByTime(29_000);
    await verifyPasswordResetSmtp();
    expect(createTransport).toHaveBeenCalledTimes(1);

    // Qua mép: dò lại. Không có vế này thì một nhà cung cấp sập vĩnh viễn không
    // bao giờ bị phát hiện.
    vi.advanceTimersByTime(2_000);
    createTransport.mockImplementation(() =>
      fakeTransport(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    await expect(verifyPasswordResetSmtp()).rejects.toThrow('SMTP provider is unavailable');
    expect(createTransport).toHaveBeenCalledTimes(2);

    // Cửa sổ của lượt HỎNG ngắn hơn — nhớ nhầm "đang chết" chặn người dùng thật.
    vi.advanceTimersByTime(6_000);
    createTransport.mockImplementation(() => fakeTransport(async () => true));
    await expect(verifyPasswordResetSmtp()).resolves.toBeUndefined();
    expect(createTransport).toHaveBeenCalledTimes(3);
  });

  it('cấu hình hỏng KHÔNG vào bộ nhớ và không bị nhầm thành nhà cung cấp sập', async () => {
    await verifyPasswordResetSmtp();
    expect(createTransport).toHaveBeenCalledTimes(1);

    vi.stubEnv('SMTP_FROM', '');
    // Thông điệp khác hẳn: cấu hình hỏng là lỗi của ta, không phải của nhà cung
    // cấp. Và nó phải ném NGAY cả khi bộ nhớ đang giữ một lượt đạt.
    await expect(verifyPasswordResetSmtp()).rejects.toThrow('SMTP configuration is invalid');
    expect(createTransport).toHaveBeenCalledTimes(1);

    // Sửa env xong là ăn ngay, không phải chờ hết cửa sổ nào.
    vi.stubEnv('SMTP_FROM', 'no-reply@example.test');
    await expect(verifyPasswordResetSmtp()).resolves.toBeUndefined();
  });

  it('phép thăm dò không nhận địa chỉ nào, nên không thể khoá bộ nhớ theo email', () => {
    // Đây là vế giữ cho bộ nhớ KHÔNG mở lại kênh liệt kê tài khoản: một ô nhớ
    // duy nhất cho cả tiến trình, không khoá theo địa chỉ. Thêm tham số email
    // vào hàm này là cách hiển nhiên nhất để phá vế đó, và ô này đỏ ngay khi ai
    // đó làm vậy.
    expect(verifyPasswordResetSmtp).toHaveLength(0);
  });
});
