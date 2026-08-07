# `services/terminal-gateway`

Cầu nối WebSocket ⇄ pod exec (SPDY). Chỗ Go thắng Node: hàng nghìn kết nối
long-lived, mỗi kết nối một goroutine.

## Trạng thái P0

Chỉ có khung HTTP + observability. `/ws/session/{id}` trả **401 cho mọi request**.

Đây là lựa chọn cố ý, không phải TODO bỏ quên: per-session authz (luật 8 + luật 10
của [design §6](../../plans/reports/2026-08-07-devops-learning-platform-design.md))
phải có TRƯỚC khi tồn tại đường vào pod. Mở handler rồi hứa "chặn sau" là đúng cách
một sandbox bị lọt.

| Đường dẫn | P0 | P1 |
|---|---|---|
| `/healthz` | 200 | 200 |
| `/metrics` | Prometheus | + metric số WS đang mở |
| `/ws/session/{id}` | **401** | verify token per-session → upgrade → nối pod exec |

Token đi qua cookie httpOnly hoặc WS subprotocol — **không bao giờ qua query string**
(luật 8). Ràng buộc này đã ghi ở `internal/wsroute` để P1 không cài lại sai.

## Chạy

```bash
cp .env.example .env
go run ./cmd/terminal-gateway

curl -i localhost:8082/healthz              # 200
curl -i localhost:8082/ws/session/abc123    # 401
```
