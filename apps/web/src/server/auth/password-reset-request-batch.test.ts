import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as NextServer from 'next/server';
import type * as PasswordResetOutbox from './password-reset-outbox';
import {
  PASSWORD_RESET_OUTBOX_BATCH,
  PASSWORD_RESET_REQUEST_BATCH,
  drainPasswordResetOutbox,
} from './password-reset-outbox';
import { schedulePasswordResetMail, withPasswordResetDelivery } from './password-reset-mail';

/**
 * Lô của đường gửi CHẠY THEO REQUEST — phần nối dây, không phải phần DB.
 *
 * Thứ được gác ở đây là con số mà `after()` thật sự truyền xuống lượt drain.
 * Hành vi của chính lượt drain (lô N ⇒ gửi đúng N dòng) đã nghiệm thu trên
 * Postgres thật ở `password-reset-outbox.integration.test.ts`; nếu file này
 * cũng đi DB thì nó chỉ đo lại đúng thứ đó và bỏ sót thứ duy nhất nó cần chứng
 * minh — rằng đường request KHÔNG lấy lô của lượt quét.
 *
 * Vì sao nó đáng một file riêng: sai ở đây hỏng trong IM LẶNG. Một lô quá lớn
 * vẫn gửi đúng thư, vẫn xanh mọi ô khác, và chỉ lộ ra khi pool DB cạn dưới tải
 * — lúc ấy triệu chứng nằm ở những request chẳng liên quan gì tới đặt lại mật
 * khẩu. Một review độc lập chỉ ra (N4, 2026-09-13).
 */
const background = vi.hoisted(() => ({ tasks: [] as Array<() => Promise<void>> }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof NextServer>()),
  after: (task: () => Promise<void>) => {
    background.tasks.push(task);
  },
}));

// `drainPasswordResetOutbox` bị thay bằng spy nên không cần DB; các HẰNG vẫn là
// hằng thật (`importOriginal`), không phải bản chép trong test — chép lại chúng
// là cách chắc chắn nhất để ô này xanh trong khi sản phẩm đã đổi.
vi.mock('../db/client', () => ({ getDb: () => ({}) }));
vi.mock('./password-reset-outbox', async (importOriginal) => ({
  ...(await importOriginal<typeof PasswordResetOutbox>()),
  enqueuePasswordResetMail: vi.fn(),
  drainPasswordResetOutbox: vi.fn(async () => ({ sent: 0, failed: 0, expired: 0 })),
}));

const drain = vi.mocked(drainPasswordResetOutbox);

beforeEach(() => {
  drain.mockClear();
  background.tasks.length = 0;
});

describe('lô của lượt gửi chạy theo request', () => {
  it('đường after() truyền lô của REQUEST, không phải lô của lượt quét', async () => {
    const response = await withPasswordResetDelivery(async () => {
      await schedulePasswordResetMail('user@example.test', 'ma-dat-lai-24-ky-tu-abc');
      return new Response(null, { status: 200 });
    });

    expect(response.status).toBe(200);
    // Ranh giới "gửi SAU response" vẫn còn: lúc response ra chưa ai drain.
    expect(drain).not.toHaveBeenCalled();

    expect(background.tasks).toHaveLength(1);
    await background.tasks[0]!();
    expect(drain).toHaveBeenCalledTimes(1);
    expect(drain.mock.calls[0]?.[0]).toMatchObject({ limit: PASSWORD_RESET_REQUEST_BATCH });
  });

  it('caller ngoài HTTP wrapper cũng chỉ thử lô của request', async () => {
    // Không có `withPasswordResetDelivery` bọc ⇒ không có store ⇒ nhánh `else`
    // await thẳng. Nhánh này KHÔNG đi qua `after()`, nên nếu nó giữ lô đầy đủ
    // thì caller phía server có thể chờ tới 300 giây.
    await schedulePasswordResetMail('server-caller@example.test', 'ma-dat-lai-24-ky-tu-xyz');

    expect(background.tasks).toHaveLength(0);
    expect(drain).toHaveBeenCalledTimes(1);
    expect(drain.mock.calls[0]?.[0]).toMatchObject({ limit: PASSWORD_RESET_REQUEST_BATCH });
  });

  it('lô của request nhỏ hơn hẳn lô của lượt quét', () => {
    // Đối chứng cho hai ô trên: chúng so với một HẰNG, nên chúng vẫn xanh nếu ai
    // đó kéo hai hằng về bằng nhau — đúng thứ mà thay đổi này tồn tại để chặn.
    expect(PASSWORD_RESET_REQUEST_BATCH).toBeLessThan(PASSWORD_RESET_OUTBOX_BATCH);
  });
});
