import { and, asc, eq, inArray, lt, lte } from 'drizzle-orm';
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

/**
 * Số dòng một lượt drain CHẠY THEO REQUEST được phép xử lý — cố ý là 1.
 *
 * Đường `after()` chạy SAU khi response đã trả, nên người dùng không chờ nó;
 * cái giá thật là một kết nối trong pool (`max: 10`) bị giữ suốt lượt SMTP, vì
 * `deliverOneDueRow` gửi ngay TRONG transaction. Với lô 20, một request giữ
 * được kết nối đó tới 20 × 15s = 300 giây để gửi thư CỦA NGƯỜI KHÁC — mười
 * request như vậy vét sạch pool, và thứ chết theo là các request đang phục vụ
 * người dùng trực tiếp.
 *
 * Vì sao 1 là ĐỦ chứ không phải một nhát cắt liều: mỗi request nhận đúng MỘT
 * dòng, nên lô 1 làm thông lượng của đường `after()` bằng đúng tốc độ dòng được
 * nhận vào — hàng đợi không thể phình ra vì đường này. Và ở trạng thái bình
 * thường (không tồn đọng) chỉ có đúng một dòng đến hạn, chính là dòng vừa nhận;
 * hành vi khi ấy KHÔNG khác lô 20 một chút nào.
 *
 * Bù tồn đọng là việc của lượt quét định kỳ, nơi lô vẫn là
 * `PASSWORD_RESET_OUTBOX_BATCH`: nó chạy trên timer, không nằm trên đường của
 * request nào, và đã có chốt `inFlight` chặn chồng lượt.
 *
 * Cái giá phải nhận, nói thẳng: khi ĐANG tồn đọng, dòng được gửi có thể không
 * phải dòng của request này (truy vấn đến-hạn xếp theo `next_attempt_at` tăng
 * dần — cũ trước), nên thư của nó lùi tới lượt quét sau, tối đa 60 giây.
 *
 * ⚠ GIỚI HẠN còn lại: trần này bó MỖI request, không bó SỐ request đồng thời.
 * SMTP treo cộng đủ nhiều request vẫn vét được pool, chỉ là lâu hơn 20 lần.
 * Chốt thật cho việc đó là một hàng rào đồng thời (như `inFlight` của lượt
 * quét) hoặc một pool riêng cho việc nền — chưa làm.
 *
 * Một review độc lập chỉ ra (N4, 2026-09-13).
 */
export const PASSWORD_RESET_REQUEST_BATCH = 1;

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
/**
 * Bảng outbox có sẵn sàng nhận việc không — hỏi TRƯỚC khi tra cứu tài khoản.
 *
 * ## Vì sao phép kiểm này tồn tại: một kênh LIỆT KÊ TÀI KHOẢN
 *
 * `sendResetPassword` chỉ chạy cho email CÓ tài khoản — better-auth trả 200
 * cứng cho email không tồn tại mà không gọi nó. Nên nếu lượt ghi outbox ném
 * (bản triển khai mới lên trước khi migration `0010` chạy, DB không ghi được,
 * quyền thiếu), kết quả là:
 *
 *   email CÓ tài khoản   ⇒ 503
 *   email KHÔNG tài khoản ⇒ 200
 *
 * và `forgot-password-form.tsx` phơi đúng khác biệt đó ra màn hình. Người dò
 * chỉ cần đọc mã trạng thái là biết địa chỉ nào có thật — đúng thứ mà toàn bộ
 * phần còn lại của luồng này (cùng phản hồi cho mọi địa chỉ, gửi SAU response)
 * được dựng để chặn.
 *
 * `verifyPasswordResetSmtp()` đã cân bằng nhánh SMTP theo đúng cách này từ
 * trước; hàng đợi thêm một nhánh hỏng mới mà không ai cân bằng. Hàm này là vế
 * còn thiếu. Một review độc lập chỉ ra (Q2, 2026-09-13).
 *
 * ## Giới hạn, nói thẳng
 *
 * Đây là phép kiểm ĐỌC. Nó bắt được ca áp đảo (bảng chưa tồn tại / DB không với
 * tới được) nhưng KHÔNG chứng minh ghi được: đĩa đầy, quyền chỉ-đọc, hay một
 * ràng buộc bị vi phạm vẫn lọt qua. Dùng một lượt ghi-rồi-xoá thật sẽ đóng nốt,
 * nhưng nó biến MỌI request quên-mật-khẩu thành hai lượt ghi DB trên một route
 * công khai — đổi một kênh hẹp lấy một bề mặt từ chối dịch vụ rộng hơn.
 */
export async function verifyPasswordResetOutbox(db: Database): Promise<void> {
  await db.select({ id: passwordResetOutbox.id }).from(passwordResetOutbox).limit(1);
}

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
 *
 * ⛔ `SKIP LOCKED` ở đây KHÔNG phải để tránh gửi trùng (lượt dọn không gửi gì) —
 * nó để lượt dọn không BỊ CHẶN. Một dòng đang được replica khác gửi bị khoá suốt
 * lượt SMTP (tới ~15s theo `socketTimeout`); một `DELETE … WHERE expires_at <=
 * now()` trần sẽ xếp hàng chờ đúng dòng đó. Mà lượt dọn chạy ở ĐẦU mỗi lượt
 * drain, nên nó không chỉ hoãn việc dọn: nó hoãn cả lượt drain đứng sau. Bỏ qua
 * dòng đang bị khoá là đúng nghiệp vụ — dòng đó đang được xử lý, và nếu nó thật
 * sự đã hết hạn thì chính transaction kia xoá nó (xem `deliverOneDueRow`); còn
 * không thì lượt dọn sau nhặt. Một review độc lập chỉ ra (N3, 2026-09-13).
 *
 * Vị từ nằm ở SUBQUERY chứ không ở `DELETE`: `FOR UPDATE SKIP LOCKED` là mệnh đề
 * của `SELECT`, `DELETE` không có mệnh đề tương đương.
 */
async function purgeExpired(db: Database): Promise<number> {
  const expired = db
    .select({ id: passwordResetOutbox.id })
    .from(passwordResetOutbox)
    .where(lte(passwordResetOutbox.expiresAt, new Date()))
    .for('update', { skipLocked: true });
  const purged = await db
    .delete(passwordResetOutbox)
    .where(inArray(passwordResetOutbox.id, expired))
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
