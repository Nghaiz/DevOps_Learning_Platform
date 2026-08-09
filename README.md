# DevOps Learning Platform

Nền tảng học–thực hành DevOps tự host. Ba trụ cột (Lessons, Labs, Games) dùng chung **một
sandbox engine** chạy trên K8s + Sysbox: root-trong-pod ≠ root-trên-host, và `docker run`
chạy được bên trong pod **không** privileged.

- Thiết kế (SSOT): [`plans/reports/2026-08-07-devops-learning-platform-design.md`](plans/reports/2026-08-07-devops-learning-platform-design.md)
- Kế hoạch theo phase: [`plans/devops-learning-platform/plan.md`](plans/devops-learning-platform/plan.md)

## Yêu cầu

| Công cụ | Phiên bản | Ghi chú |
|---|---|---|
| Node | **24 LTS** | Node 20 đã EOL 04/2026 |
| pnpm | **11+** | `corepack enable` |
| Go | **1.24+** | workspace `go.work` |
| buf | 1.7x | codegen protobuf |
| Docker | 27+ | Postgres/Redis dev + build image |
| golangci-lint | v2 | `go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest` |

`make` là tuỳ chọn — trên Windows dùng script pnpm tương đương (`pnpm proto`, `pnpm lint`, …).

## Chạy lần đầu

```bash
pnpm install
docker compose up -d                                  # Postgres 16 + Redis 7

cp apps/web/.env.example apps/web/.env                # rồi sửa nếu cần
pnpm --filter @devops-platform/web db:migrate         # tạo bảng

make smoke                                            # Postgres + Redis, cả TS lẫn Go
```

## Vòng lặp thường ngày

```bash
pnpm turbo run lint build test     # TypeScript
make go-build go-vet go-test       # Go (mọi module)
make proto                         # regenerate type sau khi sửa .proto
make proto-check                   # drift gate: generated == committed?
```

## Toolchain TypeScript (TS7 + shim TS6)

`package.json` có **hai** entry TypeScript vì TS7 (native Go, ~6× nhanh hơn) không ship JS API:

| Entry | Trỏ vào | Vai trò |
|---|---|---|
| `@typescript/native` | `typescript@7` | Cấp bin `tsc` — `pnpm typecheck` chạy TS7 |
| `typescript` | `@typescript/typescript6@6` | Cấp JS API cho `typescript-eslint`/Next + bin `tsc6` |

- `tsc --version` → 7.x · `tsc6 --version` → 6.x · `node -p "require('typescript').version"` → 6.x
- **Mặt suy giảm đã chấp nhận:** (1) editor dùng tsgo mất Next TS plugin (`tsconfig.json` giữ key `plugins` để tự hoạt động lại nếu quay về TS6); (2) workspace không còn `node_modules/typescript/lib/tsserver.js` (shim không ship, `@typescript/native` chỉ khai bin `tsc`) — VS Code âm thầm dùng TS đóng gói sẵn của editor thay vì bản workspace; (3) `next build` typecheck bằng **API TS6** (`experimental.useTypeScriptCli: false` trong `next.config.ts` — CLI mode của Next 16 hardcode `typescript/bin/tsc`, shim không có bin đó); cổng typecheck TS7 thật là `pnpm typecheck` trong CI.
- **Gỡ alias** (quay về một entry `typescript@7` duy nhất) khi `typescript-eslint` hỗ trợ TS ≥7.1 — theo dõi upstream `typescript-eslint#10940`, mốc rà lại ~10/2026.

## Bố cục

```
apps/web/                   Next.js (UI + BFF tRPC + Better Auth) — hiện là package TS giữ tầng dữ liệu
services/orchestrator/      Go — vòng đời session, warm-pool, reaper, gRPC server
services/terminal-gateway/  Go — WS ⇄ pod exec, per-session authz
services/shared/            Go — env, structured log, /healthz + /metrics dùng chung
proto/                      Contract SSOT (gRPC). `gen/go` là module Go dùng chung
packages/shared-types/      Type TS: sinh từ proto + viết tay (redis key namespace)
packages/{ui,scenario,terminal}/   Chỗ dành sẵn — 0.D / P1 / P2
images/sandbox-base/        Image pod lab (P1)
infra/host/                 Bootstrap Debian 13 + kubeadm + Sysbox (đã chạy được)
infra/{helm,k8s}/           Chart + manifest (task 27, P1, P3)
```

## Nguyên tắc chi phối

- **Contract-first.** Mọi shape dữ liệu Next↔Go định nghĩa ở `proto/` rồi codegen ra cả hai
  đầu. Không đầu nào tự chế shape. CI có drift gate.
- **SSOT.** Trạng thái session sống ở Redis, không nhân bản sang Postgres. Không lưu giá trị
  suy ra được từ cột khác.
- **Errors over silent fallbacks.** Env sai định dạng, DSN thiếu → chết lúc khởi động, không
  âm thầm rơi về default.
- **Fail-closed ở biên nguy hiểm.** Endpoint nào chưa có authz thì trả 401, không mở sẵn rồi
  hứa chặn sau.

Chi tiết: `.claude/rules/` và [`docs/`](docs/).

## Trạng thái

P0 nền móng đang chạy dở — bảng tiến độ theo nhóm task ở
[`plans/devops-learning-platform/phase-0.md`](plans/devops-learning-platform/phase-0.md).
Cổng rủi ro cao nhất (**P0.F — Sysbox proof pod, 8/8**) đã xanh.
