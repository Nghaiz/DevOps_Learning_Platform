import { createServer, type Server, type Socket } from 'node:net';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import type * as NextServer from 'next/server';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../../app/api/auth/[...all]/route';
import { getAuth } from './config';
import { issueRefreshToken, rotateRefreshToken } from './tokens';
import { passwordResetSmtpConfig, sendPasswordResetMail } from './password-reset-mail';
import { passwordResetOutbox, sessions, users, verifications } from '../db/schema';
import { testDb, closeTestDb } from '../../security/test-helpers';

const background = vi.hoisted(() => ({ tasks: [] as Array<() => Promise<void>> }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof NextServer>()),
  // Direct Route Handler tests do not have Next's request lifecycle. Retain its
  // after-response boundary while exercising the actual SMTP callback below.
  after: (task: () => Promise<void>) => {
    background.tasks.push(task);
  },
}));

/** Real SMTP socket + Postgres + Better Auth HTTP handler, with no email mocks. */
describe('password reset delivery and credential lifecycle', () => {
  const email = `reset-${randomUUID()}@example.test`;
  const initialPassword = `Before-${randomUUID()}`;
  const nextPassword = `After-${randomUUID()}`;
  const messages: string[] = [];
  const sockets = new Set<Socket>();
  let server: Server;
  let userId = '';
  let origin = '';
  let rejectMail = false;
  let unavailable = false;
  let connections = 0;
  let signedInCookies = '';

  async function request(path: string, body: unknown, extraHeaders: Record<string, string> = {}) {
    const response = await POST(
      new Request(`${origin}/api/auth/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, ...extraHeaders },
        body: JSON.stringify(body),
      }),
    );
    await Promise.all(background.tasks.splice(0).map((task) => task()));
    return response;
  }

  function lastCode(): string {
    const message = messages.at(-1)?.replace(/=\r\n/g, '') ?? '';
    const match = /: ([a-zA-Z0-9]{24})\r?\n/.exec(message);
    expect(match, 'SMTP body must contain the actual reset code').not.toBeNull();
    return match![1]!;
  }

  beforeAll(async () => {
    server = createServer((socket) => {
      connections += 1;
      if (unavailable) {
        socket.end('421 SMTP unavailable\r\n');
        return;
      }
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      let buffer = '';
      let data = false;
      let message = '';
      socket.setEncoding('utf8');
      socket.write('220 localhost test sink\r\n');
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        let end: number;
        while ((end = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (data) {
            if (line === '.') {
              messages.push(message);
              message = '';
              data = false;
              socket.write('250 queued\r\n');
            } else message += `${line}\r\n`;
          } else if (/^EHLO|^HELO/.test(line)) socket.write('250 localhost\r\n');
          else if (/^RCPT/.test(line) && rejectMail) socket.write('550 delivery unavailable\r\n');
          else if (line === 'DATA') {
            data = true;
            socket.write('354 End with dot\r\n');
          } else if (line === 'QUIT') socket.end('221 bye\r\n');
          else socket.write('250 OK\r\n');
        }
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('No SMTP test port');
    vi.stubEnv('SMTP_HOST', '127.0.0.1');
    vi.stubEnv('SMTP_PORT', String(address.port));
    vi.stubEnv('SMTP_TLS', 'local');
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASSWORD', '');
    vi.stubEnv('SMTP_FROM', 'no-reply@example.test');
    origin = new URL(process.env['BETTER_AUTH_URL']!).origin;
    const response = await request('sign-up/email', {
      email,
      password: initialPassword,
      name: 'Reset Test',
    });
    expect(response.status).toBe(200);
    signedInCookies = response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
    const body = (await response.json()) as { user: { id: string } };
    userId = body.user.id;
  });

  afterAll(async () => {
    // The recipient-rejection case leaves a failed outbox row behind on purpose:
    // it is backing off, not finished. Left in place it would hold this account's
    // plaintext code in the shared development database until something drained it.
    await testDb().delete(passwordResetOutbox).where(eq(passwordResetOutbox.email, email));
    if (userId) {
      await testDb().delete(verifications).where(eq(verifications.value, userId));
      await testDb().delete(users).where(eq(users.id, userId));
    }
    await closeTestDb();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.unstubAllEnvs();
  });

  it('delivers a code over SMTP, stores only its hash, revokes sessions and refresh cookies', async () => {
    const refresh = await issueRefreshToken(testDb(), userId);
    expect((await request('request-password-reset', { email })).status).toBe(200);
    const earlierCode = lastCode();
    expect((await request('request-password-reset', { email })).status).toBe(200);
    const code = lastCode();
    expect(code).not.toBe(earlierCode);
    expect(messages.at(-1)).toContain(`${origin}/reset-password`);
    expect(messages.at(-1)).not.toContain(`/reset-password/${code}`);
    const records = await testDb()
      .select()
      .from(verifications)
      .where(eq(verifications.value, userId));
    expect(records).toHaveLength(2);
    for (const row of records) {
      expect(row.identifier).not.toContain(code);
      expect(row.identifier).not.toContain(earlierCode);
      expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
      expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000);
    }
    const reset = await request(
      'reset-password',
      { newPassword: nextPassword, token: code },
      {
        cookie: `${signedInCookies}; refresh_token=${refresh.raw}`,
      },
    );
    expect(reset.status).toBe(200);
    const clearedCookies = reset.headers.getSetCookie();
    const context = await getAuth().$context;
    expect(
      clearedCookies.some(
        (cookie) =>
          cookie.startsWith(`${context.authCookies.sessionToken.name}=`) &&
          /Max-Age=0/i.test(cookie),
      ),
    ).toBe(true);
    expect(
      clearedCookies.some(
        (cookie) =>
          cookie.startsWith('refresh_token=') &&
          /Max-Age=0/i.test(cookie) &&
          /Path=\/api\/auth/i.test(cookie),
      ),
    ).toBe(true);
    expect(await testDb().select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(
      0,
    );
    expect(await rotateRefreshToken(testDb(), refresh.raw)).toEqual({
      ok: false,
      reason: 'revoked',
    });
    for (const used of [code, earlierCode]) {
      expect(
        (await request('reset-password', { newPassword: initialPassword, token: used })).status,
      ).toBe(400);
    }
    expect((await request('sign-in/email', { email, password: initialPassword })).status).toBe(401);
    expect((await request('sign-in/email', { email, password: nextPassword })).status).toBe(200);
  });

  it('rejects an expired code without changing the password', async () => {
    expect((await request('request-password-reset', { email })).status).toBe(200);
    const code = lastCode();
    await testDb()
      .update(verifications)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(verifications.value, userId));
    expect(
      (await request('reset-password', { newPassword: initialPassword, token: code })).status,
    ).toBe(400);
    expect((await request('sign-in/email', { email, password: nextPassword })).status).toBe(200);
  });

  it('keeps unknown-account responses identical without sending mail', async () => {
    const known = await request('request-password-reset', { email });
    const count = messages.length;
    const unknown = await request('request-password-reset', {
      email: `missing-${randomUUID()}@example.test`,
    });
    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(messages).toHaveLength(count);
  });

  it('keeps recipient rejection private and reports provider outages equally for every account', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rejectMail = true;
    const response = await request('request-password-reset', { email });
    const absent = await request('request-password-reset', { email: 'missing@example.test' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(await absent.json());
    expect(log).toHaveBeenCalledWith(
      '[auth] Password reset email delivery failed; inspect SMTP provider health.',
    );
    log.mockRestore();
    rejectMail = false;
    unavailable = true;
    for (const address of [email, 'missing@example.test']) {
      const failure = await request('request-password-reset', { email: address });
      expect(failure.status).toBe(503);
      expect(await failure.json()).toEqual({ code: 'RESET_DELIVERY_UNAVAILABLE' });
    }
    unavailable = false;
    vi.stubEnv('SMTP_USER', 'private-user');
    vi.stubEnv('SMTP_PASSWORD', 'private-password');
    expect(() => passwordResetSmtpConfig()).toThrow('Plain SMTP is restricted');
    await expect(sendPasswordResetMail(email, 'example-code')).rejects.not.toThrow(
      'private-password',
    );
    const unknown = await request('request-password-reset', { email: 'missing@example.test' });
    expect(unknown.status).toBe(503);
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASSWORD', '');
  });

  it('blocks the framework URL-token alternatives and configures focused rate limits', async () => {
    const callback = await GET(new Request(`${origin}/api/auth/reset-password/example-code`));
    expect(callback.status).toBe(404);
    const url = new URL(`${origin}/api/auth/reset-password`);
    url.searchParams.set('token', 'example-code');
    const response = await POST(
      new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({ newPassword: nextPassword }),
      }),
    );
    expect(response.status).toBe(400);
    const context = await getAuth().$context;
    expect(context.options.rateLimit?.customRules).toMatchObject({
      '/request-password-reset': { window: 60, max: 3 },
      '/reset-password': { window: 60, max: 5 },
    });
  });

  it('rejects malformed and rate-limited requests before opening an SMTP connection', async () => {
    const before = connections;
    expect((await request('request-password-reset', { email: 'invalid' })).status).toBe(400);
    expect(
      (await request('request-password-reset', { email, redirectTo: '/unexpected' })).status,
    ).toBe(400);
    expect(connections).toBe(before);
    const context = await getAuth().$context;
    const previous = context.rateLimit.enabled;
    context.rateLimit.enabled = true;
    try {
      const headers = { 'x-forwarded-for': '198.51.100.211' };
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect(
          (await request('request-password-reset', { email: 'absent@example.test' }, headers))
            .status,
        ).toBe(200);
      }
      const connected = connections;
      expect(
        (await request('request-password-reset', { email: 'absent@example.test' }, headers)).status,
      ).toBe(429);
      expect(connections).toBe(connected);
    } finally {
      context.rateLimit.enabled = previous;
    }
  });
});
