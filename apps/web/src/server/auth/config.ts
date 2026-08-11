import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { jwt } from 'better-auth/plugins';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
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
