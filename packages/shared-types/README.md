# `@devops-platform/shared-types`

Type dùng chung cho phía TypeScript. Hai nguồn nội dung:

| Thư mục | Nguồn | Sửa ở đâu |
|---|---|---|
| `gen/` | Sinh từ `proto/` bằng `make proto` | **Không sửa tay** — sửa `.proto` rồi regenerate |
| `src/` | Viết tay | Ở đây |

Package này **không build ra `dist/`**: consumer đều nằm trong monorepo và tự compile TS
(tsx ở script, Next.js transpile ở `apps/web`). `build` = `tsc --noEmit`, tức là typecheck.

## `src/redis-keys.ts`

Namespace key Redis v0, có bản song sinh bằng Go ở
`services/orchestrator/internal/rediskeys/keys.go`. SSOT của quy ước là
[`docs/redis-key-namespace.md`](../../docs/redis-key-namespace.md).
