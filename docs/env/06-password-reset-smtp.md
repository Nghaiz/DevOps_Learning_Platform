# Password reset email

<!-- updated 260913 -->

Password reset is implemented with SMTP and Better Auth. It uses a separate email code field: no reset credential appears in a URL. Codes last 15 minutes, are stored as hashes, and can be consumed only once. A completed reset invalidates previous codes, login sessions, and platform refresh credentials, then clears browser login cookies.

## Local inbox

Run `docker compose --profile mail up -d mailpit`. Set these values in `apps/web/.env` and restart the web process:

```dotenv
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_TLS=local
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=no-reply@devops.test
```

Open `http://localhost:8025` for the inbox. This container has no relay configuration, binds only loopback, and never forwards mail to a real recipient. Exercise `/forgot-password`, then paste the email code at `/reset-password` using a dedicated `@example.test` account.

`SMTP_TLS=local` is restricted to localhost, loopback IPs, or the Docker hostname `mailpit`, without credentials. Network SMTP providers must use `starttls` or `implicit`.

## Production SMTP

Use the SMTP submission credentials supplied by the organization's email provider. The sender must be an address approved by that provider. Keep TLS certificate verification enabled.

| Variable | Required production value |
| --- | --- |
| `SMTP_HOST` | Provider SMTP hostname |
| `SMTP_PORT` | Usually 587 for STARTTLS or 465 for implicit TLS |
| `SMTP_TLS` | `starttls` or `implicit` |
| `SMTP_USER` | SMTP username, paired with password |
| `SMTP_PASSWORD` | SMTP password or provider app password |
| `SMTP_FROM` | Verified sender email address |

Missing or invalid SMTP configuration affects password reset only. Other authentication and Docker builds remain available. There is no fallback that prints codes or credentials to logs.

Create an existing Kubernetes Secret from a protected local env file containing all six keys, using `kubectl create secret generic dlp-smtp --from-env-file=<private-file> -n <namespace>`. Set `web.env.smtpExistingSecret: dlp-smtp` in the deployment values. The chart emits explicit `secretKeyRef` entries; secrets never enter Helm values. After changing the Secret, roll out the web deployment so its environment is refreshed.

If `networkPolicy.platform.enabled` is true, also set `networkPolicy.platform.smtpEgress` to the provider's published IP ranges and submission port:

```yaml
networkPolicy:
  platform:
    smtpEgress:
      - cidr: 203.0.113.10/32 # Replace this documentation-only IP with the provider range.
        port: 587
```

The chart rejects an enabled SMTP Secret with isolated platform networking but no SMTP egress declaration. This allows SMTP only for the web pods, without widening the sandbox network policy.

## Delivery and privacy

The API validates and rate-limits the request before checking SMTP connectivity. A provider outage gives the same 503 response for known and unknown addresses. An accepted request does not promise delivery or disclose account existence. Next `after()` performs recipient-specific delivery after the response; a rejected recipient produces a sanitized operational error, never a code/address/password in logs. Users can retry or contact the administrator if mail does not arrive.

`after()` is supported by `next start`. Preserve graceful termination so in-flight work can finish. This path does not provide a durable mail queue: an abrupt process kill can lose an accepted delivery, so the UI explicitly confirms request acceptance rather than sending success. The user's next request generates another code; older codes are invalidated after a successful reset.

## Verification

The integration suite starts a real TCP SMTP sink on an ephemeral loopback port, creates a dedicated account in Postgres, and invokes the actual Better Auth HTTP handler. It checks delivery, hashed identifiers, expiry, code replay, password changes, session and refresh revocation, browser cookie expiry, identical known/unknown error behavior, and rejection before SMTP for malformed/throttled requests. It cleans up its own account and verification rows. It needs the same database as the existing security integration tests, but no external mail provider or Docker inbox.

```sh
pnpm --filter @devops-platform/web exec vitest run src/server/auth/password-reset.integration.test.ts src/app/reset-password/password-reset-forms.test.tsx
```
