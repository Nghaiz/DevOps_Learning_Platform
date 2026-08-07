# `apps/web`

UI + BFF tRPC + Better Auth.

## Trạng thái P0

**Chưa phải app Next.js.** Hiện tại đây là package TypeScript giữ tầng dữ liệu
(0.C): schema Drizzle, client Postgres/Redis, script smoke. Next.js 15 + Better Auth
+ tRPC vào ở **0.D** — dựng lên trên đúng những file này, không thay thế chúng.

`build` = `tsc --noEmit` (typecheck) cho tới khi có Next.js thật.

## Chạy

```bash
docker compose up -d          # ở root — Postgres + Redis
cp .env.example .env

pnpm --filter @devops-platform/web db:generate   # sinh SQL migration từ schema
pnpm --filter @devops-platform/web db:migrate    # áp vào DB
pnpm --filter @devops-platform/web db:smoke      # Postgres + Redis SET/GET/EXPIRE
```

## Bố cục

| Đường dẫn | Nội dung |
|---|---|
| `src/server/db/schema.ts` | Drizzle — **owner duy nhất** của `users`, `sessions_audit`, `progress` |
| `src/server/db/client.ts` | Pool Postgres + Drizzle client |
| `src/server/redis/client.ts` | Client ioredis |
| `src/server/env.ts` | Đọc env, thiếu → ném lỗi lúc khởi động |
| `src/scripts/db-smoke.ts` | Smoke hạ tầng dữ liệu |
| `drizzle/` | SQL migration sinh ra (commit vào repo) |

## `users` và Better Auth

`users` cố ý mang đúng bộ field lõi Better Auth cần (`id` text, `name`, `email`,
`email_verified`, `image`, `created_at`, `updated_at`) cộng `role`. Ở 0.D, Better Auth
trỏ model `user` vào bảng này qua `modelName` thay vì tự sinh bảng thứ hai — nếu không,
sẽ có `users` và `user` cùng tồn tại và phải migrate lại ngay sau khi vừa tạo.
