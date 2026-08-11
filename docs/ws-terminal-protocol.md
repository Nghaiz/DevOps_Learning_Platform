# WS Terminal Protocol `dlp.terminal.v1` — contract SSOT

**Chốt:** 2026-08-09 · **Bên server:** `services/terminal-gateway` · **Bên client:** `packages/terminal`

> Đây là SSOT. Hai lane implement phải nhúng nguyên văn file này vào brief, không lane nào tự chế shape
> (`rules/contract-first-integration.md`). Sửa file này = sửa contract = phải báo cả hai lane.
>
> Lý do có file riêng thay vì để trong `phase-1.md`: typecheck của từng bên không bao giờ bắt được lệch
> contract — mỗi bên tự nhất quán, chỉ runtime mới lộ.

## 0. Tên và version

- **Subprotocol: `dlp.terminal.v1`.** Client BẮT BUỘC chào trong `Sec-WebSocket-Protocol`; server echo lại đúng một giá trị. Không khớp → **không upgrade** (400).
- Version nằm ở subprotocol, KHÔNG ở field `v` trong từng message. Lệch version thì hỏng ngay ở handshake với lỗi rõ ràng, thay vì hỏng ở frame thứ 500 với một `type` lạ.

## 1. Phân biệt data và control — dùng WS opcode

| Hướng | Opcode | Nội dung |
|---|---|---|
| Client → Server | **Binary** | Byte thô stdin (người dùng gõ / dán) |
| Client → Server | **Text** | Control message, JSON UTF-8 |
| Server → Client | **Binary** | Byte thô stdout PTY (đã gộp stderr vì `TTY: true`) |
| Server → Client | **Text** | Control message, JSON UTF-8 |

**Không dùng prefix byte** kiểu `v5.channel.k8s.io`: WS đã cho sẵn discriminator miễn phí là opcode; prefix byte bắt cả hai đầu copy/cấp phát lại mỗi frame trên đường nóng, mà `fastfetch`/`eza --icons` đẩy hàng trăm KB ANSI mỗi lần chạy.

**Không bọc JSON+base64 tất cả:** +33% băng thông và một vòng encode/decode mỗi chunk, đổi lấy đúng thứ opcode đã cho không.

**Không proxy thẳng framing của k8s ra trình duyệt:** rò protocol nội bộ ra FE, khoá FE vào lựa chọn transport phía server, và JSON resize của k8s dùng `Width`/`Height` PascalCase — lạc lõng với toàn repo.

### Hai bẫy phía client (gây lỗi nhiều nhất, ghi vào brief FE)

1. `term.onData(d => …)` trả **string** → phải `ws.send(new TextEncoder().encode(d))` để ra **binary frame**. Gửi thẳng string thành text frame và server sẽ từ chối như control JSON hỏng.
2. Đặt `ws.binaryType = 'arraybuffer'` rồi `term.write(new Uint8Array(ev.data))`. **KHÔNG** `TextDecoder().decode()` trước khi ghi: một glyph Nerd Font (3–4 byte UTF-8) bị cắt qua ranh giới hai frame sẽ thành ký tự hỏng. `xterm.js` nhận `Uint8Array` và tự ghép byte dở dang.

## 2. Transport của token — cookie httpOnly

**Cookie `dlp_sandbox`**, thuộc tính `Secure; HttpOnly; SameSite=Strict; Path=/ws; Max-Age=<còn lại của session>`, không `Domain` (host-only).

Lý do chọn cookie thay vì subprotocol:

1. Subprotocol buộc trao JWT thô cho JS trình duyệt (`new WebSocket(url, protocols)` nhận string từ JS). P0 **đã cố ý từ chối đúng việc đó**: `apps/web/src/server/auth/config.ts` đặt `disableSettingJwtHeader: true` với lý do "trao nó cho JS phía trình duyệt là trái luật 8".
2. XSS ăn cắp được token subprotocol; không ăn cắp được cookie httpOnly. Điểm yếu đối ứng của cookie là CSWSH, nhưng CSWSH **đóng hoàn toàn ở server** bằng allowlist `Origin` — thứ phải làm sẵn dù chọn gì (handshake WS không chịu CORS). XSS thì không đóng được ở server.
3. Luật 8 nói "token chỉ trong httpOnly cookie / POST body". Chỉ cookie thoả nguyên văn.

**Token dùng lại được trong TTL** — `exp` = `expires_at` của session, không one-time-use. Reconnect không cần xin token mới.

### Khoá ký và cách gateway verify — KHÔNG sinh khoá mới

Sandbox token ký bằng **chính khoá của plugin `jwt()` Better Auth** đang dùng cho `aud=orchestrator`, chỉ khác `aud`. Xác minh trong `node_modules` (better-auth 1.6.26): plugin phơi endpoint **`GET /api/auth/jwks`**, thuật toán mặc định **EdDSA / Ed25519**, và đổi `aud` cho từng lần mint là một tham số, không phải một khoá thứ hai.

> **⛔ Đính chính 2026-08-11 (G12), sau khi đọc mã nguồn thay vì suy luận.** Bản trước ghi cơ chế đổi `aud` là **`overrideOptions`**. Sai ở cả hai vế:
>
> 1. **Thừa.** `dist/plugins/jwt/sign.mjs` lấy `aud`/`exp`/`iss` **thẳng từ payload** — `const aud = payload.aud; … .setAudience(aud ?? defaultAud)`. Payload đã thắng `options.jwt.audience`, nên đặt `aud` trong payload là đủ (và `mintAccessTokenFor` vốn đã làm đúng thế từ P0).
> 2. **Có hại.** Endpoint merge **NÔNG**: `{...options, ...c.body.overrideOptions}` (`dist/plugins/jwt/index.mjs`). Truyền `{jwt:{audience:'gateway'}}` thay TRỌN khối `jwt` ⇒ **mất `issuer`** đang cấu hình, và `iss` lặng lẽ rơi về `baseURL`. Ở lab hai giá trị đó trùng nhau nên không lộ; ngày chúng tách (JWKS là DNS nội bộ, `iss` là URL công khai — chính lý do `GATEWAY_TOKEN_ISSUER` tồn tại) thì gateway **401 toàn bộ**.
>
> Implement đúng: đặt `{sub, sid, aud, iss, iat, exp}` trong `payload`, **không** `overrideOptions`. Xem `apps/web/src/server/auth/jwt.ts`.

- **Mint (`apps/web`):** `mintSandboxTokenFor(userId, sessionId, expiresAt)` → payload `{ sub, sid, aud: "gateway", iss, iat, exp }`.
- **Verify (gateway):** fetch `GATEWAY_JWKS_URL` (Service in-cluster của web), cache theo `kid`, **refetch khi gặp `kid` lạ** — đó là cách duy nhất chịu được rotation của Better Auth mà không cần deploy lại gateway. Ép `alg == EdDSA` (đừng chấp nhận `alg` từ header token), `aud == "gateway"`, `iss` khớp, `exp` chưa qua, `sub`/`sid` không rỗng.
- **Khoá riêng bị loại có chủ ý:** nó đẻ ra 3 biến env × 4 nơi (`rules` G11), một Helm secret, và một quy trình xoay vòng thủ công — đúng thứ D13 tuyên bố tránh. JWKS cho rotation miễn phí.

`aud` là thứ **duy nhất** phân tách hai loại token. Gateway **phải** từ chối `aud=orchestrator` (loại mà BFF đang mint cho gRPC) — nếu không, một token gọi orchestrator sẽ mở được shell.

### Hệ quả topology (BẮT BUỘC, lane infra phải làm)

`SameSite=Strict` + không `Domain` ⇒ **gateway phải cùng origin với `apps/web`**. Nếu web ở `app.example.com` còn gateway ở `gw.example.com` thì trình duyệt không gửi cookie và thiết kế này chết.

- **Prod:** Ingress route `/ws/*` → Service gateway, **cùng origin** với web.
- **Dev:** Next ở `:3000`, gateway ở `:8082` là hai origin ⇒ cần reverse proxy (Caddy/Traefik trong `docker-compose.yml`) gộp một origin. Phải dựng **trước** khi lane FE code, nếu không FE viết xong mới phát hiện cookie không bao giờ được gửi.

## 3. Thứ tự handshake

```
1. C→S  GET /ws/session/{id}
        Upgrade: websocket
        Sec-WebSocket-Protocol: dlp.terminal.v1
        Cookie: dlp_sandbox=<jwt>
        Origin: https://app.example.com

2. S    Kiểm TRƯỚC KHI upgrade, đúng thứ tự, dừng ở lỗi đầu tiên:
        a. Origin: có header  → phải ∈ allowlist  → sai: 403
                   vắng      → CHO QUA (xem dưới)
        b. subprotocol có dlp.terminal.v1 → sai: 400
        c. cookie tồn tại                 → sai: 401
        d. JWT hợp lệ (sig/aud/exp/iss)   → sai: 401
        e. token.sid == {id}              → sai: 403
        f. Redis session:{id} tồn tại     → sai: 404
        g. hash.userId == token.sub       → sai: 403
        h. status ∈ {CLAIMED, RUNNING}    → sai: 409
        i. session:{id}:ws < trần (=1)    → sai: 429

3. S→C  101 Switching Protocols
        Sec-WebSocket-Protocol: dlp.terminal.v1

4. C→S  {"type":"init","cols":120,"rows":34}   ← BẮT BUỘC frame đầu tiên
5. S    dial exec vào pod với đúng cols/rows   (init không tới trong 3s → 80×24)
6. S→C  {"type":"ready", …}                    ← frame đầu tiên server gửi
7. ↔    binary tự do, control message tuỳ lúc
```

### 3a. Bước a — vắng `Origin` thì CHO QUA (quyết định, không phải sơ suất)

Trình duyệt **luôn** gửi `Origin` trên handshake WS; không có cách nào tắt từ JS. Nên CSWSH — thứ duy nhất bước a tồn tại để chặn — vẫn đóng kín dù ta cho qua request vắng `Origin`. Fail-closed ở đây không mua thêm bảo mật nào, mà lại chặn mọi client không-trình-duyệt: `wscat`, `websocat`, test e2e trong CI, và probe vận hành. Cả bộ acceptance IDOR ở `phase-1.md` chạy bằng `wscat`, vốn không gửi `Origin` trừ khi thêm `--origin`.

Bước a vì thế đọc là: *"có `Origin` thì phải đúng"*, không phải *"phải có `Origin`"*. Authz thật nằm ở bước d–g và không phụ thuộc `Origin` ở bất kỳ đâu.

### 3b. Khi nào 404 THẬT SỰ xảy ra (đọc kỹ trước khi viết test)

Bước **e** (`token.sid == {id}`) chạy **trước** bước **f** (Redis tồn tại). Hệ quả:

- **Đoán bừa một `{id}` → 403 ở bước e**, KHÔNG phải 404. Token của user chỉ mang đúng một `sid`, nên mọi `{id}` khác `sid` đều chết ở e.
- **404 chỉ tới được khi `token.sid == {id}` nhưng Redis không còn key** — nghĩa là "session của CHÍNH BẠN đã biến mất" (đã reap, TTL hết, hoặc Redis mất dữ liệu).

Đây là tính chất **tốt**: kẻ tấn công không bao giờ phân biệt được "id không tồn tại" với "id tồn tại nhưng của người khác" — cả hai đều 403 ở cùng một bước, cùng một đường code, nên không có kênh phụ thời gian để dò. Đừng "sửa" thứ tự này cho 404 dễ gặp hơn.

### 3c. Một session = một WS đang mở (trần `i` = 1)

`GATEWAY_MAX_WS_PER_SESSION=1`. Lý do là hành vi đo được của tmux, không phải giới hạn tuỳ tiện:

`tmux new-session -A -s dlp` cho hai client attach vào **cùng một** session, và tmux (≥3.1, `window-size latest`) ép **một** kích thước cửa sổ cho cả hai — theo client hoạt động gần nhất. Đo thật trên tmux 3.4:

```
client1 (200x50) một mình      → window 200x49
client2 (80x24) attach vào     → window TỤT xuống 80x23   ← tab 1 bị co
client2 gõ phím                → 80x23
client1 gõ phím                → 200x49                    ← lật qua lại mỗi keystroke
```

Tab thứ hai không phải là "thêm một terminal", nó **phá terminal đang có**. Với trần 1, WS thứ hai bị từ chối **429** trước upgrade kèm `code: "SESSION_IN_USE"`.

**Reconnect không bị ảnh hưởng:** khi WS đóng, gateway `DECR session:{id}:ws` về 0, và tmux session vẫn sống trong pod — mở lại vào đúng màn hình cũ. Trần này chặn *đồng thời*, không chặn *nối lại*.

**Status bar tmux phải TẮT** (`set -g status off` trong `/etc/skel/.tmux.conf`). Đo được ở trên: client 200x50 → window 200x**49**; status bar ăn đúng một dòng, nên `stty size` trong pod sẽ lệch 1 so với `rows` mà FE gửi. Tắt nó thì kích thước khớp tuyệt đối và AC đo được thẳng, không phải trừ bì.

**Vì sao `init` riêng thay vì để `resize` làm luôn:** để quy tắc "frame đầu tiên, server chờ nó" là hiển ngôn, và để prompt oh-my-posh vẽ đúng bề rộng ngay lần đầu thay vì vẽ ở 80 cột rồi nhảy. FitAddon chỉ đo đúng **sau** `document.fonts.ready` nên kích thước thật đến muộn hơn `onopen` vài chục ms. Đổi lại một round-trip < 1ms trong LAN.

**`init` chỉ mang `cols`/`rows`. KHÔNG có field `shell`/`command`.** Lệnh exec là hằng số phía server (`GATEWAY_EXEC_COMMAND`). Cho client chọn lệnh là cho client chọn thứ chạy trong pod — kể cả pod của chính họ, đó là bề mặt không cần mở.

## 4. Control message — Client → Server (text/JSON, camelCase)

```jsonc
{ "type": "init",   "cols": 120, "rows": 34 }   // BẮT BUỘC frame đầu; 1 lần
{ "type": "resize", "cols": 132, "rows": 40 }   // mỗi SIGWINCH; FE debounce ~50ms
```

- `cols`, `rows`: số nguyên `1 ≤ n ≤ 1000`. Ngoài khoảng → server clamp và log, **không đóng kết nối** (FE có bug layout không đáng bị ngắt terminal).
- `init` thứ hai → xử lý như `resize`.
- `type` lạ hoặc JSON hỏng → đóng `4400`.
- **camelCase**, khớp `packages/shared-types` và TS sinh từ proto. Go cần struct tag tường minh.

## 5. Control message — Server → Client (text/JSON, camelCase)

```jsonc
{ "type": "ready",    "sessionId": "abc", "podName": "sbx-x1",
  "expiresAt": "2026-08-09T12:00:00Z", "hardCapAt": "2026-08-09T13:00:00Z",
  "maxFrameBytes": 32768 }

{ "type": "expiring", "expiresAt": "…", "hardCapReached": true }

{ "type": "error",    "code": "SESSION_EXPIRED", "message": "phiên đã hết hạn" }

{ "type": "exit",     "exitCode": 0 }
```

- **`ready`** cho FE biết đã attach vào pod thật (101 chỉ nghĩa là "tới được gateway"), mang sẵn `expiresAt`/`hardCapAt` để FE vẽ đồng hồ đếm ngược không cần gọi thêm tRPC, và `maxFrameBytes` để FE tự chia nhỏ paste lớn thay vì bị đóng `4413` giữa lúc sinh viên dán một manifest YAML.
- **`expiring`** là ánh xạ trực tiếp của `ExtendSessionResponse.hard_cap_reached`. Comment trong `session.proto` nói field đó tồn tại "cho FE báo trước thay vì để terminal chết đột ngột" — gateway BẮT BUỘC chuyển tiếp, không thì field đó vô dụng.
- **`error`** luôn đi ngay trước một close frame. `code` là enum ổn định (FE switch trên nó); `message` là tiếng Việt cho người đọc, FE **không parse**.
- **`exit`** khi shell tự thoát, kèm ngay sau là close `1000`.

## 6. Close code

Dải 4000–4999 là dải ứng dụng theo RFC 6455.

| Code | Tên | Khi nào | FE nên retry? |
|---|---|---|---|
| `1000` | NORMAL | shell thoát bình thường (sau `exit`) | không |
| `1012` | SERVICE_RESTART | gateway restart | **có** |
| `4400` | PROTOCOL_ERROR | control JSON hỏng / `type` lạ / bão control | không |
| `4401` | UNAUTHENTICATED | token hết hạn giữa phiên | không |
| `4403` | FORBIDDEN | authz lệch phát hiện giữa phiên | không |
| `4404` | SESSION_GONE | session bị reap / pod biến mất | không |
| `4408` | IDLE_TIMEOUT | hết cửa sổ idle | không |
| `4409` | HARD_CAP_REACHED | chạm trần cứng từ `created_at` | không |
| `1009` | MESSAGE_TOO_BIG | vượt read limit (luật 5) — **thư viện tự đóng**, xem dưới | không |
| `4429` | RATE_LIMITED | vượt byte-rate hoặc client quá chậm (luật 5) | không |
| `4500` | INTERNAL | exec dial fail, lỗi apiserver | **có** |

**Gotcha:** payload close frame tối đa **125 byte**, 2 byte cho code ⇒ `reason` ≤ **123 byte**. Tiếng Việt có dấu là 2 byte/ký tự nên một câu 70 chữ cái đã vượt. Cắt ở tầng gửi, đừng tin caller.

### Read limit → `1009`, KHÔNG phải `4413` (chốt bằng spike 1.A-1, 2026-08-09)

Bản trước để ngỏ `4413` vs `1009`. Đo trực tiếp trên `coder/websocket v1.8.15` (`spike-exec -probe readlimit`, limit 1024, gửi 4096 byte):

```
server-side Read err: websocket: message too big: read limited at 1025 bytes
client thấy close code: 1009    reason: "read limited at 1025 bytes"
```

`SetReadLimit` **tự đóng kết nối ngay trong tầng thư viện** — code ứng dụng không bao giờ nhìn thấy frame vi phạm, nên không có chỗ nào để phát `4413`. Chốt: **`1009`**. Muốn `4413` thì phải bỏ `SetReadLimit` và tự đếm byte, tức viết lại phần bảo vệ bộ nhớ mà thư viện đã làm đúng — đổi một mã đẹp hơn lấy một lớp lỗi mới. Không đáng.

`4429` **vẫn là mã ứng dụng**: byte-rate do code tự đếm và tự đóng. Chỉ mỗi read-limit thuộc về thư viện.

### `4404` khi pod biến mất — exit code KHÔNG đủ để nhận ra (chốt bằng spike 1.A-1)

Xoá pod giữa phiên làm `StreamWithContext` trả `CodeExitError` với `ExitStatus() == 137` (SIGKILL) — **không phân biệt được** với `kill -9` hợp lệ bên trong pod. Bridge nào coi mọi `CodeExitError` là thoát bình thường sẽ đóng bằng `1000`, và FE hiểu thành "người dùng tự gõ `exit`, đừng retry".

Gateway (G4/G5) BẮT BUỘC tra Redis `session:{id}` **trước khi chọn close code** khi stream kết thúc với exit ∈ {137, 143} hoặc với lỗi hạ tầng:

- key mất, hoặc `status ∈ {EXPIRED, REAPED}` → **`4404`**
- session còn sống → thoát thật → `1000`

Một lượt đọc Redis trên đường đóng (không phải đường nóng); gateway đã có sẵn client Redis cho authz (D2).

## 7. Điểm đau: trình duyệt KHÔNG đọc được HTTP status của handshake hỏng

WebSocket API không phơi mã trạng thái HTTP khi handshake fail — FE chỉ nhận `error` rồi `close` với `1006`. Nghĩa là **mọi lỗi ở bước 2 (401/403/404/409/429) hiện ra với FE giống hệt "gateway chết"**.

Cách xử lý, giữ nguyên ưu tiên bảo mật:

- **Lỗi xác thực/uỷ quyền vẫn fail TRƯỚC upgrade với mã HTTP thật.** Không upgrade cho peer chưa chứng minh danh tính. `wscat`/`curl`/test tích hợp đọc được mã này nên acceptance IDOR vẫn kiểm được.
- **FE thấy `1006` mà chưa từng nhận `ready`** → gọi tRPC `session.get` để biết lý do thật (hết hạn / không phải của mình / đã reap) rồi hiển thị. Một round-trip, chỉ trên đường lỗi.
- **Sau khi đã `ready`**, mọi lỗi đi qua `error` + close code ứng dụng, lúc này FE đọc được đầy đủ.

Không làm mục này thì UX cho "phiên của bạn đã hết hạn" và "gateway chết" giống hệt nhau.

## 8. Keepalive

Server gửi **WS ping frame chuẩn** mỗi 20s; không pong trong 10s → coi là chết. JS trong trình duyệt **không gửi/nhận được** ping/pong frame (trình duyệt tự trả pong, code không thấy) nên FE không cần làm gì.

**Ping/pong KHÔNG tính là traffic cho idle-window.** Nếu tính, một tab bỏ quên sẽ giữ pod sống tới tận trần cứng.

## 9. Cố ý KHÔNG có trong v1

App-level ping/pong · chọn shell qua WS · nhiều luồng stdout · nén per-message · phát lại scrollback khi reconnect (việc nối lại phiên do **tmux** phía server lo, xem `phase-1.md` D3 — WS không mang lịch sử).

## Liên quan

- `proto/orchestrator/v1/session.proto` — contract gRPC (`ExtendSession`, `Session.revision`)
- `docs/redis-key-namespace.md` — key + field của `session:{id}` mà gateway đọc
- `plans/devops-learning-platform/phase-1.md` — task list hai lane
