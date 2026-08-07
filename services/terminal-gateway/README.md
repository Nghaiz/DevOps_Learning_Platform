# `services/terminal-gateway`

Cầu nối WebSocket ⇄ pod exec (SPDY). Chỗ Go thắng Node: hàng nghìn kết nối
long-lived, mỗi kết nối một goroutine.

## Trạng thái P0

Chỉ có khung HTTP + observability. `/ws/session/{id}` trả **401 cho mọi request**.

Đây là lựa chọn cố ý, không phải TODO bỏ quên: per-session authz (luật 8 + luật 10
của [design §6](../../plans/reports/2026-08-07-devops-learning-platform-design.md))
phải có TRƯỚC khi tồn tại đường vào pod. Mở handler rồi hứa "chặn sau" là đúng cách
một sandbox bị lọt.

## Hai port, không phải một

| Port | Phơi ra | Đường dẫn | P0 | P1 |
|---|---|---|---|---|
| `PUBLIC_ADDR` (`:8082`) | Internet (trình duyệt) | `/ws/session/{id}` | **401** | verify token per-session → upgrade → nối pod exec |
| `ADMIN_ADDR` (`127.0.0.1:8083`) | Chỉ nội bộ | `/healthz`, `/metrics` | 200 | + metric số WS đang mở |

`/metrics` **không** đi chung port với WS. Nó không có authz, và `dlp_build_info` lộ chính
xác version (tra CVE) trong khi `go_goroutines`/`process_*` cho phép người ngoài đếm số
session đang chạy. Gateway buộc phải mở port công khai cho WS, nên gộp chung mux là biếu
không thông tin đó. Đừng map `ADMIN_ADDR` ra ingress.

Port công khai dùng `httpx.NewStreamingServer` chứ không phải `NewServer`:
`ReadTimeout`/`WriteTimeout` là deadline **tuyệt đối** trên connection và vẫn hiệu lực sau
khi WS hijack, nên 30s sẽ cắt ngang mọi phiên terminal ở P1.

Token đi qua cookie httpOnly hoặc WS subprotocol — **không bao giờ qua query string**
(luật 8). Ràng buộc này đã ghi ở `internal/wsroute` để P1 không cài lại sai.

## Chạy

```bash
cp .env.example .env
go run ./cmd/terminal-gateway

curl -i 127.0.0.1:8083/healthz              # 200 (port admin)
curl -i localhost:8082/ws/session/abc123    # 401 (port công khai)
curl -i localhost:8082/metrics              # 404 — metrics KHÔNG nằm ở port công khai
```
