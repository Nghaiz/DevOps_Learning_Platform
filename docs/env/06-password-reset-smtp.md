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

The API validates and rate-limits the request before checking SMTP connectivity. A provider outage gives the same 503 response for known and unknown addresses. An accepted request does not promise delivery or disclose account existence.

Accepting a request commits one row to the `password_reset_outbox` table, and that committed row is what "accepted" means. The SMTP round-trip still happens after the response, so recipient acceptance cannot disclose account existence through response timing. A rejected recipient produces a sanitized operational error: never a code, address, or password, in logs or in the stored `last_error`. Users can retry or contact the administrator if mail does not arrive.

## Durable delivery

A drain runs immediately after the response through Next `after()`, so normal-path latency is what it was before the queue existed. A second drain sweeps every 60 seconds inside each web process. That sweep exists for one case `after()` cannot cover: the process that accepted the request died before finishing the send. Its row is still in the database, and only another process looking will find it.

Rows are claimed with `SELECT ... FOR UPDATE SKIP LOCKED`, one transaction per row, so every replica can sweep concurrently without sending a message twice. A successful send deletes the row. A failed send records a sanitized error, increments `attempts`, and backs off exponentially: attempts land at 0s, +30s, +90s, +210s, +450s, then stop at five. All five fall inside the 15-minute code lifetime, so no attempt is spent on a code that is already dead. Any row past `expires_at` is deleted without sending, including one that exhausted its attempts.

**This is not a delivery guarantee, and should not be described as one.** If every web replica is down, nothing sweeps. Rows stay in the database and are sent when a replica returns, with no promised deadline. That is the difference from the previous `after()`-only path, where an abrupt kill lost the accepted delivery outright with no record. The UI still confirms request acceptance rather than sending success. The user's next request generates another code; older codes are invalidated after a successful reset. Preserve graceful termination so in-flight work can still finish normally.

To inspect a backlog, read `attempts`, `next_attempt_at`, and `last_error` on that table. Those three columns are the intended diagnostic surface; the sweep itself logs counts only.

The `code` column holds the reset code in cleartext, unlike `verifications`, which keeps only its hash. This is a deliberate trade: retrying after a crash requires the code to outlive the process, and a code cannot be hashed because the email has to carry the plaintext. Exposure is bounded at both ends, by deleting the row the moment it is sent and purging it unsent once expired.

This change adds no environment variable. The table ships in migration `0010_equal_sunspot.sql`, which the chart's `migrate-job` Helm hook applies before web and orchestrator start; locally, run `pnpm --filter @devops-platform/web db:migrate`.

## Verification

The integration suite starts a real TCP SMTP sink on an ephemeral loopback port, creates a dedicated account in Postgres, and invokes the actual Better Auth HTTP handler. It checks delivery, hashed identifiers, expiry, code replay, password changes, session and refresh revocation, browser cookie expiry, identical known/unknown error behavior, and rejection before SMTP for malformed/throttled requests. It cleans up its own account and verification rows. It needs the same database as the existing security integration tests, but no external mail provider or Docker inbox.

A second suite covers the queue against real Postgres, because what it checks is database behavior: `SKIP LOCKED` claiming, rollback when a process dies mid-transaction, and due-time comparison. A stubbed database handle would answer each of those with the assumption under test. It runs in its own Postgres schema, built with `LIKE ... INCLUDING ALL`, so its drains cannot consume rows belonging to the suite above when vitest runs both files in parallel.

```sh
pnpm --filter @devops-platform/web exec vitest run src/server/auth/password-reset.integration.test.ts src/server/auth/password-reset-outbox.integration.test.ts src/app/reset-password/password-reset-forms.test.tsx
```
