import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../db/client';
import { databaseUrl } from '../env';
import * as schema from '../db/schema';
import { passwordResetOutbox } from '../db/schema';
import {
  PASSWORD_RESET_MAX_ATTEMPTS,
  PASSWORD_RESET_OUTBOX_BATCH,
  PASSWORD_RESET_REQUEST_BATCH,
  PASSWORD_RESET_RETRY_BASE_MS,
  drainPasswordResetOutbox,
  enqueuePasswordResetMail,
  verifyPasswordResetOutbox,
  type PasswordResetSender,
} from './password-reset-outbox';

/**
 * Nghiệm thu hàng đợi thư đặt lại mật khẩu trên Postgres THẬT (P16 §8).
 *
 * Postgres thật chứ không phải DB giả vì thứ đang được nghiệm thu chính là hành
 * vi của DB: `FOR UPDATE SKIP LOCKED`, rollback khi tiến trình chết, và phép so
 * thời điểm đến hạn. Một handle giả sẽ trả lời mọi ô ở đây bằng chính giả định
 * mà ô đó cần kiểm.
 *
 * ⚠ File này chạy trên SCHEMA RIÊNG chứ không phải `public`. Lý do: drain cố tình
 * không nhận bộ lọc — nó xử lý MỌI dòng đến hạn, đúng như trong sản phẩm. Chạy
 * chung `public` thì lượt drain ở đây sẽ nuốt dòng của
 * `password-reset.integration.test.ts` (vitest chạy song song theo file, cùng một
 * Postgres): dòng bị hàm gửi giả của file này tiêu thụ và xoá, còn SMTP sink của
 * file kia không bao giờ nhận được thư — một ô đỏ chớp tắt không hề nhắc tới
 * nguyên nhân. Bảng được tạo bằng `LIKE … INCLUDING ALL` nên cấu trúc, default và
 * index là bản sao đúng của bảng thật, không phải một khai báo thứ hai để trôi.
 */
const TEST_SCHEMA = 'password_reset_outbox_test';

/** Khớp `PASSWORD_RESET_TTL_SECONDS`; không import để test không kéo theo nodemailer. */
const TTL_MS = 15 * 60 * 1000;

let sql: ReturnType<typeof postgres>;
let db: Database;

function makeEntry(): { email: string; code: string; expiresAt: Date } {
  return {
    email: `outbox-${randomUUID()}@example.test`,
    code: randomUUID().replaceAll('-', '').slice(0, 24),
    expiresAt: new Date(Date.now() + TTL_MS),
  };
}

/** Hàm gửi giả: ghi lại lượt gửi và luôn thành công. */
function recorder(into: Array<[string, string]>): PasswordResetSender {
  return async (email, code) => {
    into.push([email, code]);
  };
}

async function rows() {
  return db.select().from(passwordResetOutbox);
}

beforeAll(async () => {
  const admin = postgres(databaseUrl(), { max: 1 });
  try {
    await admin.unsafe(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await admin.unsafe(`CREATE SCHEMA ${TEST_SCHEMA}`);
    await admin.unsafe(
      `CREATE TABLE ${TEST_SCHEMA}.password_reset_outbox (LIKE public.password_reset_outbox INCLUDING ALL)`,
    );
  } finally {
    await admin.end({ timeout: 5 });
  }
  // CHỈ schema test trong `search_path` — không kèm `public`. Nếu bước dựng ở trên
  // hỏng, truy vấn phải ĐỎ ngay vì không thấy bảng, chứ không được âm thầm rơi về
  // bảng thật và làm hỏng dữ liệu của file test khác.
  sql = postgres(databaseUrl(), { max: 5, connection: { search_path: TEST_SCHEMA } });
  db = drizzle(sql, { schema });
});

afterAll(async () => {
  await sql.end({ timeout: 5 });
  const admin = postgres(databaseUrl(), { max: 1 });
  try {
    await admin.unsafe(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
  } finally {
    await admin.end({ timeout: 5 });
  }
});

beforeEach(async () => {
  await db.delete(passwordResetOutbox);
  // Drain ghi log mỗi lượt gửi hỏng; một nửa số ô dưới đây cố tình làm nó hỏng.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hàng đợi bền vững cho thư đặt lại mật khẩu', () => {
  it('giữ việc đã nhận qua cái chết của tiến trình, và lượt drain sau gửi nó', async () => {
    const entry = makeEntry();
    await enqueuePasswordResetMail(db, entry);

    // (a) Tiến trình chết NGAY sau khi nhận việc: không lượt drain nào từng chạy.
    expect(await rows()).toHaveLength(1);

    // (b) Tiến trình chết GIỮA lượt gửi. Transaction của drain bị bỏ dở có cùng
    // hiệu ứng với việc kết nối đứt: mọi thứ nó làm bị rollback. Dựng lại đúng
    // hình dạng đó bằng SQL thô — lock, xoá, rồi chết.
    await expect(
      sql.begin(async (tx) => {
        await tx`SELECT * FROM password_reset_outbox FOR UPDATE SKIP LOCKED`;
        await tx`DELETE FROM password_reset_outbox WHERE email = ${entry.email}`;
        throw new Error('tiến trình chết trước khi commit');
      }),
    ).rejects.toThrow('tiến trình chết trước khi commit');

    // Đây là điều `after()` một mình KHÔNG làm được: việc vẫn còn đó.
    expect(await rows()).toHaveLength(1);

    const sent: Array<[string, string]> = [];
    expect(await drainPasswordResetOutbox({ db, send: recorder(sent) })).toEqual({
      sent: 1,
      failed: 0,
      expired: 0,
    });
    expect(sent).toEqual([[entry.email, entry.code]]);
    expect(await rows()).toHaveLength(0);
  });

  it('xoá dòng khi gửi xong và không gửi lại ở lượt drain sau', async () => {
    const entry = makeEntry();
    await enqueuePasswordResetMail(db, entry);

    const sent: Array<[string, string]> = [];
    expect((await drainPasswordResetOutbox({ db, send: recorder(sent) })).sent).toBe(1);
    expect(await rows()).toHaveLength(0);

    expect(await drainPasswordResetOutbox({ db, send: recorder(sent) })).toEqual({
      sent: 0,
      failed: 0,
      expired: 0,
    });
    expect(sent).toHaveLength(1);
  });

  it('hai lượt drain đồng thời không gửi trùng một dòng', async () => {
    const entry = makeEntry();
    await enqueuePasswordResetMail(db, entry);

    const firstSent: Array<[string, string]> = [];
    let release!: () => void;
    const holding = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Lượt drain thứ nhất DỪNG giữa lúc gửi, tức nó đang giữ khoá hàng.
    const first = drainPasswordResetOutbox({
      db,
      send: async (email, code) => {
        firstSent.push([email, code]);
        await holding;
      },
    });
    await vi.waitFor(() => expect(firstSent).toHaveLength(1));

    const secondSent: Array<[string, string]> = [];
    expect(await drainPasswordResetOutbox({ db, send: recorder(secondSent) })).toEqual({
      sent: 0,
      failed: 0,
      expired: 0,
    });
    expect(secondSent).toHaveLength(0);

    release();
    expect((await first).sent).toBe(1);
    expect(firstSent).toHaveLength(1);
    expect(await rows()).toHaveLength(0);
  });

  it('gửi hỏng thì tăng attempts, lùi next_attempt_at, và không chọn lại trước hạn', async () => {
    const entry = makeEntry();
    await enqueuePasswordResetMail(db, entry);
    const before = Date.now();

    expect(
      await drainPasswordResetOutbox({
        db,
        send: async () => {
          throw new Error('SMTP tạm thời không nhận.');
        },
      }),
    ).toEqual({ sent: 0, failed: 1, expired: 0 });

    const [failed] = await rows();
    expect(failed?.attempts).toBe(1);
    expect(failed?.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
      before + PASSWORD_RESET_RETRY_BASE_MS,
    );

    // Chưa tới hạn ⇒ không lượt drain nào chọn nó.
    const sent: Array<[string, string]> = [];
    expect(await drainPasswordResetOutbox({ db, send: recorder(sent) })).toEqual({
      sent: 0,
      failed: 0,
      expired: 0,
    });
    expect(sent).toHaveLength(0);

    // Đối chứng: khi tới hạn thì nó ĐƯỢC chọn lại. Không có vế này thì ô trên
    // vẫn xanh kể cả khi dòng bị bỏ qua vĩnh viễn vì một lý do khác.
    await db
      .update(passwordResetOutbox)
      .set({ nextAttemptAt: new Date(Date.now() - 1_000) })
      .where(eq(passwordResetOutbox.email, entry.email));
    expect((await drainPasswordResetOutbox({ db, send: recorder(sent) })).sent).toBe(1);
    expect(sent).toEqual([[entry.email, entry.code]]);
  });

  it('ngừng thử khi chạm trần số lượt và không quay vòng vô hạn', async () => {
    const entry = makeEntry();
    await enqueuePasswordResetMail(db, entry);
    const failing: PasswordResetSender = async () => {
      throw new Error('SMTP vẫn không nhận.');
    };

    for (let attempt = 1; attempt <= PASSWORD_RESET_MAX_ATTEMPTS; attempt += 1) {
      // Kéo dòng về "đến hạn" trước mỗi lượt để chỉ còn trần số lượt là thứ chặn.
      await db
        .update(passwordResetOutbox)
        .set({ nextAttemptAt: new Date(Date.now() - 1_000) })
        .where(eq(passwordResetOutbox.email, entry.email));
      expect((await drainPasswordResetOutbox({ db, send: failing })).failed).toBe(1);
      expect((await rows())[0]?.attempts).toBe(attempt);
    }

    // Đã cạn lượt: kéo về đến hạn bao nhiêu lần cũng không được chọn nữa.
    const sent: Array<[string, string]> = [];
    for (let sweep = 0; sweep < 3; sweep += 1) {
      await db
        .update(passwordResetOutbox)
        .set({ nextAttemptAt: new Date(Date.now() - 1_000) })
        .where(eq(passwordResetOutbox.email, entry.email));
      expect(await drainPasswordResetOutbox({ db, send: recorder(sent) })).toEqual({
        sent: 0,
        failed: 0,
        expired: 0,
      });
    }
    expect(sent).toHaveLength(0);
    expect((await rows())[0]?.attempts).toBe(PASSWORD_RESET_MAX_ATTEMPTS);
  });

  it('không gửi mã đã quá hạn và dọn dòng đi, kể cả dòng đã cạn lượt thử', async () => {
    const fresh = makeEntry();
    const stale = { ...makeEntry(), expiresAt: new Date(Date.now() - 1_000) };
    const staleExhausted = { ...makeEntry(), expiresAt: new Date(Date.now() - 1_000) };
    await enqueuePasswordResetMail(db, fresh);
    await enqueuePasswordResetMail(db, stale);
    await enqueuePasswordResetMail(db, staleExhausted);
    // Dòng này truy vấn đến-hạn KHÔNG nhìn thấy (đã cạn lượt). Nếu việc dọn nằm
    // trong vòng lặp gửi thay vì ở lượt quét riêng, nó sẽ nằm lại vĩnh viễn —
    // mang theo mã ở dạng bản rõ.
    await db
      .update(passwordResetOutbox)
      .set({ attempts: PASSWORD_RESET_MAX_ATTEMPTS })
      .where(eq(passwordResetOutbox.email, staleExhausted.email));

    const sent: Array<[string, string]> = [];
    expect(await drainPasswordResetOutbox({ db, send: recorder(sent) })).toEqual({
      sent: 1,
      failed: 0,
      expired: 2,
    });
    expect(sent).toEqual([[fresh.email, fresh.code]]);
    expect(await rows()).toHaveLength(0);
  });

  it('lô của request gửi ĐÚNG MỘT dòng dù có nhiều dòng cùng đến hạn', async () => {
    // Ô này gác GIÁ TRỊ của `PASSWORD_RESET_REQUEST_BATCH` bằng hành vi, không
    // bằng một phép so hằng-với-hằng: ba dòng đến hạn, một dòng được gửi. Nâng
    // hằng lên thì ô đỏ ngay.
    const entries = [makeEntry(), makeEntry(), makeEntry()];
    for (const entry of entries) await enqueuePasswordResetMail(db, entry);

    const sent: Array<[string, string]> = [];
    expect(
      await drainPasswordResetOutbox({
        db,
        send: recorder(sent),
        limit: PASSWORD_RESET_REQUEST_BATCH,
      }),
    ).toEqual({ sent: 1, failed: 0, expired: 0 });
    expect(await rows()).toHaveLength(2);

    // Đối chứng: lượt quét với lô đầy đủ vét nốt phần còn lại. Không có vế này,
    // ô trên vẫn xanh kể cả khi lượt drain hỏng tới mức chỉ gửi nổi một dòng.
    expect(
      (
        await drainPasswordResetOutbox({
          db,
          send: recorder(sent),
          limit: PASSWORD_RESET_OUTBOX_BATCH,
        })
      ).sent,
    ).toBe(2);
    expect(sent).toHaveLength(3);
    expect(await rows()).toHaveLength(0);
  });

  it('không để địa chỉ người nhận lẫn mã lọt vào last_error', async () => {
    const entry = makeEntry();
    await enqueuePasswordResetMail(db, entry);

    // Lỗi SMTP giả mang theo ĐÚNG hai thứ không được lưu, cộng một phản hồi AUTH.
    const leaky = new Error(
      `550 5.1.1 <${entry.email}> recipient rejected; token=${entry.code}; ` +
        `AUTH failed for smtp-user@provider.test with password hunter2`,
    );
    // Đối chứng dương: ô này vô giá trị nếu thông điệp vốn đã không chứa chúng.
    expect(leaky.message).toContain(entry.email);
    expect(leaky.message).toContain(entry.code);

    expect(
      (
        await drainPasswordResetOutbox({
          db,
          send: async () => {
            throw leaky;
          },
        })
      ).failed,
    ).toBe(1);

    const stored = (await rows())[0]?.lastError ?? '';
    expect(stored).not.toBe('');
    expect(stored).not.toContain(entry.email);
    expect(stored).not.toContain(entry.code);
    // Địa chỉ nào khác cũng vậy — phản hồi AUTH hay mang theo tài khoản gửi.
    expect(stored).not.toContain('smtp-user@provider.test');
    expect(stored).toContain('[redacted]');
    expect(stored.length).toBeLessThanOrEqual(200);
  });
});

/**
 * ⛔ Lượt dọn hết-hạn chạy ở ĐẦU mỗi lượt drain, nên thứ gì CHẶN nó cũng chặn
 * luôn lượt gửi đứng sau nó. Hai ô dưới đây gác hai thứ giữ cho lượt dọn không
 * kẹt vào một dòng đang được replica khác gửi: `SKIP LOCKED` (không xếp hàng
 * chờ) và index trên `expires_at` (không quét toàn bảng mỗi 60 giây). Một review
 * độc lập chỉ ra (N3, 2026-09-13).
 */
describe('lượt dọn hết hạn không kẹt vào dòng đang được gửi', () => {
  /**
   * Ngưỡng "đã bị chặn". Lượt dọn thật mất vài mili-giây; một lượt dọn xếp hàng
   * sau khoá của replica khác thì chờ tới `socketTimeout` (~15s). 3 giây nằm
   * giữa hai bậc đó cách xa cả hai — nó KHÔNG phải một phép đo hiệu năng.
   */
  const BLOCKED_AFTER_MS = 3_000;

  it('một dòng đang bị khoá không chặn việc dọn các dòng hết hạn khác', async () => {
    const held = { ...makeEntry(), expiresAt: new Date(Date.now() - 1_000) };
    const other = { ...makeEntry(), expiresAt: new Date(Date.now() - 1_000) };
    await enqueuePasswordResetMail(db, held);
    await enqueuePasswordResetMail(db, other);

    let release!: () => void;
    const holding = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: () => void;
    // ⚠ Phải ĐỢI khoá được cầm thật rồi mới drain. `sql.begin` trả về ngay, nên
    // không có chốt này thì lượt drain chạy TRƯỚC câu `FOR UPDATE` và dọn cả hai
    // dòng — ô xanh mà chẳng gác gì (đã thấy ở lượt chạy đầu).
    const acquired = new Promise<void>((resolve) => {
      locked = resolve;
    });
    // Một replica khác đang GỬI `held`: transaction của nó giữ khoá hàng đó suốt
    // lượt SMTP. Dựng lại đúng hình dạng ấy bằng SQL thô.
    const holder = sql.begin(async (tx) => {
      await tx`SELECT id FROM password_reset_outbox WHERE email = ${held.email} FOR UPDATE`;
      locked();
      await holding;
    });
    await acquired;

    try {
      const drained = drainPasswordResetOutbox({ db, send: recorder([]) }).then((result) => ({
        kind: 'drained' as const,
        result,
      }));
      const outcome = await Promise.race([
        drained,
        new Promise<{ kind: 'blocked' }>((resolve) => {
          setTimeout(() => resolve({ kind: 'blocked' }), BLOCKED_AFTER_MS);
        }),
      ]);

      expect(outcome.kind, 'lượt dọn phải bỏ qua dòng bị khoá, không xếp hàng chờ nó').toBe(
        'drained',
      );
      if (outcome.kind !== 'drained') return;
      // `other` bị dọn; `held` bị BỎ QUA, không bị dọn và cũng không chặn ai.
      expect(outcome.result).toEqual({ sent: 0, failed: 0, expired: 1 });
      expect((await rows()).map((row) => row.email)).toEqual([held.email]);
    } finally {
      release();
      await holder;
    }

    // Đối chứng: hết khoá thì chính dòng đó ĐƯỢC dọn. Không có vế này, ô trên vẫn
    // xanh kể cả khi `SKIP LOCKED` biến thành "bỏ qua vĩnh viễn".
    expect(await drainPasswordResetOutbox({ db, send: recorder([]) })).toEqual({
      sent: 0,
      failed: 0,
      expired: 1,
    });
    expect(await rows()).toHaveLength(0);
  });

  it('bảng THẬT có index trên expires_at, không chỉ trên next_attempt_at', async () => {
    // Hỏi `public` chứ không hỏi schema test: thứ đang được gác là bảng mà sản
    // phẩm chạy trên, và nó chỉ có index này nếu migration đã chạy thật.
    const indexes = await sql<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'password_reset_outbox'
    `;
    // Khớp theo CỘT chứ không theo tên index: đổi tên index không phải hồi quy,
    // mất cột mới là.
    expect(
      indexes.some((index) => /\(expires_at\)/.test(index.indexdef)),
      `chỉ thấy: ${indexes.map((index) => index.indexdef).join(' | ')}`,
    ).toBe(true);
  });
});

/**
 * ⛔ Bảng vắng mặt phải làm phép thăm dò NÉM — nếu không, nó là một cổng luôn xanh.
 *
 * `verifyPasswordResetOutbox` chạy trong `before` hook của
 * `/request-password-reset`, TRƯỚC lượt tra cứu tài khoản, để một nhánh hạ tầng
 * hỏng trả cùng 503 cho MỌI địa chỉ. Không có nó, chỉ email CÓ tài khoản nhận
 * 503 (vì `sendResetPassword` chỉ chạy cho chúng) còn email không tồn tại nhận
 * 200 — một kênh liệt kê tài khoản.
 *
 * ⚠ PHẠM VI của ô này, nói thẳng: nó kiểm PHÉP THĂM DÒ, không kiểm phần nối dây.
 * Việc "cả hai probe nằm cùng một `try` trước lượt tra cứu" được giữ bằng cấu
 * trúc mã trong `auth/config.ts`, không bằng ô test này. Một lượt đo đầu-cuối
 * cần dựng một môi trường thiếu đúng bảng đó trong lúc better-auth đang chạy.
 */
describe('verifyPasswordResetOutbox — cân bằng nhánh hỏng của DB', () => {
  it('bảng có thật ⇒ không ném', async () => {
    await expect(verifyPasswordResetOutbox(db)).resolves.toBeUndefined();
  });

  it('bảng vắng mặt ⇒ NÉM, để hook trả 503 cho mọi địa chỉ', async () => {
    // Một handle trỏ vào một schema rỗng: cùng client, cùng kiểu, không có bảng.
    const empty = `${TEST_SCHEMA}_missing`;
    const admin = postgres(databaseUrl(), { max: 1 });
    try {
      await admin.unsafe(`DROP SCHEMA IF EXISTS ${empty} CASCADE`);
      await admin.unsafe(`CREATE SCHEMA ${empty}`);
    } finally {
      await admin.end();
    }
    const client = postgres(databaseUrl(), { max: 1, connection: { search_path: empty } });
    const bare = drizzle(client, { schema }) as unknown as Database;
    try {
      await expect(verifyPasswordResetOutbox(bare)).rejects.toThrow();
    } finally {
      await client.end();
      const cleanup = postgres(databaseUrl(), { max: 1 });
      try {
        await cleanup.unsafe(`DROP SCHEMA IF EXISTS ${empty} CASCADE`);
      } finally {
        await cleanup.end();
      }
    }
  });
});
