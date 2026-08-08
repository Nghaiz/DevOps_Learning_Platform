# apps/web — auth & bảo mật (Phase 0.D)

Better Auth lo session + OAuth + RBAC; một lớp token tự viết nằm trên nó lo access
JWT ngắn hạn cho gRPC + refresh rotation. Tài liệu này là bản đồ tra cứu — cột
**File** trỏ tới code thật, đọc code khi cần chi tiết, đừng chép luật ra chỗ khác.

## Luồng cookie/token

**HAI** loại cookie, KHÔNG loại nào dùng chung tên/path với loại kia (cố ý — xem
lý do dưới bảng):

| Cookie | Set ở đâu | Path | TTL | Ai đọc lại |
|---|---|---|---|---|
| `better-auth.session_token` (`__Secure-...` khi prod) | Better Auth, mọi endpoint `/api/auth/*` (sign-in/sign-up/OAuth) | `/` | 7 ngày (`session.expiresIn`) | middleware (chỉ kiểm **tồn tại**, không verify) + `auth.api.getSession` (tRPC context, bootstrap refresh) |
| `refresh_token` | `POST /api/auth/refresh` (bootstrap hoặc rotate) | `/api/auth` | 7 ngày | CHỈ `POST /api/auth/refresh` và `POST /api/auth/logout` — path cố ý hẹp hơn `/` |

### Cookie `access_token` — ĐÃ GỠ 2026-08-08 (đóng P0, rủi ro R3)

Bản trước có cookie thứ ba: `access_token`, path `/`, TTL 15 phút, set lại mỗi lần
gọi `/api/auth/refresh`, và **không consumer nào đọc**. Nó được để lại với lý do
"chờ `terminal-gateway` ở P1 dùng". Lý do đó sai ở hai chỗ:

1. **Zero consumer từ đầu, không phải "chưa tới lúc".** `trpc/routers/session.ts`
   mint token MỚI ngay trước mỗi lần gọi orchestrator (`callHeaders`) — nó chưa
   bao giờ đọc lại cookie. Access JWT có `aud=orchestrator`: đó là credential
   **server-to-server** giữa BFF và Go service, không phải thứ trình duyệt cầm.
2. **Token P1 cần là token KHÁC.** Gateway đòi `aud=gateway` **và** `sid` buộc
   theo đúng một session, đời bằng đời session, do `session.create` phát. Một
   cookie ambient TTL-15-phút không mang được ràng buộc đó.

Nên trong lúc chờ, nó chỉ là một bearer credential nằm không trên máy user: cộng
vào bề mặt XSS/CSRF mà không đổi lại được gì. Đã gỡ khỏi `/api/auth/refresh`;
`/api/auth/logout` vẫn xoá nó (hằng `LEGACY_ACCESS_COOKIE`) cho tới khi mọi cookie
cũ hết hạn tự nhiên — bỏ dòng xoá đi nghĩa là logout để lại đúng cái credential mà
logout tồn tại để thu hồi. Thiết kế token P1: `plans/.../phase-1.md` task 12.

Luồng thực tế:

1. Đăng nhập (password hoặc OAuth) → Better Auth set cookie session.
2. FE gọi `POST /api/auth/refresh` lần đầu, CHƯA có `refresh_token` → route bootstrap
   bằng session cookie (`auth.api.getSession`), phát `refresh_token` mới.
3. Các lần sau, FE mang `refresh_token` gọi lại → route **xoay** (rotate) nó, không
   cần session cookie còn sống nữa. Route KHÔNG trả access token dưới bất kỳ hình
   thức nào (cookie lẫn body) — xem mục dưới bảng.
4. Logout: revoke `refresh_token` trong DB, xoá cookie session + refresh (+ cookie
   `access_token` cũ nếu trình duyệt còn giữ), forward nguyên vẹn `Set-Cookie`
   thật của `auth.api.signOut` (xem "bẫy đã gặp").

> Vì sao tách refresh token khỏi session cookie: luật 6/7 (RFC 6819) cần một
> nguồn sự thật DUY NHẤT cho "user còn được cấp access token hay không". Session
> cookie 7 ngày, không rotate, không có cơ chế phát hiện replay — không thể vừa
> làm session vừa làm nguồn revocation cho access token.

## Luật 1-9 → cơ chế enforce

| # | Luật (rút gọn) | Cơ chế enforce | File | Test |
|---|---|---|---|---|
| 1 | Object-level authz — chạm resource user khác → 403 | `protectedProcedure` (bắt buộc đăng nhập) + `assertOwnerOrAdmin(ctx, ownerId)` gọi đầu mỗi procedure | `server/trpc/init.ts` | `rule-01-authz.test.ts` |
| 2 | CORS allowlist — không reflect origin, không credentials+wildcard | `resolveAllowedOrigin` chỉ echo origin nằm trong `CORS_ALLOWED_ORIGINS`; danh sách rỗng = fail-closed | `server/security/cors.ts`, `server/env.ts` | `rule-02-cors.test.ts` |
| 3 | Zod strict + required, không Mongo | `.strict()` trên mọi input schema — field lạ/sai type → `BAD_REQUEST` | `server/trpc/init.ts`, mỗi router | `rule-03-strict-input.test.ts` |
| 4 | `limit` bị **ép về** ≤100, không reject | `listInputSchema` dùng chung: `.transform(v => Math.min(v, MAX_LIST_LIMIT))` | `server/trpc/init.ts` | `rule-04-list-limit.test.ts` |
| 5 | Rate limit + body cap | `checkRateLimit` (bucket in-memory, 120 req/60s theo IP) + `exceedsBodyLimit` (`Content-Length`, ~1MB) — chạy TRƯỚC mọi logic khác trong middleware. **P1**: thêm lớp PER-USER trong `protectedProcedure` — khoá `trpc:<type>:<userId>`, mutation 20/phút · query 120/phút, chặn pod-bomb (`session.create` spam) | `middleware.ts`, `server/security/rate-limit.ts`, `body-limit.ts`, `server/trpc/init.ts` | `rule-05-rate-limit-body-cap.test.ts`, `trpc-rate-limit-per-user.test.ts` |
| 6 | Access JWT: `aud` per-service + TTL ≤15m | `mintAccessTokenFor` → `auth.api.signJWT`, claim `aud=orchestrator`, `exp-iat=900` | `server/auth/jwt.ts`, `server/auth/config.ts` | `rule-06-access-token.test.ts` |
| 7 | Access token ở endpoint refresh → từ chối; refresh cũ sau rotation → từ chối | `rotateRefreshToken` = UPDATE nguyên tử (claim + revoke một câu) + `revokeDescendants` khi phát hiện replay (RFC 6819 §5.2.2.3) | `server/auth/tokens.ts`, `app/api/auth/refresh/route.ts` | `rule-07-refresh-rotation.test.ts` |
| 8 | Token không bao giờ qua URL/query | httpOnly cookie only + grep tĩnh toàn repo tìm `searchParams.get('token')` / `?token=` | mọi route set cookie + grep test | `rule-08-no-token-in-url.test.ts` |
| 9 | Security headers đầy đủ trên MỌI response | `applySecurityHeaders` set trước cả early-return (413/429/redirect/preflight cũng có đủ header) | `server/security/headers.ts`, `middleware.ts` | `rule-09-headers.test.ts` |

**Luật 10 KHÔNG nằm trong bảng trên có chủ ý:** đó là per-session authz ở tầng WS
(so `session.userId` với `token.sub` trước khi mở kết nối) — thuộc
`services/terminal-gateway`, lên lịch ở Phase 1 (`plans/.../phase-1.md`), chưa
tồn tại trong `apps/web`.

## Quyết định dễ vấp

- **`getAuth()`/`getDb()` là lazy singleton, không phải `export const`.**
  Construction đọc env bắt buộc (`BETTER_AUTH_SECRET`, `DATABASE_URL`). Nếu chạy ở
  module scope, `next build` (bước "Collecting page data") import route module và
  kích hoạt nó NGAY — không có env thật lúc build Docker image ⇒ build chết. Cache
  ở lần gọi đầu tiên (request thật), không phải lúc import.
- **`refresh_token` path=`/api/auth`, không hẹp hơn.** Set `path=/api/auth/refresh`
  thì `POST /api/auth/logout` KHÔNG BAO GIỜ nhận được cookie đó (RFC 6265
  path-match) — revoke lúc logout thành code chết, token sống hết 7 ngày dù user
  đã "logout".
- **`RATE_LIMIT_TRUST_PROXY` mặc định OFF.** `x-forwarded-for` là header client tự
  đặt được — tin bừa thì attacker xoay giá trị mỗi request để né limit; KHÔNG
  fallback về bucket chung `'unknown'` vì một client spam sẽ tự khoá toàn bộ user
  khác (self-DoS). Không có nguồn IP tin cậy ⇒ SKIP limit (cảnh báo log 1
  lần/process), giới hạn thật chuyển sang Traefik ở P3.
- **Rate limit IP (middleware) và rate limit per-user (tRPC) là HAI lớp độc lập.**
  Middleware IP SKIP hẳn khi `RATE_LIMIT_TRUST_PROXY` tắt (mục trên) — lớp
  per-user trong `protectedProcedure` (`server/trpc/init.ts`) KHÔNG bị ảnh hưởng
  bởi việc skip đó vì khoá theo `ctx.user.id` lấy từ session cookie Better Auth
  thật, không đi qua XFF. Đây là phòng thủ CHÍNH chặn pod-bomb: một user đăng
  nhập hợp lệ spam `session.create` với `userId` của chính mình (qua được luật 1)
  vẫn bị chặn ở đây khi orchestrator P1 bắt đầu sinh pod sandbox thật. Giới hạn
  còn lại: in-memory per-process như luật 5 gốc — nhiều pod web = nhiều bucket
  riêng, hạn mức thật ở nhiều-instance rộng hơn con số khai báo; hướng chặt hơn là
  Redis dùng chung (đã có `ioredis` + `packages/shared-types/src/redis-keys.ts`),
  chưa implement (YAGNI, ngoài phạm vi hiện tại).
- **`disableSettingJwtHeader: true`.** JWT plugin của Better Auth mặc định tự đính
  access token vào header `set-auth-jwt` của `/get-session` — tức trao token
  thẳng cho JS phía trình duyệt. Access JWT ở đây mang quyền gọi gRPC nội bộ
  (`aud=orchestrator`), phải chỉ tồn tại server-side (luật 8); tắt cờ này để JWT
  CHỈ được mint qua `auth/jwt.ts` khi BFF tự gọi orchestrator.

## Bẫy đã gặp

- **`ResponseCookies` nuốt mất `Set-Cookie` append đứng TRƯỚC nó.** API
  `response.cookies.delete()/.set()` của Next serialize lại TOÀN BỘ header
  `set-cookie` từ map nội bộ ở mỗi lần gọi. `headers.append('set-cookie', raw)`
  (forward Set-Cookie thật từ `auth.api.signOut`) chạy TRƯỚC các `.delete()` sẽ bị
  lần serialize đó ghi đè mất — session cookie không bị xoá, logout thành vòng lặp
  redirect `/login` ↔ `/dashboard`. Thứ tự đúng: `.delete()`/`.set()` trước,
  `headers.append('set-cookie', ...)` sau (`app/api/auth/logout/route.ts`).
- **Cookie prefix `__Secure-` cần `secure: true` khi xoá.** Khi `signOut` không trả
  `Set-Cookie` nào (session đã hết hạn/lỗi vận chuyển), fallback tự xoá cookie
  session theo tên convention Better Auth. Ở production tên đó là
  `__Secure-better-auth.session_token` — spec cookie prefix bắt trình duyệt VỨT mọi
  `Set-Cookie __Secure-*` thiếu `Secure`, nên `.delete()` trần (thiếu
  `secure: true`) no-op ÂM THẦM đúng ở môi trường cần nó nhất
  (`app/api/auth/logout/route.ts`).
