import nodemailer from 'nodemailer';
import { AsyncLocalStorage } from 'node:async_hooks';
import { after } from 'next/server';
import { z } from 'zod';
import { t } from '@devops-platform/copy';
import { getDb } from '../db/client';
import { betterAuthUrl } from '../env';
import {
  PASSWORD_RESET_REQUEST_BATCH,
  drainPasswordResetOutbox,
  enqueuePasswordResetMail,
  type PasswordResetDrainResult,
} from './password-reset-outbox';

export const PASSWORD_RESET_TTL_SECONDS = 15 * 60;

/** How many rows this request accepted. Absent store = called outside the HTTP wrapper. */
const deliveryRequest = new AsyncLocalStorage<{ queued: number }>();

/**
 * Deliver after the response so recipient acceptance cannot disclose account existence.
 *
 * The row itself is written during the request; only the SMTP round-trip is
 * deferred. That is the exchange this boundary was always protecting: a remote
 * provider takes hundreds of milliseconds and can reject a recipient outright,
 * whereas the local insert is the same order of magnitude as the verification
 * row Better Auth already writes for an existing account on this same path.
 */
export async function withPasswordResetDelivery(
  handler: () => Promise<Response>,
): Promise<Response> {
  return deliveryRequest.run({ queued: 0 }, async () => {
    const response = await handler();
    if ((deliveryRequest.getStore()?.queued ?? 0) > 0) {
      after(async () => {
        // Lô CỦA REQUEST, không phải lô của lượt quét — xem
        // `PASSWORD_RESET_REQUEST_BATCH`. Một request không được chở tồn đọng
        // của người khác trên một kết nối của pool.
        await deliverQueuedPasswordResetMail(PASSWORD_RESET_REQUEST_BATCH);
      });
    }
    return response;
  });
}

/**
 * Accept the delivery durably, then let the queue own the send.
 *
 * A committed row survives the process; the previous in-memory callback did not.
 * Callers therefore learn whether the work was ACCEPTED, not whether SMTP took
 * it — which is the honest promise, and the one the UI already makes.
 */
export async function schedulePasswordResetMail(email: string, code: string): Promise<void> {
  await enqueuePasswordResetMail(getDb(), {
    email,
    code,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_SECONDS * 1000),
  });
  const request = deliveryRequest.getStore();
  if (request) request.queued += 1;
  // Server API callers outside the HTTP wrapper still await an attempt. A failed
  // attempt is now recorded and retried instead of thrown: the row is already
  // accepted, so raising here would report loss that did not happen.
  else await deliverQueuedPasswordResetMail(PASSWORD_RESET_REQUEST_BATCH);
}

/**
 * The production-wired drain: this app's database, this module's SMTP sender.
 *
 * `limit` is REQUIRED on purpose. The two callers want different sizes — a
 * request-scoped drain must stay tiny, the periodic sweep may take the full
 * batch — and a default here would let a new caller pick one by accident and
 * still compile. (Same reasoning the review applied to `profileForCapabilities`
 * in Q6: a default parameter is an invariant the compiler stops holding.)
 */
export async function deliverQueuedPasswordResetMail(
  limit: number,
): Promise<PasswordResetDrainResult> {
  return drainPasswordResetOutbox({ db: getDb(), send: sendPasswordResetMail, limit });
}

const smtpSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-zA-Z0-9.:-]+$/),
  port: z.coerce.number().int().min(1).max(65535),
  tls: z.enum(['starttls', 'implicit', 'local']),
  user: z.string().optional(),
  password: z.string().optional(),
  from: z.email(),
});

/** Lazy: a missing mail provider must not break sign-in or Docker builds. */
export function passwordResetSmtpConfig() {
  const result = smtpSchema.safeParse({
    host: process.env['SMTP_HOST'],
    port: process.env['SMTP_PORT'] ?? '587',
    tls: process.env['SMTP_TLS'] ?? 'starttls',
    user: process.env['SMTP_USER'] || undefined,
    password: process.env['SMTP_PASSWORD'] || undefined,
    from: process.env['SMTP_FROM'],
  });
  // Do not expose Zod's inputs: they include the SMTP credential.
  if (!result.success) throw new Error('Password reset SMTP configuration is invalid.');
  const config = result.data;
  if (Boolean(config.user) !== Boolean(config.password)) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must be configured together.');
  }
  if (
    config.tls === 'local' &&
    (!['localhost', '127.0.0.1', '::1', 'mailpit'].includes(config.host) || config.user)
  ) {
    throw new Error('Plain SMTP is restricted to the local mail sink without credentials.');
  }
  return config;
}

function smtpTransport(config: ReturnType<typeof passwordResetSmtpConfig>) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.tls === 'implicit',
    requireTLS: config.tls === 'starttls',
    ignoreTLS: config.tls === 'local',
    ...(config.user && config.password
      ? { auth: { user: config.user, pass: config.password } }
      : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

const SMTP_UNAVAILABLE = 'Password reset SMTP provider is unavailable.';

/**
 * Cửa sổ ghi nhớ một lượt thăm dò ĐẠT. Dài hơn cửa sổ của lượt hỏng vì hai
 * hướng sai lệch không cùng giá: nhớ nhầm "đang sống" chỉ khiến thư rơi vào
 * hàng đợi rồi được thử lại, còn nhớ nhầm "đang chết" chặn người dùng THẬT khỏi
 * đặt lại mật khẩu.
 */
const SMTP_PROBE_OK_TTL_MS = 30_000;
const SMTP_PROBE_FAIL_TTL_MS = 5_000;

let smtpProbe: { ok: boolean; until: number } | null = null;
let smtpProbeInFlight: Promise<void> | null = null;

/**
 * Quên kết quả thăm dò đang nhớ. KHÔNG có caller nào trong sản phẩm.
 *
 * Tồn tại cho ô nghiệm thu: một SMTP giả đổi trạng thái trong vài mili-giây, tức
 * đúng thứ mà cửa sổ ghi nhớ được thiết kế để CHẬM nhận ra. Không có hàm này,
 * ô nào muốn dựng "nhà cung cấp vừa sập" đều phải chờ hết cửa sổ thật.
 */
export function forgetPasswordResetSmtpProbe(): void {
  smtpProbe = null;
  smtpProbeInFlight = null;
}

/**
 * Hỏi nhà cung cấp có sống không, TRƯỚC lượt tra cứu tài khoản — nhưng nhiều
 * nhất một lượt hỏi cho mỗi cửa sổ, cho cả tiến trình.
 *
 * ## Vì sao ghi nhớ
 *
 * Bản trước dựng một transport MỚI và `verify()` cho MỌI request trên một route
 * CÔNG KHAI, với `connectionTimeout`/`greetingTimeout` 10 giây. Hai hệ quả: một
 * request có thể bị giữ 10-20 giây, và mỗi request là một kết nối TCP nữa tới
 * nhà cung cấp — thứ mà chính nhà cung cấp sẽ chặn trước khi ta kịp lo. Giới hạn
 * tần suất của better-auth không cứu được: nó lưu ở BỘ NHỚ, nên N replica là
 * N×3 lượt/phút/IP, và IP thì nhiều.
 *
 * Hai chốt: gộp các lượt ĐỒNG THỜI vào chung một promise, và nhớ KẾT QUẢ trong
 * một cửa sổ ngắn. Trần trở thành một lượt thăm dò mỗi cửa sổ mỗi replica.
 *
 * ## ⛔ Vì sao nó KHÔNG mở lại kênh liệt kê tài khoản
 *
 * Phép thăm dò này nằm trước lượt tra cứu tài khoản để một nhánh hạ tầng hỏng
 * trả CÙNG câu trả lời cho mọi địa chỉ (xem `config.ts`). Bộ nhớ ở đây là MỘT ô
 * duy nhất cho cả tiến trình, **không nhận địa chỉ nào làm khoá** — hàm còn
 * không có tham số email để mà khoá theo. Nên mọi địa chỉ trong cùng một cửa sổ
 * nhận đúng một kết quả; không có đường nhanh cho email có thật và đường chậm
 * cho email bịa.
 *
 * Kênh thời gian cũng không mở ra: lượt ĐẦU của mỗi cửa sổ trả chậm, các lượt
 * sau trả nhanh, và thứ quyết định là THỨ TỰ ĐẾN chứ không phải địa chỉ. Đảo
 * thứ tự hai địa chỉ thì kết quả đảo theo — tức không đo được gì về địa chỉ.
 *
 * ## Cái giá, nói thẳng
 *
 * Nhà cung cấp sập giữa cửa sổ thì phải tới `SMTP_PROBE_OK_TTL_MS` mới bị nhận
 * ra. Trong khoảng đó request đi tiếp và trả 200 — nhưng 200 cho CẢ HAI nhánh
 * (tài khoản có thật thì ghi một dòng outbox rồi trả 200; không có thật thì
 * better-auth trả 200 sẵn), nên vế cân bằng vẫn nguyên. Thứ mất là tính KỊP
 * THỜI của mã 503, không phải tính đối xứng của nó; và dòng đã ghi thì hàng đợi
 * thử lại, không mất.
 *
 * Một review độc lập chỉ ra (Q3, 2026-09-13).
 */
export async function verifyPasswordResetSmtp(): Promise<void> {
  // Cấu hình phân giải MỖI LƯỢT, không nằm trong bộ nhớ: nó chỉ đọc env chứ
  // không chạm socket (tức không phải thứ Q3 nói tới), và một cấu hình hỏng phải
  // hiện ra ngay — nhớ nó lại thì một lượt sửa env phải chờ hết cửa sổ mới ăn.
  const config = passwordResetSmtpConfig();

  const remembered = smtpProbe;
  if (remembered !== null && Date.now() < remembered.until) {
    if (remembered.ok) return;
    throw new Error(SMTP_UNAVAILABLE);
  }

  // `??=` chứ không phải gán mới: request thứ hai đến giữa lúc lượt thăm dò đầu
  // còn đang chạy sẽ CHỜ CHUNG nó, không mở thêm kết nối.
  smtpProbeInFlight ??= probePasswordResetSmtp(config);
  await smtpProbeInFlight;
}

async function probePasswordResetSmtp(
  config: ReturnType<typeof passwordResetSmtpConfig>,
): Promise<void> {
  try {
    const transport = smtpTransport(config);
    try {
      await transport.verify();
    } finally {
      transport.close();
    }
    smtpProbe = { ok: true, until: Date.now() + SMTP_PROBE_OK_TTL_MS };
  } catch {
    smtpProbe = { ok: false, until: Date.now() + SMTP_PROBE_FAIL_TTL_MS };
    throw new Error(SMTP_UNAVAILABLE);
  } finally {
    // Xoá TRƯỚC khi promise này settle, nên lượt gọi sau đọc `smtpProbe` vừa ghi
    // ở trên thay vì bám vào một promise đã xong.
    smtpProbeInFlight = null;
  }
}

/** Submit to SMTP and propagate failures; never log the recipient or reset code. */
export async function sendPasswordResetMail(email: string, code: string): Promise<void> {
  z.email().parse(email);
  const config = passwordResetSmtpConfig();
  const transport = smtpTransport(config);
  try {
    const result = await transport.sendMail({
      from: config.from,
      to: email,
      subject: t('auth.mail.reset-subject'),
      text: t('auth.mail.reset-body', {
        code,
        // Better Auth's supplied URL includes a bearer credential. The project
        // uses a separate code field, so no credential ever enters browser URLs.
        url: new URL('/reset-password', betterAuthUrl()).href,
      }),
    });
    if (result.accepted.length !== 1 || result.rejected.length !== 0) {
      throw new Error('SMTP did not accept the password reset message.');
    }
  } catch {
    // SMTP errors can include AUTH responses and recipient addresses.
    throw new Error('Password reset email delivery failed.');
  } finally {
    transport.close();
  }
}
