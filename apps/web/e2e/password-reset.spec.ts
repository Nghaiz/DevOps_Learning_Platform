import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { t } from '@devops-platform/copy';
import { expect, test } from './fixtures/api';
import { E2E_BASE_URL, E2E_ORIGIN } from './env';
import { openScreen } from './fixtures/nav';
import { signInThroughForm } from './flows/flow-kit';

const mailboxUrl = process.env.E2E_MAILPIT_URL;
test.use({ storageState: { cookies: [], origins: [] } });

test('password reset — request email, consume code, revoke old session and sign in', async ({
  page,
  playwright,
}) => {
  /*
    ⚠ Ô này TỰ TẮT khi thiếu `E2E_MAILPIT_URL`, and no CI job sets that variable
    (`grep E2E_MAILPIT_URL .github/workflows/ci.yml` → 0 hits; the web job runs
    `e2e:a11y` only). So this suite has never run in CI: it is a LOCAL gate, and
    a silently-skipped test reads exactly like a passing one in a summary line.

    Stated here rather than fixed, because giving CI a Mailpit sink plus a real
    Postgres is an infrastructure change, not a test change. Run it locally with
    `E2E_MAILPIT_URL` and `DATABASE_URL` set; see `docs/env/06-password-reset-smtp.md`.
  */
  test.skip(!mailboxUrl, 'Set E2E_MAILPIT_URL to the local Mailpit inbox for this SMTP flow.');
  test.setTimeout(120_000);
  expect(new URL(E2E_BASE_URL).hostname).toMatch(/^(localhost|127\.0\.0\.1|\[::1\])$/);
  expect(new URL(mailboxUrl!).hostname).toMatch(/^(localhost|127\.0\.0\.1|\[::1\])$/);
  const databaseUrl = process.env.DATABASE_URL;
  expect(
    Boolean(databaseUrl),
    'DATABASE_URL is required to clean up this disposable account.',
  ).toBe(true);
  const email = `p16-reset-${randomUUID()}@example.test`;
  const oldPassword = `Old-${randomUUID()}-aA1`;
  const newPassword = `New-${randomUUID()}-aA1`;
  const originalSession = await playwright.request.newContext({
    baseURL: E2E_BASE_URL,
    extraHTTPHeaders: { origin: E2E_ORIGIN },
  });
  const mailbox = await playwright.request.newContext({ baseURL: mailboxUrl! });
  let userId: string | undefined;
  let messageId: string | undefined;
  try {
    const signup = await originalSession.post('/api/auth/sign-up/email', {
      data: { name: 'P16 password reset browser test', email, password: oldPassword },
    });
    expect(signup.status()).toBe(200);
    const account = (await signup.json()) as { user: { id: string } };
    userId = account.user.id;
    await openScreen(page, '/forgot-password', 'anon');
    await page.getByLabel(t('auth.field.email'), { exact: true }).fill(email);
    const submit = page.getByRole('button', { name: t('auth.forgot.submit'), exact: true });
    await expect(submit).toBeEnabled();
    const delivery = page.waitForResponse((response) =>
      response.url().includes('/api/auth/request-password-reset'),
    );
    await submit.click();
    expect((await delivery).status()).toBe(200);
    await expect(page.getByRole('status')).toContainText(t('auth.forgot.success-title'));
    await expect
      .poll(
        async () => {
          const response = await mailbox.get('/api/v1/messages');
          expect(response.ok()).toBe(true);
          const data = (await response.json()) as {
            messages: { ID: string; To: { Address: string }[] }[];
          };
          messageId = data.messages.find((message) =>
            message.To.some((to) => to.Address === email),
          )?.ID;
          return Boolean(messageId);
        },
        { timeout: 30_000, message: 'SMTP must deliver the code to the dedicated local mailbox.' },
      )
      .toBe(true);
    const mail = await mailbox.get(`/api/v1/message/${messageId}`);
    expect(mail.ok()).toBe(true);
    const body = (await mail.json()) as { Text: string };
    const code = /Mã đặt lại mật khẩu:\s*([^\s]+)/u.exec(body.Text)?.[1];
    expect(Boolean(code), 'The delivered email must contain a reset code.').toBe(true);
    expect(
      body.Text.includes('/reset-password?'),
      'The reset credential must not be embedded in a URL.',
    ).toBe(false);
    await page.getByRole('link', { name: t('auth.forgot.next'), exact: true }).click();
    await expect(page).toHaveURL(`${E2E_BASE_URL}/reset-password`);
    await page.getByLabel(t('auth.reset.code'), { exact: true }).fill(code!);
    await page.getByLabel(t('auth.field.new-password'), { exact: true }).fill(newPassword);
    await page.getByLabel(t('auth.field.confirm-password'), { exact: true }).fill(newPassword);
    const reset = page.waitForResponse((response) =>
      response.url().includes('/api/auth/reset-password'),
    );
    await page.getByRole('button', { name: t('auth.reset.submit'), exact: true }).click();
    expect((await reset).status()).toBe(200);
    await expect(page.getByRole('status')).toContainText(t('auth.reset.success-title'));
    expect(new URL(page.url()).search).toBe('');
    expect(await (await originalSession.get('/api/auth/get-session')).json()).toBeNull();
    await signInThroughForm(page, email, newPassword);
    await expect(page).toHaveURL(`${E2E_BASE_URL}/me`);
  } finally {
    try {
      if (messageId) {
        const removed = await mailbox.delete('/api/v1/messages', { data: { IDs: [messageId] } });
        expect(removed.ok(), 'Only the SMTP message created by this test is removed.').toBe(true);
      }
    } finally {
      try {
        if (userId) {
          const sql = postgres(databaseUrl!, { max: 1 });
          try {
            await sql`DELETE FROM verifications WHERE value=${userId}`;
            await sql`DELETE FROM users WHERE id=${userId} AND email=${email}`;
          } finally {
            await sql.end();
          }
        }
      } finally {
        await originalSession.dispose();
        await mailbox.dispose();
      }
    }
  }
});
