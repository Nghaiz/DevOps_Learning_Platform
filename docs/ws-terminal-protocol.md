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
        a. Origin ∈ allowlist             → sai: 403
        b. subprotocol có dlp.terminal.v1 → sai: 400
        c. cookie tồn tại                 → sai: 401
        d. JWT hợp lệ (sig/aud/exp/iss)   → sai: 401
        e. token.sid == {id}              → sai: 403
        f. Redis session:{id} tồn tại     → sai: 404
        g. hash.userId == token.sub       → sai: 403
        h. status ∈ {CLAIMED, RUNNING}    → sai: 409
        i. session:{id}:ws < trần         → sai: 429

3. S→C  101 Switching Protocols
        Sec-WebSocket-Protocol: dlp.terminal.v1

4. C→S  {"type":"init","cols":120,"rows":34}   ← BẮT BUỘC frame đầu tiên
5. S    dial exec vào pod với đúng cols/rows   (init không tới trong 3s → 80×24)
6. S→C  {"type":"ready", …}                    ← frame đầu tiên server gửi
7. ↔    binary tự do, control message tuỳ lúc
```

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
| `4413` | FRAME_TOO_LARGE | vượt read limit (luật 5) | không |
| `4429` | RATE_LIMITED | vượt byte-rate hoặc client quá chậm (luật 5) | không |
| `4500` | INTERNAL | exec dial fail, lỗi apiserver | **có** |

**Gotcha:** payload close frame tối đa **125 byte**, 2 byte cho code ⇒ `reason` ≤ **123 byte**. Tiếng Việt có dấu là 2 byte/ký tự nên một câu 70 chữ cái đã vượt. Cắt ở tầng gửi, đừng tin caller.

**Chưa chốt cứng:** close code khi vượt read limit có thể là `1009` (message too big) thay vì `4413` — `SetReadLimit` của `coder/websocket` tự đóng bằng 1009. Spike **S3/S4 phải xác minh hành vi thật** rồi mới pin. Không viết spec trước rồi ép thư viện theo.

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
