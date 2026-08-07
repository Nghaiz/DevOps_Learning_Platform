# `services/orchestrator`

Vòng đời session lab: create / claim / reap pod, warm-pool, reaper. gRPC nội bộ,
không expose ra internet.

## Trạng thái P0

Contract đã khoá, hành vi thì chưa. Mọi RPC trả `codes.Unimplemented` một cách
tường minh — cố ý **không** mock ra `Session` giả, vì `apps/web` sẽ code dựa trên
hành vi bịa rồi vỡ khi P1 nối K8s thật. Hiện thực đầy đủ ở
[phase-1.md](../../plans/devops-learning-platform/phase-1.md).

| Cổng | Giao thức | Nội dung |
|---|---|---|
| `:9090` | gRPC | `orchestrator.v1.SessionService` + `grpc.health.v1.Health` |
| `:8081` | HTTP | `/healthz`, `/metrics` |

Probe của K8s cho cổng gRPC dùng `grpc.health.v1.Health`, không dùng `/healthz`.

## Chạy

```bash
docker compose up -d              # ở root — Postgres + Redis
cp .env.example .env
go run ./cmd/orchestrator

# Smoke hạ tầng dữ liệu (acceptance criteria P0)
go run ./cmd/dbsmoke
```

## Bố cục

| Đường dẫn | Nội dung |
|---|---|
| `cmd/orchestrator` | Entrypoint: gRPC + HTTP, shutdown mềm |
| `cmd/dbsmoke` | Smoke Postgres + Redis, exit 0/1 |
| `internal/config` | Env → `Config`. Thiếu/sai → error lúc khởi động |
| `internal/grpcserver` | Hiện thực `SessionService` |
| `internal/rediskeys` | Namespace key Redis ([SSOT](../../docs/redis-key-namespace.md)) |
| `internal/store` | Client Postgres (pgx) + Redis (go-redis) |

## Postgres: vì sao chưa có sqlc

Task 10 của [phase-0.md](../../plans/devops-learning-platform/phase-0.md) đặt sqlc ở
dạng **có điều kiện** — "nếu orchestrator cần persist audit". Ở P0 thì không: quy ước
1-owner/bảng đặt cả ba bảng dưới quyền Drizzle (`apps/web`), còn trạng thái session
sống ở Redis. Thêm sqlc bây giờ nghĩa là sinh code cho zero query.

`internal/store` vẫn mở sẵn pgxpool để orchestrator ping được DB và để P1 chỉ việc
thêm query. Khi orchestrator thật sự sở hữu bảng đầu tiên → thêm `sqlc.yaml` lúc đó.
