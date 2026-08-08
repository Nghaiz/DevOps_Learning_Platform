import { getAuth } from './config';
import { ACCESS_TOKEN_TTL_SECONDS, ORCHESTRATOR_AUD } from './config';
import { betterAuthUrl } from '../env';

/**
 * Phát access JWT (aud=orchestrator, TTL 15m — luật 6) cho một user đã biết danh
 * tính (đã qua `protectedProcedure` hoặc rotation refresh token thành công).
 *
 * Dùng `auth.api.signJWT` (ký trực tiếp, KHÔNG cần session/headers — khác
 * `auth.api.getToken` vốn bắt buộc session middleware) để việc phát access token
 * không phụ thuộc vào việc Better Auth session cookie còn sống hay không — đúng
 * tinh thần "refresh token TÁCH BIỆT" của luật 6/7: refresh token (auth/tokens.ts)
 * là nguồn sự thật DUY NHẤT cho việc "user này còn được cấp access token mới hay
 * không", không phải session cookie thứ hai.
 */
export async function mintAccessTokenFor(userId: string, role: string): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const result = await getAuth().api.signJWT({
    body: {
      payload: {
        sub: userId,
        role,
        aud: ORCHESTRATOR_AUD,
        iss: betterAuthUrl(),
        iat: nowSeconds,
        exp: nowSeconds + ACCESS_TOKEN_TTL_SECONDS,
      },
    },
  });

  if (result === null || result === undefined || typeof result.token !== 'string') {
    throw new Error('Better Auth signJWT không trả token hợp lệ');
  }
  return result.token;
}
