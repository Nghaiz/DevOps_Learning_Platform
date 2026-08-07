# `proto/` — Contract SSOT

Mọi shape dữ liệu đi qua ranh giới **Next.js ↔ Go** được định nghĩa ở đây trước, rồi codegen ra
cả hai đầu. Không đầu nào tự chế shape (`rules/contract-first-integration.md`).

## Ranh giới ba lớp contract

| Seam | Cơ chế | Ai định nghĩa |
|---|---|---|
| Browser ↔ `apps/web` (BFF) | **tRPC** — type suy ra trực tiếp từ router TS | Không cần proto/OpenAPI. Type-safety đã end-to-end trong cùng một tsconfig. |
| `apps/web` ↔ `services/*` (Go) | **gRPC / protobuf** | `proto/**` — file này. |
| Bên thứ ba ↔ platform | **OpenAPI** | Chưa có ở v0. Thêm khi thực sự mở REST route công khai. |

v0 cố tình **không** sinh OpenAPI: chưa có consumer ngoài. Thêm một spec không ai đọc là tech
debt, không phải contract.

## Codegen

```bash
make proto          # regenerate cả Go lẫn TS (hoặc: pnpm proto)
make proto-check    # drift gate — fail nếu generated khác committed
```

Đầu ra (đều **được commit**, drift gate so chính nó):

| Ngôn ngữ | Đích | Consumer |
|---|---|---|
| Go | `proto/gen/go/` (Go module riêng, vào `go.work`) | `services/orchestrator`, `services/terminal-gateway` |
| TypeScript | `packages/shared-types/gen/` | `apps/web` |

**Vì sao Go sinh vào `proto/gen/go` chứ không `services/*/gen`:** hai service dùng chung đúng
một contract. Sinh vào từng service sẽ tạo hai bản sao byte-identical — vi phạm SSOT
(`rules/development-principles.md`) và cho phép chúng lệch nhau khi ai đó chỉ regenerate một bên.

## Quy ước

- Package trùng thư mục: `orchestrator.v1` ⇄ `proto/orchestrator/v1/`.
- Version trong đường dẫn. Breaking change ⇒ `v2`, không sửa `v1` tại chỗ (`buf breaking` gác).
- Enum luôn có giá trị `_UNSPECIFIED = 0`; đừng gán nghĩa cho zero value.
- `buf lint` chạy STANDARD — RPC phải có message `{Rpc}Request`/`{Rpc}Response` riêng, kể cả khi
  hiện tại chỉ có một field. Nó cho phép thêm field sau này mà không breaking.
