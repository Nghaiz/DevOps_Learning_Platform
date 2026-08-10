# `services/terminal-gateway`

Cầu nối WebSocket ⇄ pod exec (SPDY). Chỗ Go thắng Node: hàng nghìn kết nối
long-lived, mỗi kết nối một goroutine.

## Trạng thái: 1.C-1 xong (cổng vào), 1.C-2 còn nợ (cầu exec)

`/ws/session/{id}` chạy đủ **chín bước kiểm trước upgrade** của
[`docs/ws-terminal-protocol.md`](../../docs/ws-terminal-protocol.md) §3, rồi upgrade
thật và đóng ngay bằng `4500` kèm control `error` — cầu exec vào pod (G4–G6) là
chặng sau.

| Bước | Kiểm | Hỏng → |
|---|---|---|
| a | `Origin` ∈ allowlist (**vắng hẳn thì cho qua**, §3a) | `403 ORIGIN_NOT_ALLOWED` |
| b | client chào `dlp.terminal.v1` | `400 SUBPROTOCOL_REQUIRED` |
| c | cookie `dlp_sandbox` tồn tại | `401 UNAUTHENTICATED` |
| d | JWT hợp lệ (EdDSA, `aud=gateway`, `iss`, `exp`) | `401 UNAUTHENTICATED` |
| e | `token.sid == {id}` | `403 FORBIDDEN` |
| f | `session:{id}` còn trong Redis | `404 SESSION_NOT_FOUND` |
| g | `hash.userId == token.sub` | `403 FORBIDDEN` |
| h | `status ∈ {CLAIMED, RUNNING}` | `409 SESSION_NOT_ACTIVE` |
| i | `session:{id}:ws` < trần (=1) | `429 SESSION_IN_USE` |

**Thứ tự này là contract, không phải phong cách.** Bước e chạy TRƯỚC bước f, nên một
`{id}` đoán bừa trả **403 chứ không phải 404** — "id không tồn tại" và "id của người
khác" đi qua cùng một dòng code, cùng một mã, nên không còn kênh phụ nào để liệt kê
session. 404 chỉ tới được khi `sid` KHỚP mà Redis đã mất key, tức "session của chính
bạn đã biến mất". Đừng đảo thứ tự cho 404 dễ gặp hơn.

### Ba thứ dễ implement lại cho sai

1. **Không có khoá riêng nào của gateway.** Sandbox token ký bằng chính khoá JWKS của
   Better Auth đang dùng cho `aud=orchestrator`, chỉ khác `aud` (D13/D15) — nên `aud`
   là thứ **duy nhất** tách hai loại token, và bỏ check đó nghĩa là một token cấp để
   gọi gRPC mở được shell.
2. **`alg` bị ép phía server, không đọc từ header token.** `alg:"none"` bỏ qua chữ ký,
   và `alg:"HS256"` biến chính public key Ed25519 (ai cũng tải được từ
   `/api/auth/jwks`) thành secret HMAC. Danh sách alg truyền vào `ParseSignedCompact`
   phải nằm TRƯỚC mọi lượt chạm khoá — có test đếm hit JWKS để gác đúng thứ tự đó.
3. **Refetch-khi-gặp-`kid`-lạ phải có sàn thời gian.** Không có nó, "chịu được
   rotation" biến thành một cần gạt DoS công khai vào `apps/web`: 200 token với 200
   `kid` bịa ra là 200 lượt fetch. `singleflight` KHÔNG cứu được — các lượt đó đi lần
   lượt, không đồng thời.

## Hai port, không phải một

| Port | Phơi ra | Đường dẫn | Hôm nay (1.C-1) | Còn nợ |
|---|---|---|---|---|
| `PUBLIC_ADDR` (`:8082`) | Internet (trình duyệt) | `/ws/session/{id}` | 9 bước authz → 101 → đóng `4500` | nối pod exec (1.C-2) |
| `ADMIN_ADDR` (`127.0.0.1:8083`) | Chỉ nội bộ | `/healthz`, `/metrics` | 200 | metric WS (G10, 1.C-3) |

`/metrics` **không** đi chung port với WS. Nó không có authz, và `dlp_build_info` lộ chính
xác version (tra CVE) trong khi `go_goroutines`/`process_*` cho phép người ngoài đếm số
session đang chạy. Gateway buộc phải mở port công khai cho WS, nên gộp chung mux là biếu
không thông tin đó. Đừng map `ADMIN_ADDR` ra ingress.

Port công khai dùng `httpx.NewStreamingServer` chứ không phải `NewServer`:
`ReadTimeout`/`WriteTimeout` là deadline **tuyệt đối** trên connection và vẫn hiệu lực sau
khi WS hijack, nên 30s sẽ cắt ngang mọi phiên terminal ở P1.

Token đi qua **cookie httpOnly, CHỈ cookie** — không subprotocol, và không bao giờ qua
query string (luật 8 + contract §2 D1). Có unit test khẳng định `?token=` bị bỏ qua và
bị từ chối.

## Chạy

```bash
cp .env.example .env      # nhớ điền REDIS_URL — không có default, service sẽ không lên
go run ./cmd/terminal-gateway

curl -i 127.0.0.1:8083/healthz              # 200 (port admin)
curl -i localhost:8082/ws/session/abc123    # 401 (không cookie) — port công khai
curl -i localhost:8082/metrics              # 404 — metrics KHÔNG nằm ở port công khai
```

## Test

Suite của gateway chạy trên **Redis thật**, không miniredis (bài học 1.A-2 A4:
miniredis hỗ trợ Lua không đầy đủ, nên script xanh trên nó mà đỏ trên Redis thật là
guard không gác gì). Thiếu `REDIS_URL` thì test **skip có log rõ**, không giả vờ xanh —
nên hãy đọc số PASS chứ đừng đọc mỗi chữ `ok`.

```bash
docker compose up -d redis
export REDIS_URL="redis://:<mật-khẩu>@127.0.0.1:6379"
go test -race ./...
```

DB Redis được phân bổ theo package để `go test ./...` (chạy package song song) không
FLUSHDB lên nhau — bảng phân bổ ở `internal/redistest`, và nó **vắt qua hai module** vì
orchestrator dùng chung Redis đó. Thêm số mới thì kiểm cả hai bên.
