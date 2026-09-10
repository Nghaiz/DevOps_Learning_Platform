import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { NextRequest } from 'next/server';
import * as schema from '../server/db/schema';
import { users, verifications } from '../server/db/schema';
import { databaseUrl } from '../server/env';
import { getAuth } from '../server/auth/config';
import { RESET_COOKIE_NAME, RESET_COOKIE_PATHS } from '../server/auth/reset-link';
import { decodeMailText, startFakeSmtp, type FakeSmtp } from '../server/auth/fake-smtp';
import { GET as exchangeLink } from '../app/api/auth/reset-link/[token]/route';
import { POST as finishReset } from '../app/api/auth/reset-finish/route';

/**
 * Luồng đặt lại mật khẩu, CHẠY THẬT đầu đến cuối.
 *
 * Postgres thật (`docker compose up -d postgres` + `pnpm db:migrate`), Better
 * Auth thật, một máy chủ SMTP thật trên loopback, và hai route handler thật của
 * app. Không mock nào.
 *
 * ## Vì sao phải là bộ TÍCH HỢP chứ không phải bốn bộ đơn vị
 *
 * Bốn mảnh của luồng này (thư viện sinh mã, thư mang liên kết, route đổi mã lấy
 * cookie, route đọc cookie rồi đổi mật khẩu) đều dễ kiểm riêng, và kiểm riêng
 * KHÔNG chứng minh gì: mảnh đầu có thể sinh mã mà mảnh cuối không nhận, cookie
 * có thể đặt ở một `Path` mà request sau không mang. Cả bốn cùng xanh trong khi
 * người dùng không đổi được mật khẩu. Chỗ duy nhất bắt được lớp lỗi đó là một
 * lượt đi hết chuỗi.
 *
 * ## ⛔ Ô chống dò tài khoản là ô không được phép mềm đi
 *
 * `phản hồi cho email KHÔNG tồn tại phải giống hệt phản hồi cho email có thật`.
 * Better Auth đã dựng sẵn (nó còn sinh một id giả và tra một hàng giả để chống
 * cả tấn công đo thời gian), nhưng "thư viện có làm" không phải bằng chứng, và
 * một `sendResetPassword` ném ra sẽ phá đúng tính chất đó mà không cổng nào
 * khác thấy. Xem chú thích đầu `server/auth/mail.ts`.
 *
 * ⚠ ĐÒI Postgres.
 */

const EMAIL = 'p16d-reset@test.local';
const OLD_PASSWORD = 'MatKhauCu-12345';
const NEW_PASSWORD = 'MatKhauMoi-67890';
const UNKNOWN_EMAIL = 'p16d-khong-ton-tai@test.local';

const sql = postgres(databaseUrl(), { max: 1 });
const db = drizzle(sql, { schema });

let smtp: FakeSmtp;
let userId = '';

async function purge(): Promise<void> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));
  for (const row of rows) {
    // `sessions` và `accounts` có FK ON DELETE CASCADE; `verifications` thì
    // không (nó không tham chiếu user), nên phải dọn tay theo `value`.
    await db.delete(verifications).where(eq(verifications.value, row.id));
    await db.delete(users).where(eq(users.id, row.id));
  }
}

beforeAll(async () => {
  smtp = await startFakeSmtp();
  process.env['SMTP_HOST'] = '127.0.0.1';
  process.env['SMTP_PORT'] = String(smtp.port);
  process.env['SMTP_FROM'] = 'DLP <no-reply@dlp.local>';
  delete process.env['SMTP_USER'];
  delete process.env['SMTP_PASSWORD'];
  delete process.env['SMTP_SECURE'];

  await purge();
  await getAuth().api.signUpEmail({
    body: { name: 'P16D Reset', email: EMAIL, password: OLD_PASSWORD },
  });
  const [created] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));
  userId = created?.id ?? '';
  expect(userId).not.toBe('');
});

afterAll(async () => {
  await purge();
  await smtp.close();
  await sql.end();
});

/** Đọc mã ra khỏi liên kết trong thư, đúng cách trình duyệt sẽ đọc nó. */
function tokenFromMail(body: string): { readonly link: string; readonly token: string } {
  const match = /(http:\/\/\S*\/api\/auth\/reset-link\/\S+)/.exec(body);
  const link = match?.[1];
  if (link === undefined) {
    throw new Error(`không tìm thấy liên kết đặt lại trong thân thư:\n${body}`);
  }
  const segments = new URL(link).pathname.split('/');
  return { link, token: decodeURIComponent(segments[segments.length - 1] as string) };
}

async function requestReset(email: string): Promise<unknown> {
  return getAuth().api.requestPasswordReset({ body: { email } });
}

describe('đặt lại mật khẩu: một lượt đi hết chuỗi', () => {
  it('xin liên kết ⇒ thư TỚI NƠI, mang mã, và mã KHÔNG ở query string', async () => {
    await requestReset(EMAIL);

    const message = await smtp.waitFor(EMAIL);
    const body = decodeMailText(message.data);
    const { link, token } = tokenFromMail(body);

    expect(token.length).toBeGreaterThan(10);
    // Luật 8, đo trên liên kết THẬT do máy chủ sinh ra, không phải trên mã nguồn.
    expect(new URL(link).search).toBe('');
    expect([...new URL(link).searchParams.keys()]).toEqual([]);

    // Mã có thật trong bảng: chứng minh thư mang mã của CHÍNH lượt yêu cầu này,
    // không phải một chuỗi bất kỳ trông giống mã.
    const rows = await db
      .select({ value: verifications.value })
      .from(verifications)
      .where(eq(verifications.identifier, `reset-password:${token}`));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe(userId);
  });

  it('bấm liên kết ⇒ cookie HttpOnly trên hai đường, và chuyển hướng sang trang TRẦN', async () => {
    const message = await smtp.waitFor(EMAIL);
    const { token } = tokenFromMail(decodeMailText(message.data));

    const response = await exchangeLink(new Request('http://localhost:3000/api/auth/reset-link/x'), {
      params: Promise.resolve({ token }),
    });

    expect(response.status).toBe(303);
    // Không tham số nào trên đường đích: đó là toàn bộ điểm của bước đổi mã.
    expect(response.headers.get('Location')).toBe('/reset-password');

    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(RESET_COOKIE_PATHS.length);
    for (const path of RESET_COOKIE_PATHS) {
      const cookie = cookies.find((value) => value.includes(`Path=${path}`));
      expect(cookie, `thiếu cookie cho ${path}`).toBeDefined();
      expect(cookie).toContain(`${RESET_COOKIE_NAME}=${token}`);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
    }
  });

  it('mật khẩu quá ngắn ⇒ weak-password, và cookie KHÔNG bị xoá', async () => {
    const message = await smtp.waitFor(EMAIL);
    const { token } = tokenFromMail(decodeMailText(message.data));

    const response = await finishReset(finishRequest(token, 'ngan'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'weak-password' });
    // Liên kết vẫn còn dùng được: người dùng chỉ gõ hụt, không cần xin lại.
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('gửi mật khẩu mới ⇒ đổi được, cookie bị xoá, mã tiêu luôn', async () => {
    const message = await smtp.waitFor(EMAIL);
    const { token } = tokenFromMail(decodeMailText(message.data));

    const response = await finishReset(finishRequest(token, NEW_PASSWORD));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const cleared = response.headers.getSetCookie();
    expect(cleared).toHaveLength(RESET_COOKIE_PATHS.length);
    for (const cookie of cleared) {
      expect(cookie).toContain('Max-Age=0');
    }

    // Mã dùng-một-lần: hàng verification đã bị tiêu.
    const rows = await db
      .select({ id: verifications.id })
      .from(verifications)
      .where(eq(verifications.identifier, `reset-password:${token}`));
    expect(rows).toEqual([]);
  });

  it('mật khẩu MỚI đăng nhập được, mật khẩu CŨ thì không', async () => {
    const session = await getAuth().api.signInEmail({
      body: { email: EMAIL, password: NEW_PASSWORD },
    });
    expect(session.user.email).toBe(EMAIL);

    await expect(
      getAuth().api.signInEmail({ body: { email: EMAIL, password: OLD_PASSWORD } }),
    ).rejects.toThrow();
  });

  it('dùng lại mã đã tiêu ⇒ invalid-link, và cookie bị xoá', async () => {
    const message = await smtp.waitFor(EMAIL);
    const { token } = tokenFromMail(decodeMailText(message.data));

    const response = await finishReset(finishRequest(token, 'MotMatKhauKhac-999'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid-link' });
    expect(response.headers.getSetCookie()).toHaveLength(RESET_COOKIE_PATHS.length);
  });

  it('mã bịa ⇒ invalid-link, và mật khẩu KHÔNG đổi', async () => {
    const response = await finishReset(finishRequest('ma-bia-dat-hoan-toan', 'KhongDuocDoi-123'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid-link' });

    const session = await getAuth().api.signInEmail({
      body: { email: EMAIL, password: NEW_PASSWORD },
    });
    expect(session.user.email).toBe(EMAIL);
  });

  it('không có cookie ⇒ no-link, và KHÔNG đọc gì từ thân request', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/reset-finish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'MotMatKhauDaiHon-1' }),
    });
    const response = await finishReset(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'no-link' });
  });
});

describe('chống dò tài khoản', () => {
  it('email KHÔNG tồn tại nhận phản hồi GIỐNG HỆT email có thật, và không sinh thư', async () => {
    const before = smtp.messages.length;

    const known = await requestReset(EMAIL);
    const unknown = await requestReset(UNKNOWN_EMAIL);

    // Cùng một body, từng khoá một. Đây là thứ kẻ tấn công đọc được.
    expect(unknown).toEqual(known);

    // Đúng MỘT thư mới (của email có thật). Nếu con số này là 2 thì ta đang gửi
    // thư cho địa chỉ lạ; nếu là 0 thì lượt đo trên vô nghĩa vì chẳng có gì xảy ra.
    await smtp.waitForCount(before + 1);
    expect(smtp.messages.length).toBe(before + 1);
    expect(smtp.messages.some((mail) => mail.to.includes(UNKNOWN_EMAIL))).toBe(false);
  });

  it('không hàng verification nào được tạo cho email lạ', async () => {
    const rows = await db.select({ value: verifications.value }).from(verifications);
    expect(rows.some((row) => row.value === UNKNOWN_EMAIL)).toBe(false);
  });
});

function finishRequest(token: string, newPassword: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/reset-finish', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${RESET_COOKIE_NAME}=${token}`,
    },
    body: JSON.stringify({ newPassword }),
  });
}
