import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deliverQueuedPasswordResetMail } from './password-reset-mail';
import {
  PASSWORD_RESET_OUTBOX_SWEEP_MS,
  startPasswordResetOutboxWorker,
  stopPasswordResetOutboxWorker,
} from './password-reset-outbox-worker';

/**
 * Lượt quét định kỳ là đường phục hồi DUY NHẤT cho dòng của một tiến trình đã
 * chết. Nó chạy trên timer, không ai `await` nó, và không ô nghiệm thu nào của
 * hàng đợi chạm tới nó — tức một lỗi ở đây sẽ hỏng trong im lặng: file có mặt,
 * hàm được export, và không có gì chạy cả.
 *
 * Không dùng DB ở đây: phần DB đã nghiệm thu ở `password-reset-outbox.integration.test.ts`.
 * Thứ cần chứng minh ở file này là phần NỐI DÂY — timer có nổ không, có chồng lượt
 * không, và một lượt hỏng có hạ luôn vòng lặp không.
 */
vi.mock('./password-reset-mail', () => ({ deliverQueuedPasswordResetMail: vi.fn() }));

const drain = vi.mocked(deliverQueuedPasswordResetMail);
const idle = { sent: 0, failed: 0, expired: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  drain.mockReset();
  drain.mockResolvedValue(idle);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  stopPasswordResetOutboxWorker();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('lượt quét định kỳ hàng đợi thư đặt lại mật khẩu', () => {
  it('nổ đều theo chu kỳ và dừng hẳn khi được dừng', async () => {
    const stop = startPasswordResetOutboxWorker();
    expect(drain).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(PASSWORD_RESET_OUTBOX_SWEEP_MS * 3);
    expect(drain).toHaveBeenCalledTimes(3);

    stop();
    await vi.advanceTimersByTimeAsync(PASSWORD_RESET_OUTBOX_SWEEP_MS * 5);
    expect(drain).toHaveBeenCalledTimes(3);
  });

  it('gọi nhiều lần không tạo thêm timer', async () => {
    startPasswordResetOutboxWorker();
    startPasswordResetOutboxWorker();
    startPasswordResetOutboxWorker();

    await vi.advanceTimersByTimeAsync(PASSWORD_RESET_OUTBOX_SWEEP_MS);
    // Ba timer song song sẽ ra 3. `register()` của Next chạy một lần, nhưng HMR
    // và một lần import lại thì không.
    expect(drain).toHaveBeenCalledTimes(1);
  });

  it('bỏ lượt khi lượt trước còn đang chạy', async () => {
    let release!: () => void;
    drain.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(idle);
        }),
    );
    startPasswordResetOutboxWorker();

    await vi.advanceTimersByTimeAsync(PASSWORD_RESET_OUTBOX_SWEEP_MS * 4);
    expect(drain).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(PASSWORD_RESET_OUTBOX_SWEEP_MS);
    expect(drain).toHaveBeenCalledTimes(2);
  });

  it('một lượt hỏng không hạ vòng lặp và không rò thông điệp lỗi ra log', async () => {
    drain.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED postgres://dlp:hunter2@127.0.0.1:5432/dlp'),
    );
    startPasswordResetOutboxWorker();

    await vi.advanceTimersByTimeAsync(PASSWORD_RESET_OUTBOX_SWEEP_MS);
    expect(console.error).toHaveBeenCalledWith(
      '[auth] Password reset outbox sweep failed: Error',
    );
    // Chuỗi kết nối có mật khẩu trong thông điệp lỗi tầng DB; log chỉ được mang TÊN lỗi.
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ');
    expect(logged).not.toContain('hunter2');

    // Vòng lặp còn sống sau cú hỏng — nếu không, một sự cố DB thoáng qua sẽ tắt
    // vĩnh viễn đường phục hồi cho tới lần khởi động lại tiến trình tiếp theo.
    await vi.advanceTimersByTimeAsync(PASSWORD_RESET_OUTBOX_SWEEP_MS);
    expect(drain).toHaveBeenCalledTimes(2);
  });
});
