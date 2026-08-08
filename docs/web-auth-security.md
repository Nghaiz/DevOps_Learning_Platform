# apps/web — auth & bảo mật (Phase 0.D)

Better Auth lo session + OAuth + RBAC; một lớp token tự viết nằm trên nó lo access
JWT ngắn hạn cho gRPC + refresh rotation. Tài liệu này là bản đồ tra cứu — cột
**File** trỏ tới code thật, đọc code khi cần chi tiết, đừng chép luật ra chỗ khác.

## Luồng cookie/token

Ba loại cookie, KHÔNG loại nào dùng chung tên/path với loại kia (cố ý — xem lý do
dưới bảng):

| Cookie | Set ở đâu | Path | TTL | Ai đọc lại |
|---|---|---|---|---|
| `better-auth.session_token` (`__Secure-...` khi prod) | Better Auth, mọi endpoint `/api/auth/*` (sign-in/sign-up/OAuth) | `/` | 7 ngày (`session.expiresIn`) | middleware (chỉ kiểm **tồn tại**, không verify) + `auth.api.getSession` (tRPC context, bootstrap refresh) |
| `refresh_token` | `POST /api/auth/refresh` (bootstrap hoặc rotate) | `/api/auth` | 7 ngày | CHỈ `POST /api/auth/refresh` và `POST /api/auth/logout` — path cố ý hẹp hơn `/` |
| `access_token` | `POST /api/auth/refresh` (set mỗi lần) | `/` | 15 phút | **Chưa ai đọc trong apps/web.** tRPC mint token MỚI mỗi lần gọi orchestrator (`session.ts` → `callHeaders`), không lấy lại từ cookie này. Cookie set sẵn write-only cho consumer Phase 1 (`terminal-gateway`, theo `plans/.../phase-1.md` luật 8: "cookie httpOnly hoặc WS subprotocol") |

Luồng thực tế:

1. Đăng nhập (password hoặc OAuth) → Better Auth set cookie session.
2. FE gọi `POST /api/auth/refresh` lần đầu, CHƯA có `refresh_token` → route bootstrap
   bằng session cookie (`auth.api.getSession`), phát `refresh_token` mới + mint
   `access_token`.
3. Các lần sau, FE mang `refresh_token` gọi lại → route **xoay** (rotate) nó, không
   cần session cookie còn sống nữa.
4. Logout: revoke `refresh_token` trong DB, xoá cả 3 cookie, forward nguyên vẹn
   `Set-Cookie` thật của `auth.api.signOut` (xem "bẫy đã gặp").

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
| 5 | Rate limit + body cap | `checkRateLimit` (bucket in-memory, 120 req/60s) + `exceedsBodyLimit` (`Content-Length`, ~1MB) — chạy TRƯỚC mọi logic khác trong middleware | `middleware.ts`, `server/security/rate-limit.ts`, `body-limit.ts` | `rule-05-rate-limit-body-cap.test.ts` |
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
