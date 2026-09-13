import { cache } from 'react';
import { headers } from 'next/headers';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { jwt } from 'better-auth/plugins';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { deleteSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import { revokeUserCredentials } from './tokens';
import {
  PASSWORD_RESET_TTL_SECONDS,
  schedulePasswordResetMail,
  verifyPasswordResetSmtp,
} from './password-reset-mail';
import { verifyPasswordResetOutbox } from './password-reset-outbox';
import {
  betterAuthSecret,
  betterAuthUrl,
  googleClientId,
  googleClientSecret,
  microsoftClientId,
  microsoftClientSecret,
} from '../env';

/** TTL access JWT (luật 6 — phase-0.md 0.D task 15): tối đa 15 phút. */
export const ACCESS_TOKEN_TTL = '15m';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * `aud` của JWT do BFF phát ra khi gọi services/orchestrator qua gRPC.
 */
export const ORCHESTRATOR_AUD = 'orchestrator';

/**
 * `aud` của **sandbox token** — token duy nhất mở được shell (cookie `dlp_sandbox`,
 * xem docs/ws-terminal-protocol.md §2 và server/auth/jwt.ts).
 *
 * ⛔ HAI HẰNG SỐ NÀY PHẢI NẰM CẠNH NHAU, và đây là lý do bản P0 nói "thêm service
 * thứ hai thì tham số hoá thay vì thêm hằng số" đã bị thay: `aud` là thứ **DUY
 * NHẤT** phân tách một token gọi gRPC với một token mở được shell (contract §2).
 * Gateway BẮT BUỘC từ chối `aud=orchestrator`; nếu không, cái token mà BFF vẫn
 * mint cho mỗi lời gọi `session.*` sẽ mở được terminal của chính user đó — và
 * chuỗi đó không đi qua bước authz nào của luật 10.
 *
 * Tham số hoá `aud` theo request (đường P0 đề xuất) chính là bỏ tính chất đó: khi
 * `aud` là biến, không còn chỗ nào trong repo khẳng định "chỉ có đúng hai giá trị,
 * và chúng phải khác nhau". Giữ hằng số, giữ chúng cạnh nhau, để lần thêm service
 * thứ ba là một sửa đổi CÓ THỂ REVIEW chứ không phải một tham số trôi qua.
 */
export const GATEWAY_AUD = 'gateway';

/**
 * Better Auth: email/password + OAuth Google/Microsoft + RBAC (`role` trên bảng
 * `users` có sẵn từ 0.C) + JWT plugin phát access token ngắn hạn.
 *
 * `schema.users` là owner DUY NHẤT của model `user` — KHÔNG để Better Auth tự sinh
 * bảng `user` thứ hai (xem chú thích ở apps/web/src/server/db/schema.ts).
 *
 * LAZY (getAuth), không phải `export const auth = betterAuth(...)`: construction
 * đọc env bắt buộc (secret, DATABASE_URL qua getDb) — ở module scope nó chạy ngay
 * trong `next build` lúc "Collecting page data" và giết build Docker (không có
 * env thật khi build image). Xem cùng lý do ở db/client.ts getDb().
 */
function buildAuth() {
  return betterAuth({
    baseURL: betterAuthUrl(),
    secret: betterAuthSecret(),
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema: {
        ...schema,
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        jwks: schema.jwks,
      },
    }),
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: true,
          defaultValue: 'user',
          input: false, // client không tự đặt role của chính nó khi đăng ký.
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_TTL_SECONDS,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        try {
          await schedulePasswordResetMail(user.email, token);
        } catch {
          throw new APIError('SERVICE_UNAVAILABLE', { code: 'RESET_DELIVERY_UNAVAILABLE' });
        }
      },
      onPasswordReset: async ({ user }) => {
        // The platform refresh cookie is independent of Better Auth sessions.
        // Revoke both and invalidate every older reset code for this account.
        await revokeUserCredentials(getDb(), user.id);
      },
    },
    verification: {
      storeIdentifier: { default: 'plain', overrides: { 'reset-password': 'hashed' } },
    },
    rateLimit: {
      customRules: {
        '/request-password-reset': { window: 60, max: 3 },
        '/reset-password': { window: 60, max: 5 },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/request-password-reset') return;
        // HTTP rate limiting and global origin middleware precede this hook.
        if (!z.object({ email: z.email() }).strict().safeParse(ctx.body).success) {
          throw new APIError('BAD_REQUEST', { code: 'INVALID_RESET_REQUEST' });
        }
        /*
          ⛔ Cả HAI phép thăm dò phải nằm ở ĐÂY, trước lượt tra cứu tài khoản.

          `sendResetPassword` chỉ chạy cho email CÓ tài khoản (better-auth trả
          200 cứng cho email không tồn tại mà không gọi nó). Nên bất kỳ nhánh
          hỏng nào chỉ ném TRONG `sendResetPassword` sẽ đẻ ra:

              email CÓ tài khoản    ⇒ 503
              email KHÔNG tài khoản ⇒ 200

          tức một kênh liệt kê tài khoản, và `forgot-password-form.tsx` phơi
          đúng khác biệt đó ra màn hình. Đặt phép thăm dò TRƯỚC lượt tra cứu làm
          mọi địa chỉ nhận cùng một câu trả lời khi hạ tầng hỏng.

          SMTP đã được cân bằng theo cách này từ trước. Hàng đợi (2026-09-13)
          thêm một nhánh hỏng thứ hai — bảng `password_reset_outbox` chưa tồn
          tại vì bản triển khai lên trước migration `0010` — và nhánh đó chưa
          ai cân bằng cho tới lượt này.
        */
        try {
          await verifyPasswordResetSmtp();
          await verifyPasswordResetOutbox(getDb());
        } catch {
          throw new APIError('SERVICE_UNAVAILABLE', { code: 'RESET_DELIVERY_UNAVAILABLE' });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/reset-password') return;
        if (!z.object({ status: z.literal(true) }).safeParse(ctx.context.returned).success) return;
        // Clear the browser as well as the database. Otherwise proxy's cookie
        // presence gate redirects the now-logged-out user between /login and /me.
        deleteSessionCookie(ctx);
        ctx.setCookie('refresh_token', '', {
          path: '/api/auth',
          maxAge: 0,
          httpOnly: true,
          sameSite: 'lax',
        });
        ctx.setCookie('access_token', '', {
          path: '/',
          maxAge: 0,
          httpOnly: true,
          sameSite: 'lax',
        });
      }),
    },
    socialProviders: {
      google: {
        clientId: googleClientId(),
        clientSecret: googleClientSecret(),
      },
      microsoft: {
        clientId: microsoftClientId(),
        clientSecret: microsoftClientSecret(),
      },
    },
    session: {
      // Cookie phiên (luật 8): httpOnly + Secure + SameSite. Better Auth tự bật Secure
      // khi NODE_ENV=production; dev qua http://localhost cố tình để Secure tắt, không
      // thì trình duyệt sẽ không gửi cookie lại và không ai đăng nhập được ở local.
      expiresIn: 60 * 60 * 24 * 7, // 7 ngày — khớp TTL refresh token (auth/tokens.ts)
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
      },
    },
    plugins: [
      jwt({
        // KHÔNG set header `set-auth-jwt` trên /get-session: token này mang
        // aud=orchestrator (credential gọi service nội bộ) — để plugin tự đính vào
        // response là trao nó cho JS phía trình duyệt, trái luật 8 ("token chỉ ở
        // httpOnly cookie") và xuyên thủng ranh giới BFF. JWT chỉ được mint server-side
        // qua auth/jwt.ts khi BFF gọi gRPC.
        disableSettingJwtHeader: true,
        jwt: {
          audience: ORCHESTRATOR_AUD,
          expirationTime: ACCESS_TOKEN_TTL,
          issuer: betterAuthUrl(),
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof buildAuth>;

let cachedAuth: Auth | null = null;

/** Singleton lazy — construction chỉ chạy ở request đầu tiên, xem chú thích trên. */
export function getAuth(): Auth {
  cachedAuth ??= buildAuth();
  return cachedAuth;
}

/**
 * Phiên đăng nhập của REQUEST hiện tại — **dedupe trong một lượt render**.
 *
 * ## Vấn đề nó gỡ
 *
 * App Router không có cách nào để `layout.tsx` con nhận prop từ `layout.tsx`
 * cha, nên mọi nhánh vừa gác auth ở layout riêng vừa cần vai trò ở vỏ ứng dụng
 * đều gọi `getSession` HAI lần cho cùng một câu trả lời — hai lượt đụng
 * Postgres mỗi request trên `/lessons`, `/labs`, `/me`, `/author`, `/admin`.
 * `app/layout.tsx` đã ghi lại đúng món nợ này bằng chữ và chỉ sang file này.
 *
 * ## Vì sao là hàm KHÔNG THAM SỐ
 *
 * `cache()` của React khoá theo **định danh của từng đối số**. Bọc thẳng
 * `getSession` rồi gọi `cached({ headers })` sẽ KHÔNG dedupe được gì: mỗi
 * call-site dựng một object literal mới, tức một khoá cache mới, mỗi lượt — đã
 * đo, xem `security/session-dedupe.test.ts` (ca `calls: 3`). Hàm zero-arg không
 * có đối số nào để lệch khoá, và nó tự lấy `headers()` — thứ vốn đã thuộc về
 * request hiện tại.
 *
 * ## ⚠ `cache()` chỉ memo hoá ở build `react-server`
 *
 * Đo 2026-09-06 (react 19.2.8): build **client** — thứ vitest, jsdom và mọi
 * Client Component nạp — có `cache()` là hàm RỖNG, gọi thẳng hàm gốc. Chỉ build
 * `react-server`, thứ Next nạp cho Server Component, mới memo thật. Nên:
 *
 * - Hàm này chỉ được gọi từ Server Component (`layout.tsx`/`page.tsx`).
 * - `server/trpc/init.ts` vẫn gọi `getSession({ headers: opts.req.headers })`
 *   thẳng, đúng: lượt tRPC là một request HTTP riêng, không có gì để dedupe
 *   cùng, và nó không chạy trong một lượt render.
 * - Một bài test chạy trong vitest sẽ đếm ra "không dedupe" — đó là phép đo
 *   sai, không phải một phát hiện.
 *
 * ⚠ Lợi ích chỉ có khi **mọi** call-site đi qua ĐÚNG hàm này. Một
 * `getAuth().api.getSession(...)` còn sót, hoặc một `cache()` thứ hai bọc lại ở
 * chỗ khác, là hai khoá khác nhau ⇒ vẫn hai lượt đụng DB — âm thầm, vì kết quả
 * vẫn đúng.
 *
 * ## Không có gì phụ thuộc một phiên "tươi" giữa request
 *
 * Đã rà: mọi call-site trong một lượt render chỉ ĐỌC (`user.id`, `user.role`,
 * `user.name`) để gác quyền hoặc vẽ vỏ. Đường GHI phiên (`signIn`/`signOut`/
 * `refresh`) là các route handler riêng, mỗi cái một request — không lượt render
 * nào vừa đổi phiên vừa đọc lại nó. Nếu một ngày có, chỗ đó phải gọi thẳng
 * `getAuth().api.getSession` và ghi rõ lý do.
 */
export const readRequestSession = cache(async () =>
  getAuth().api.getSession({ headers: await headers() }),
);
