# `services/shared`

Go module bootstrap dùng chung cho `orchestrator` và `terminal-gateway`.

| Package | Trách nhiệm |
|---|---|
| `envx` | Đọc env. Giá trị sai định dạng → error, không rơi về default. |
| `logging` | `slog` JSON handler, gắn sẵn label `service` + `version`. |
| `httpx` | `/healthz` + `/metrics` (registry Prometheus riêng, không dùng global), `http.Server` có timeout, shutdown mềm. |
| `rediskeys` | Namespace key Redis v0 ([SSOT](../../docs/redis-key-namespace.md)), bản song sinh của `packages/shared-types/src/redis-keys.ts`. |

**Vì sao tách module riêng thay vì copy vào từng service:** cả hai service cần đúng
cùng một bootstrap. Bản sao thứ hai sẽ lệch ngay lần đầu ai đó sửa một bên
(`rules/code-conventions.md` — No Duplicated Logic). Module này KHÔNG chứa logic
nghiệp vụ — nghiệp vụ thuộc về service sở hữu nó.

`rediskeys` là ngoại lệ có lý do, không phải nghiệp vụ trôi vào đây: nó là **quy ước
đặt tên chuỗi** mà cả orchestrator (ghi) lẫn terminal-gateway (đọc, cho authz
per-session — phase-1 D2) đều phải tuân theo **y hệt nhau**. Để nó ở
`orchestrator/internal/` thì gateway không import được và sẽ nối chuỗi tay — đó
đúng là cách contract key trôi đi trong im lặng (phase-1 D7).
