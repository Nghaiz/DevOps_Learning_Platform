import { and, asc, eq, lt, lte } from 'drizzle-orm';
import type { Database } from '../db/client';
import { passwordResetOutbox } from '../db/schema';

/**
 * Hàng đợi BỀN VỮNG cho thư đặt lại mật khẩu (P16 §8).
 *
 * Module này KHÔNG import gì từ `password-reset-mail.ts`: nó nhận hàm gửi qua
 * tham số. Chiều phụ thuộc vì vậy chỉ có một — mail → outbox — và không có vòng
 * lặp import nào để hỏng lúc nạp module. Tác dụng phụ có ích: ô nghiệm thu bơm
 * được một hàm gửi chậm/hỏng vào mà không phải dựng SMTP giả.
 */

/** Số lượt gửi THẤT BẠI tối đa trước khi ngừng thử một dòng. */
export const PASSWORD_RESET_MAX_ATTEMPTS = 5;

/**
 * Giãn cách trước lượt thử lại đầu tiên; mỗi lượt sau nhân đôi.
 *
 * 30s × luỹ thừa 2 đặt các lượt thử ở t = 0, +30s, +90s, +210s, +450s. Lượt cuối
 * rơi vào phút thứ 7,5 — vẫn NẰM TRONG TTL 15 phút của mã, nên không lượt nào bị
 * tiêu phí vào một mã đã chết. Nâng trần số lượt hay nâng hằng này thì phải kiểm
 * lại bất đẳng thức đó, không thì các lượt cuối chỉ tốn kết nối SMTP.
 */
export const PASSWORD_RESET_RETRY_BASE_MS = 30_000;

/** Số dòng tối đa một lượt drain xử lý. Mỗi dòng là MỘT transaction riêng. */
export const PASSWORD_RESET_OUTBOX_BATCH = 20;

const REDACTED = '[redacted]';
const MAX_LAST_ERROR_LENGTH = 200;

export type PasswordResetSender = (email: string, code: string) => Promise<void>;

export interface PasswordResetDrainResult {
  /** Gửi xong và dòng đã bị xoá. */
  sent: number;
  /** Gửi hỏng; `attempts` đã tăng và `next_attempt_at` đã lùi ra. */
  failed: number;
  /** Quá `expires_at` nên bị dọn mà KHÔNG gửi. */
  expired: number;
}

/**
 * Nhận việc gửi. Ghi được dòng này = đã nhận; lượt gửi xảy ra sau đó.
 *
 * Mọi mốc thời gian lấy từ MỘT `Date` của tiến trình, không dùng `now()` của
 * Postgres, để phép so ở `drainPasswordResetOutbox` không bao giờ trộn hai đồng
 * hồ. DB lệch nhanh hơn tiến trình vài chục giây là đủ để một dòng vừa ghi bị
 * đọc thành "chưa đến hạn" — im lặng hoãn thư tới lượt quét định kỳ.
 */
export async function enqueuePasswordResetMail(
  db: Database,
  entry: { email: string; code: string; expiresAt: Date },
): Promise<void> {
  const now = new Date();
  await db.insert(passwordResetOutbox).values({
    email: entry.email,
    code: entry.code,
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    expiresAt: entry.expiresAt,
  });
}

/**
 * Gửi các dòng đã đến hạn, mỗi dòng trong một transaction riêng.
 *
 * `SELECT … FOR UPDATE SKIP LOCKED` là thứ khiến nhiều replica cùng drain KHÔNG
 * gửi trùng: replica đang xử lý một dòng giữ khoá hàng đó cho tới lúc commit, và
 * `SKIP LOCKED` khiến replica kia bỏ qua chứ không xếp hàng chờ. Bỏ mệnh đề đó
 * đi thì hai replica đọc ra cùng một dòng và người dùng nhận hai thư.
 *
 * MỘT transaction MỖI DÒNG, không phải một transaction cho cả lô: khoá hàng được
 * giữ suốt lượt gửi SMTP (tối đa ~15s theo `socketTimeout`), nên gộp cả lô sẽ giữ
 * khoá và một kết nối DB lâu gấp `PASSWORD_RESET_OUTBOX_BATCH` lần. Tách ra còn
 * làm một lượt gửi hỏng không cuốn theo các dòng đã xử lý xong trước nó.
 *
 * Tiến trình chết giữa chừng thì transaction đang mở bị rollback — dòng trở lại
 * trạng thái chờ và lượt drain sau nhận nó. Đó chính là điều `after()` một mình
 * không làm được.
 */
export async function drainPasswordResetOutbox(options: {
  db: Database;
  send: PasswordResetSender;
  limit?: number;
}): Promise<PasswordResetDrainResult> {
  const { db, send, limit = PASSWORD_RESET_OUTBOX_BATCH } = options;
  const result: PasswordResetDrainResult = { sent: 0, failed: 0, expired: 0 };

  result.expired += await purgeExpired(db);

  for (let processed = 0; processed < limit; processed += 1) {
    const outcome = await deliverOneDueRow(db, send);
    if (outcome === null) break;
    result[outcome] += 1;
  }

  return result;
}

/**
 * Dọn mọi dòng quá hạn, kể cả dòng đã cạn lượt thử.
 *
 * Tách khỏi vòng lặp bên dưới vì truy vấn đến-hạn CỐ TÌNH bỏ qua dòng đã chạm
 * `PASSWORD_RESET_MAX_ATTEMPTS` — không có lượt dọn theo tập này thì đúng những
 * dòng đó nằm lại vĩnh viễn, mang theo mã ở dạng bản rõ.
 */
async function purgeExpired(db: Database): Promise<number> {
  const purged = await db
    .delete(passwordResetOutbox)
    .where(lte(passwordResetOutbox.expiresAt, new Date()))
    .returning({ id: passwordResetOutbox.id });
  return purged.length;
}

async function deliverOneDueRow(
  db: Database,
  send: PasswordResetSender,
): Promise<keyof PasswordResetDrainResult | null> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [row] = await tx
      .select()
      .from(passwordResetOutbox)
      .where(
        and(
          lte(passwordResetOutbox.nextAttemptAt, now),
          lt(passwordResetOutbox.attempts, PASSWORD_RESET_MAX_ATTEMPTS),
        ),
      )
      .orderBy(asc(passwordResetOutbox.nextAttemptAt))
      .limit(1)
      .for('update', { skipLocked: true });

    if (row === undefined) return null;

    // Dòng có thể vừa hết hạn sau lượt dọn ở trên. Gửi một mã đã chết chỉ khiến
    // người dùng nhập vào rồi bị từ chối.
    if (row.expiresAt.getTime() <= now.getTime()) {
      await tx.delete(passwordResetOutbox).where(eq(passwordResetOutbox.id, row.id));
      return 'expired';
    }

    try {
      await send(row.email, row.code);
      // XOÁ chứ không đánh dấu: "đã gửi" = không còn dòng. Giữ lại một dòng đã
      // gửi là giữ mã bản rõ quá thời điểm nó còn cần tồn tại.
      await tx.delete(passwordResetOutbox).where(eq(passwordResetOutbox.id, row.id));
      return 'sent';
    } catch (error) {
      const attempts = row.attempts + 1;
      await tx
        .update(passwordResetOutbox)
        .set({
          attempts,
          nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempts)),
          lastError: sanitizeDeliveryError(error, [row.email, row.code]),
        })
        .where(eq(passwordResetOutbox.id, row.id));
      console.error('[auth] Password reset email delivery failed; inspect SMTP provider health.');
      return 'failed';
    }
  });
}

function retryDelayMs(attempts: number): number {
  return PASSWORD_RESET_RETRY_BASE_MS * 2 ** (attempts - 1);
}

/**
 * Làm sạch thông điệp lỗi TRƯỚC khi nó chạm cột `last_error`.
 *
 * Lớp phòng thủ thứ hai, có chủ ý: `sendPasswordResetMail` đã thu mọi lỗi SMTP
 * về một chuỗi hằng, nên trong sản phẩm cột này chỉ chứa chuỗi đó. Lớp này tồn
 * tại vì lớp kia chỉ cách một lần refactor là rò — lỗi SMTP thô mang theo cả địa
 * chỉ người nhận lẫn phản hồi AUTH, và một cột trong DB thì sống lâu hơn một
 * dòng log.
 *
 * Xoá theo cả hai hướng: chuỗi bí mật ĐÃ BIẾT của chính dòng này (không phân
 * biệt hoa thường — máy chủ SMTP hay trả lại địa chỉ đã chuẩn hoá), rồi mọi thứ
 * còn lại có hình dạng một địa chỉ email. Cắt độ dài ở bước cuối nên không bước
 * nào có thể mang bí mật quay lại.
 */
export function sanitizeDeliveryError(error: unknown, secrets: readonly string[]): string {
  let text =
    error instanceof Error && error.message.length > 0
      ? error.message
      : 'Unknown password reset delivery failure.';
  for (const secret of secrets) {
    // Chuỗi quá ngắn thì khớp bừa vào chữ thường của thông điệp; bỏ qua.
    if (secret.length < 4) continue;
    text = text.replace(new RegExp(escapeRegExp(secret), 'gi'), REDACTED);
  }
  text = text.replace(/[^\s<>()[\],;:"']+@[^\s<>()[\],;:"']+/g, REDACTED);
  return text.slice(0, MAX_LAST_ERROR_LENGTH);
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
