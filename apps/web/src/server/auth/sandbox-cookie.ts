import { TRPCError } from '@trpc/server';
import { mintSandboxTokenFor } from './jwt';

/**
 * Cookie `dlp_sandbox` — SSOT: `docs/ws-terminal-protocol.md` §2.
 *
 * Tách khỏi `trpc/routers/session.ts` ở P2 vì đã có NGƯỜI GỌI THỨ HAI:
 * `lessons.startSession` cũng tạo session (với tier suy từ scenario) và cũng
 * phải phát đúng cookie đó. Chép lại logic sang router thứ hai là dựng hai nơi
 * quyết định `Path`/`Max-Age`/`Secure`, và chúng sẽ lệch nhau ở lần đầu tiên có
 * người sửa một bên.
 *
 * Path theo phiên (xem `sandboxCookiePaths`) thu hẹp cookie xuống ĐÚNG đường handshake: mọi request tới `/`,
 * `/api/*`, `/session` đều KHÔNG mang nó, nên một lỗ rò header ở route khác không
 * làm lộ token mở shell.
 *
 * ⚠ HỆ QUẢ CỦA PATH HẸP MÀ 2.C PHẢI BIẾT: trình duyệt cũng không gửi cookie này
 * tới `/exec/session/{id}` của gateway. Nên `checkStep` KHÔNG thể forward cookie
 * của người dùng — BFF phải tự mint một token server-side. Xem
 * `server/lessons/validate.ts`.
 *
 * `Secure` KHÔNG rẽ nhánh theo NODE_ENV: `.env.example` đã chốt điều này và ghi
 * kèm bẫy của nó — trình duyệt chấp nhận cookie `Secure` trên HTTP khi host là
 * `localhost` (secure context), nên dev qua `http://localhost:8080` chạy bình
 * thường; đổi sang `http://192.168.x.x:8080` thì Set-Cookie bị **bỏ qua trong im
 * lặng** và mọi handshake trả 401 mà không thông báo gì. Một nhánh `NODE_ENV` ở
 * đây sẽ giấu đúng lớp phòng thủ đó ở lần deploy đầu tiên mà ai đó quên đặt biến.
 *
 * KHÔNG có `Domain` ⇒ host-only, và cùng với `SameSite=Strict` đó là thứ ép
 * gateway phải CÙNG ORIGIN với web (D1) — điều kiện đã dựng sẵn ở 1.B0.4.
 */
export const SANDBOX_COOKIE_NAME = 'dlp_sandbox';

/**
 * D8 (phase-13) — HAI đường mang cookie này: `/ws/session/<id>` (WS terminal) và
 * `/ide/session/<id>` (iframe Theia). `Set-Cookie` phân biệt theo CẶP
 * `(name, path)`, nên các cookie CÙNG TÊN khác `Path` sống độc lập trong trình
 * duyệt — và trình duyệt tự chọn cookie theo path của request.
 *
 * D7.1 (labs rebuild) — path THEO TỪNG PHIÊN, không còn `/ws` và `/ide` trơn.
 * Bản cũ dùng chung một `(name, path)` cho mọi phiên, nên mở phiên thứ hai ở tab
 * khác GHI ĐÈ cookie của phiên thứ nhất: mọi lượt nối lại WS / tải lại IDE của
 * tab cũ mang token sai `sid` và gateway trả 403. Path riêng từng phiên làm hai
 * cookie không bao giờ trùng cặp `(name, path)`.
 *
 * Cookie `Path=/ws`, `Path=/ide` mà bản cũ đã phát vẫn sống tới hết `Max-Age`
 * và vẫn được gửi kèm; gateway chọn cookie theo `sid` chứ không theo vị trí
 * (`sessionauth.pickToken`), nên chúng vô hại và tự rụng. KHÔNG chủ động xoá
 * chúng ở đây: cookie rộng đó có thể là chìa DUY NHẤT của một phiên tạo trước
 * bản này, đang mở ở tab khác.
 *
 * Path ghép bằng `encodeURIComponent` — ĐÚNG phép biến đổi mà FE dùng khi dựng
 * URL (`packages/terminal` connection, `ideSessionUrl`). So khớp path cookie là
 * so chuỗi trên path đã mã hoá, nên hai bên phải mã hoá giống hệt; và nó cũng
 * chặn `;`/xuống dòng trong id lọt vào header `Set-Cookie`.
 *
 * ⛔ TUYỆT ĐỐI không gộp thành MỘT cookie `Path=/`: token mở được shell sẽ tới cả
 * `/`, `/api/*`, `/session`, mở rộng bề mặt rò header cho mọi route tương lai.
 */
const SANDBOX_COOKIE_PATH_PREFIXES = ['/ws/session/', '/ide/session/'] as const;

export function sandboxCookiePaths(sessionId: string): string[] {
  const segment = encodeURIComponent(sessionId);
  return SANDBOX_COOKIE_PATH_PREFIXES.map((prefix) => `${prefix}${segment}`);
}

export function buildSandboxCookie(token: string, maxAgeSeconds: number, path: string): string {
  return [
    `${SANDBOX_COOKIE_NAME}=${token}`,
    `Path=${path}`,
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}

/**
 * D7.1 — mốc hết hạn của token VÀ cookie = TRẦN CỨNG của phiên (`hardCapAt` =
 * createdAt + HARD_CAP, orchestrator tính lúc đọc), không phải `expiresAt` lúc mint.
 *
 * `expiresAt` lúc tạo chỉ là hạn tới heartbeat đầu (≈ SESSION_TTL). Gateway đẩy nó
 * trong Redis tới tận trần cứng mỗi khi có hoạt động, nhưng không ai mint lại
 * token — nên `exp = expiresAt` làm mọi lượt nối lại WS / tải lại IDE trả 401 từ
 * khoảng phút 60 trong khi phiên vẫn sống. Token sống tới trần cứng không mở thêm
 * quyền nào: gateway đọc Redis ở MỌI request (bước f–h), phiên chết là 404/409
 * bất kể `exp`.
 *
 * `max(hardCapAt, expiresAt)`: claim xảy ra SAU create, nên phiên tạo với
 * `ttl = HARD_CAP` có `expiresAt` vượt `hardCapAt` vài giây — token phải sống ít
 * nhất bằng phiên.
 *
 * Orchestrator đời cũ (trước field `hard_cap_at`) không trả mốc này ⇒ giữ hành vi
 * cũ (`expiresAt`) và CẢNH BÁO, thay vì làm hỏng việc tạo phiên trong lúc rollout.
 */
function sandboxLifetimeEnd(
  sessionId: string,
  expiresAt: { seconds: bigint },
  hardCapAt: { seconds: bigint } | undefined,
): number {
  const expiresAtSeconds = Number(expiresAt.seconds);
  if (hardCapAt === undefined) {
    console.warn('[sandbox-cookie] orchestrator không trả hardCapAt — token sống theo expiresAt lúc mint', {
      sessionId,
    });
    return expiresAtSeconds;
  }
  return Math.max(Number(hardCapAt.seconds), expiresAtSeconds);
}

/**
 * Mint sandbox token cho session vừa tạo và gắn `Set-Cookie` vào response.
 *
 * **Chỉ mint khi người gọi tạo session CHO CHÍNH MÌNH.** `assertOwnerOrAdmin` cho
 * admin tạo session hộ user khác, và ở nhánh đó cả hai lựa chọn đều sai:
 * `sub=ctx.user.id` sinh ra cookie chết sẵn (gateway bước g so `hash.userId` với
 * `token.sub` → 403) mà lại ĐÈ MẤT cookie session của chính admin; `sub=input.userId`
 * thì phát cho trình duyệt admin một chìa mở thẳng shell của user kia — một quyền
 * KHÁC HẲN quyền "tạo session hộ", và không đi qua bước authz nào của luật 10.
 * Nên: admin tạo hộ thì session vẫn được tạo, cookie thì không. Chủ nhân thật sự
 * mở `/session` của mình và nhận cookie ở lượt create của chính họ.
 *
 * Thiếu `session`/`expiresAt` ⇒ NÉM, không bỏ qua im lặng: đó là vi phạm contract
 * của orchestrator, và một cookie vắng mặt sẽ hiện ra ở tận trình duyệt dưới dạng
 * "401 khi mở terminal" — cách nguyên nhân ba thành phần. Ném ở đây KHÔNG rò pod:
 * `idempotencyKey` là bắt buộc ở mọi call-site, nên lượt retry trả về ĐÚNG
 * session cũ thay vì claim thêm một pod nữa khỏi trần quota 4.
 */
export async function attachSandboxCookie(
  ctx: { user: { id: string }; resHeaders: Headers },
  ownerUserId: string,
  session:
    | {
        id?: string;
        expiresAt?: { seconds: bigint } | undefined;
        hardCapAt?: { seconds: bigint } | undefined;
      }
    | undefined,
): Promise<void> {
  if (ctx.user.id !== ownerUserId) {
    return;
  }
  const sessionId = session?.id;
  const expiresAt = session?.expiresAt;
  if (sessionId === undefined || sessionId === '' || expiresAt === undefined) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message:
        'orchestrator trả session thiếu id/expires_at — không mint được sandbox token (contract proto/orchestrator/v1)',
    });
  }

  // Một mốc `now` duy nhất cho cả hai phép tính: mint kiểm `exp > now` rồi cookie
  // tính `Max-Age = exp - now`. Đọc đồng hồ hai lần thì hai con số lệch nhau vài
  // ms, và đúng ở biên (`exp == now + 1`) sinh ra `Max-Age=0` — cookie bị xoá ngay
  // khi vừa đặt, trong khi token thì hợp lệ. Một lần đọc, không có cửa sổ đó.
  const nowSeconds = Math.floor(Date.now() / 1000);
  const lifetimeEnd = sandboxLifetimeEnd(sessionId, expiresAt, session?.hardCapAt);
  const token = await mintSandboxTokenFor(ownerUserId, sessionId, lifetimeEnd);
  const maxAge = lifetimeEnd - nowSeconds;
  for (const path of sandboxCookiePaths(sessionId)) {
    ctx.resHeaders.append('Set-Cookie', buildSandboxCookie(token, maxAge, path));
  }
}
