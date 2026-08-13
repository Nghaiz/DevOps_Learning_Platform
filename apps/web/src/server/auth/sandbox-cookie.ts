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
 * `Path=/ws` thu hẹp cookie xuống ĐÚNG đường handshake: mọi request tới `/`,
 * `/api/*`, `/session` đều KHÔNG mang nó, nên một lỗ rò header ở route khác không
 * làm lộ token mở shell.
 *
 * ⚠ HỆ QUẢ CỦA `Path=/ws` MÀ 2.C PHẢI BIẾT: trình duyệt cũng không gửi cookie này
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

export function buildSandboxCookie(token: string, maxAgeSeconds: number): string {
  return [
    `${SANDBOX_COOKIE_NAME}=${token}`,
    'Path=/ws',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
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
  session: { id?: string; expiresAt?: { seconds: bigint } | undefined } | undefined,
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
  const expiresAtSeconds = Number(expiresAt.seconds);
  const token = await mintSandboxTokenFor(ownerUserId, sessionId, expiresAtSeconds);
  ctx.resHeaders.append('Set-Cookie', buildSandboxCookie(token, expiresAtSeconds - nowSeconds));
}
