# `services/shared`

Go module bootstrap dùng chung cho `orchestrator` và `terminal-gateway`.

| Package | Trách nhiệm |
|---|---|
| `envx` | Đọc env. Giá trị sai định dạng → error, không rơi về default. |
| `logging` | `slog` JSON handler, gắn sẵn label `service` + `version`. |
| `httpx` | `/healthz` + `/metrics` (registry Prometheus riêng, không dùng global), `http.Server` có timeout, shutdown mềm. |

**Vì sao tách module riêng thay vì copy vào từng service:** cả hai service cần đúng
cùng một bootstrap. Bản sao thứ hai sẽ lệch ngay lần đầu ai đó sửa một bên
(`rules/code-conventions.md` — No Duplicated Logic). Module này KHÔNG chứa logic
nghiệp vụ — nghiệp vụ thuộc về service sở hữu nó.
