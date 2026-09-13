import nodemailer from 'nodemailer';
import { AsyncLocalStorage } from 'node:async_hooks';
import { after } from 'next/server';
import { z } from 'zod';
import { t } from '@devops-platform/copy';
import { getDb } from '../db/client';
import { betterAuthUrl } from '../env';
import {
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
        await deliverQueuedPasswordResetMail();
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
  else await deliverQueuedPasswordResetMail();
}

/** The production-wired drain: this app's database, this module's SMTP sender. */
export async function deliverQueuedPasswordResetMail(): Promise<PasswordResetDrainResult> {
  return drainPasswordResetOutbox({ db: getDb(), send: sendPasswordResetMail });
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

/** Check provider connectivity before account lookup; outages affect every email equally. */
export async function verifyPasswordResetSmtp(): Promise<void> {
  const transport = smtpTransport(passwordResetSmtpConfig());
  try {
    await transport.verify();
  } catch {
    throw new Error('Password reset SMTP provider is unavailable.');
  } finally {
    transport.close();
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
