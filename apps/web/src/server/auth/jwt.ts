import { getAuth } from './config';
import { ACCESS_TOKEN_TTL_SECONDS, GATEWAY_AUD, ORCHESTRATOR_AUD } from './config';
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

/**
 * Phát **sandbox token** (`aud=gateway`) — thứ duy nhất mở được `/ws/session/{id}`.
 * Đi tới trình duyệt bằng cookie httpOnly `dlp_sandbox` (luật 8), KHÔNG bao giờ
 * qua body/URL/subprotocol. SSOT của shape: `docs/ws-terminal-protocol.md` §2.
 *
 * `exp = expiresAt của session` (KHÔNG phải một TTL cố định như access token):
 * contract chốt token dùng lại được suốt vòng đời session để reconnect không phải
 * xin token mới. Hệ quả: token sống đúng bằng session, không dài hơn một giây.
 *
 * ⛔ **KHÔNG dùng `overrideOptions` dù plan G12 và contract §2 đều viết thế** —
 * đọc `node_modules/better-auth/dist/plugins/jwt/sign.mjs` (1.6.26) thì thấy hai
 * điều làm nó vừa thừa vừa nguy hiểm:
 *
 * 1. **Thừa:** `signJWT` lấy `aud`/`exp`/`iss` THẲNG từ payload —
 *    `const aud = payload.aud; … .setAudience(aud ?? defaultAud)`. Payload đã
 *    thắng `options.jwt.audience`, nên `overrideOptions` không đổi được gì mà
 *    payload chưa đổi. `mintAccessTokenFor` ở trên vốn đã đi đúng đường này.
 * 2. **Nguy hiểm:** endpoint merge NÔNG — `{...options, ...c.body.overrideOptions}`
 *    (`plugins/jwt/index.mjs`). Truyền `{jwt:{audience:'gateway'}}` là thay TRỌN
 *    khối `jwt`, tức **mất `issuer`** đang cấu hình ở `config.ts`. Ở lab nó không
 *    lộ ra vì `defaultIss` rơi về `baseURL` vốn TRÙNG `betterAuthUrl()`; ngày hai
 *    giá trị đó tách nhau (baseURL nội bộ, issuer công khai — đúng thứ
 *    `GATEWAY_TOKEN_ISSUER` tồn tại để phân biệt) thì gateway 401 toàn bộ và
 *    nguyên nhân nằm ở một tham số không ai đọc lại.
 *
 * Nói cách khác: payload là đường CÓ THẬT, `overrideOptions` là đường nghe hợp lý
 * mà không đọc mã nguồn thì không thấy nó phá cái gì.
 */
export async function mintSandboxTokenFor(
  userId: string,
  sessionId: string,
  expiresAtSeconds: number,
): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Fail-fast thay vì mint một token chết sẵn: gateway sẽ trả 401 ở bước d, và
  // triệu chứng ("terminal không mở được") nằm cách nguyên nhân ("orchestrator
  // trả expires_at quá khứ / thiếu") đúng ba thành phần — cùng họ với bẫy
  // SANDBOX_IMAGE mặc định `pause` đã trả giá ở 1.E.
  if (!Number.isInteger(expiresAtSeconds) || expiresAtSeconds <= nowSeconds) {
    throw new Error(
      `expiresAt của session không dùng được để mint sandbox token: ${expiresAtSeconds} (now=${nowSeconds})`,
    );
  }

  const result = await getAuth().api.signJWT({
    body: {
      payload: {
        sub: userId,
        sid: sessionId,
        aud: GATEWAY_AUD,
        iss: betterAuthUrl(),
        iat: nowSeconds,
        exp: expiresAtSeconds,
      },
    },
  });

  if (result === null || result === undefined || typeof result.token !== 'string') {
    throw new Error('Better Auth signJWT không trả token hợp lệ');
  }
  return result.token;
}
