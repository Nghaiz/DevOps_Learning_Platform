# Phase 0 — Nền móng (Foundation)

**Mức chi tiết:** DETAILED · **Effort:** L (2–3 tuần) · **Blocks:** P1, P2, P3, P4 · **Blocked by:** — (không)

## Objective

Dựng bộ khung monorepo build/test/lint được end-to-end, hạ tầng dữ liệu (Postgres + Redis), auth thật (Better Auth login), skeleton 2 Go service nói chuyện qua gRPC contract, CI/CD, và **1 node k3s + Sysbox chạy được 1 pod unprivileged**. Kết thúc P0: có thể đăng nhập, có contract codegen 2 chiều, và chứng minh Sysbox hoạt động — mở đường cho engine ở P1.

**Không làm ở P0:** warm-pool, terminal streaming, nội dung lesson. Chỉ khung + chứng minh khả thi.

## Task list

### 0.A Monorepo & toolchain
1. Khởi tạo Turborepo + pnpm workspace (root `package.json`, `pnpm-workspace.yaml`, `turbo.json`). Node 20 LTS, pnpm 9.
2. Go workspace (`go.work`) trỏ `services/orchestrator`, `services/terminal-gateway`. Go 1.23+.
3. Tạo cây thư mục design §8 (apps/web, services/*, packages/*, proto/, images/sandbox-base, infra/{helm,k8s}) với placeholder README mỗi thư mục.
4. Lint/format chung: ESLint + Prettier (TS), `golangci-lint` + `gofmt` (Go). `turbo run lint build test` chạy được.
5. `.gitignore`, `.env.example` cho mỗi service (không giá trị thật); root `README.md` tóm tắt cách chạy.

### 0.B Contract-first (proto SSOT) — cross-cutting, làm SỚM
6. Định nghĩa `proto/orchestrator/v1/session.proto` — RPC v0: `CreateSession`, `ClaimSession`, `GetSession`, `ReapSession`; message `Session{id, userId, status, podName, namespace, expiresAt, tier}`; enum `SessionStatus`, `SandboxTier`.
7. Chọn toolchain codegen: `buf` (buf.build) cho lint + generate. `buf.gen.yaml` sinh **Go** (protoc-gen-go, protoc-gen-go-grpc → `services/*/gen`) và **TS** (`@bufbuild/protobuf` / connect-es → `packages/shared-types/gen`).
8. Wire codegen vào `turbo`/`Makefile`: `make proto` regenerate cả 2 đầu; CI fail nếu generated khác committed (drift gate).
9. OpenAPI: chỉ cần cho các REST route công khai của Next (nếu có) — v0 để tRPC tự lo type FE↔BFF; gRPC lo BFF↔Go. Ghi rõ ranh giới trong `proto/README.md`.

### 0.C Data layer
10. PostgreSQL 16: Drizzle ORM (TS) trong `apps/web`, schema `users`, `sessions_audit`, `progress` (skeleton). `pgx` + `sqlc` cho Go (query `sessions` nếu orchestrator cần persist audit — mặc định session state ở Redis).
11. Migration: Drizzle Kit cho schema TS-owned; quy ước 1 owner/bảng để tránh 2 ORM cùng ghi 1 bảng.
12. Redis 7: client (ioredis TS, go-redis Go). Định nghĩa key namespace v0: `pool:free`, `session:{id}`, `session:{id}:pod`, TTL policy. Chưa dùng nhiều — chỉ smoke connect + 1 SET/GET/EXPIRE.
13. `docker-compose.yml` (dev): Postgres + Redis dùng **named volumes** (`rules/docker-volume-discipline.md`), không anonymous volume.

### 0.D apps/web — Next.js + Better Auth + tRPC skeleton
14. Next.js 15 App Router + TS + Tailwind + shadcn/ui (`packages/ui` init). Trang `/` + `/login` + `/dashboard` (trống).
15. **Better Auth**: email/password + OAuth Google/Microsoft (placeholder client id qua env), session, RBAC role `user`/`admin`. Cấu hình JWT **`aud` per-service**, **signing key riêng**, **access TTL ngắn (~15m) + refresh rotation**, **refresh token tách biệt + revocation list** (luật 6,7).
16. tRPC router skeleton: `auth`, `me`, `session` (chỉ stub gọi orchestrator gRPC sau). Base procedure có: **Zod input schema bắt buộc + reject unknown keys** (luật 3), **object-level authz middleware** (kiểm `ctx.user.id`/role trước mọi resource — luật 1), **pagination cap max 100** trong list-input schema dùng chung (luật 4).
17. **Security headers** (luật 9) qua middleware Next: HSTS, CSP, X-Frame-Options=DENY, X-Content-Type-Options=nosniff, Referrer-Policy, Permissions-Policy.
18. **CORS** (luật 2): allowlist origin từ env, KHÔNG reflect `Origin`, KHÔNG `Access-Control-Allow-Credentials` với wildcard.
19. **Token transport** (luật 8): chỉ httpOnly + Secure + SameSite cookie; không bao giờ nhét token vào URL/query.
20. **Rate limit + body-size** (luật 5): middleware cơ bản ở Next (bổ sung ở Traefik tại P3). Body cap ví dụ 1MB cho JSON.

### 0.E Skeleton Go services
21. `services/orchestrator`: gRPC server implement stub các RPC 0.B (trả `Unimplemented`/mock), `/healthz`, `/metrics` (Prometheus), structured JSON log (zap/slog). Đọc config qua env.
22. `services/terminal-gateway`: HTTP + WS server skeleton, `/healthz`, `/metrics`, endpoint `/ws/session/{id}` trả 401 (chưa authz) — chưa nối pod. Structured log.
23. Cả 2 service: Dockerfile multi-stage (distroless/alpine), image build được.

### 0.F Sandbox node khả thi (rủi ro #1 — làm sớm)
24. Dựng **k3s 1-node** (script `infra/k8s/bootstrap-k3s.sh`, lặp lại được). Self-managed (KHÔNG GKE Autopilot).
25. Cài **Sysbox** (`sysbox-runc`) lên node; tạo `RuntimeClass sysbox-runc` (`infra/k8s/runtimeclass-sysbox.yaml`).
26. **Proof pod**: manifest pod dùng `runtimeClassName: sysbox-runc`, **unprivileged**, chạy image có systemd/docker-in-docker nhẹ; chứng minh root-in-container ≠ root-on-host (user-ns remap) và có thể chạy `docker`/`kind` bên trong. Ghi lại bằng chứng (`infra/k8s/README-sysbox-proof.md`).
27. Helm chart khung `infra/helm/platform` deploy được orchestrator + gateway + web lên k3s (values cho k3s self-host; giữ chỗ values cloud node pool).

### 0.G CI/CD
28. GitHub Actions: job `ci` chạy `pnpm i` + `turbo run lint build test` + `make proto` drift-check + `go build ./... && go test ./...` + `golangci-lint`.
29. Build & push 3 image (web, orchestrator, gateway) + sandbox-base placeholder lên registry (job `images`, chạy trên tag/main).
30. Secret scanning gate (không commit `.env`/keys). Branch protection: CI xanh mới merge.

## File / dir ownership

| Owner | Đường dẫn |
|---|---|
| Monorepo/config | root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `go.work`, `.gitignore`, `docker-compose.yml`, `Makefile` |
| Contract | `proto/**`, `buf.yaml`, `buf.gen.yaml`, `packages/shared-types/gen/**` |
| Web | `apps/web/**`, `packages/ui/**` (init) |
| Orchestrator | `services/orchestrator/**` (+ `gen/`) |
| Gateway | `services/terminal-gateway/**` (+ `gen/`) |
| Data | `apps/web/src/server/db/**` (Drizzle), `services/*/internal/store/**` (pgx/sqlc) |
| Infra | `infra/k8s/**`, `infra/helm/**`, `images/sandbox-base/Dockerfile` (placeholder) |
| CI | `.github/workflows/**` |

**Sequencing để tránh đụng file:** 0.B (proto) phải xong trước 0.D/0.E dùng generated types. 0.C schema trước 0.D tRPC. 0.F độc lập, chạy song song ngay từ đầu (rủi ro cao nhất).

## Dependencies

- **Blocks:** toàn bộ P1–P4.
- **Blocked by:** không.
- **Nội bộ:** 0.B → (0.D, 0.E); 0.C → 0.D; 0.A → tất cả; 0.F song song (ưu tiên khởi động ngày 1).

## Acceptance criteria

**Chức năng:**
- [ ] `turbo run lint build test` và `go build ./... && go test ./...` đều xanh từ clean checkout.
- [ ] `make proto` sinh lại type Go + TS; chạy lại không tạo diff (drift gate xanh).
- [ ] Đăng ký + đăng nhập (email/pw) hoạt động; session cookie set; `/dashboard` chỉ vào được khi đã login.
- [ ] OAuth Google/Microsoft đi tới màn consent (env placeholder OK).
- [ ] orchestrator + gateway trả `/healthz` 200 và `/metrics` có metric; tRPC `session.*` gọi được orchestrator gRPC (mock).
- [ ] Postgres migrate được; Redis SET/GET/EXPIRE ok qua cả TS lẫn Go client.
- [ ] Helm chart deploy 3 service lên k3s 1-node; pod Running.

**Bảo mật (luật §6 — testable):**
- [ ] **Luật 1:** truy cập resource của user khác qua tRPC → 403 (viết test: user A gọi resource ownerId=B).
- [ ] **Luật 2:** request với `Origin` lạ → không có CORS header cho phép; không reflect origin; header credentials không đi cùng wildcard (test bằng curl).
- [ ] **Luật 3:** payload có field thừa hoặc sai type → tRPC reject 400 (Zod strict). Không dùng Mongo ở đâu cả.
- [ ] **Luật 4:** list request `limit=1000000` → server ép về ≤100 (test).
- [ ] **Luật 5:** body > cap → 413; > N req/s → 429 (test cơ bản).
- [ ] **Luật 6:** decode access token thấy `aud` đúng service, TTL ≤ 15m; refresh xoay ra token mới.
- [ ] **Luật 7:** dùng access token ở endpoint refresh → từ chối; refresh cũ sau rotation → từ chối (revocation).
- [ ] **Luật 8:** không endpoint nào nhận token qua query string; grep codebase 0 kết quả token-in-URL.
- [ ] **Luật 9:** `curl -I` trang chính có đủ HSTS/CSP/X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy.
- [ ] **Luật 10 (nền):** proof pod chạy `runtimeClassName: sysbox-runc`, **KHÔNG privileged**; `id` trong pod = root nhưng UID map trên host ≠ 0 (bằng chứng ghi lại).

## Verify commands

```bash
# Toolchain + build
pnpm install && pnpm turbo run lint build test
go work sync && go build ./... && go test ./...
golangci-lint run ./...

# Contract drift gate
make proto && git diff --exit-code -- proto packages/shared-types/gen services

# Security header check (web chạy local)
curl -sI https://localhost:3000/ | grep -Ei 'strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions-policy'

# CORS không reflect
curl -s -H "Origin: https://evil.example" -I https://localhost:3000/api/trpc/me | grep -i 'access-control-allow-origin'  # phải KHÔNG match evil

# Sysbox proof
kubectl apply -f infra/k8s/proof-pod-sysbox.yaml
kubectl exec proof-pod -- sh -c 'id; cat /proc/self/uid_map; docker run --rm hello-world'
kubectl get pod proof-pod -o jsonpath='{.spec.runtimeClassName}'   # => sysbox-runc

# Helm deploy
helm upgrade --install platform infra/helm/platform -f infra/helm/platform/values-k3s.yaml
kubectl get pods   # web/orchestrator/gateway Running
```

## Risk Assessment (P0)

| Rủi ro | Likelihood | Impact | Score | Mitigation |
|---|---|---|---|---|
| Sysbox không cài được / node OS không hỗ trợ (kernel, shiftfs) | 4 | 5 | **20** | Chọn OS Sysbox hỗ trợ (Ubuntu 20.04/22.04); thử ngày 1; script bootstrap lặp lại; ghi log lỗi rõ. Nếu bí sau 3 lần → escalate hỏi user về hạ tầng node. |
| Contract codegen 2 ngôn ngữ lệch (buf config sai) | 3 | 4 | 12 | Drift gate trong CI ngay P0; 1 proto nhỏ chạy trước khi mở rộng. |
| Better Auth cấu hình `aud`/refresh rotation phức tạp | 3 | 3 | 9 | Theo doc Better Auth chính thức; viết test luật 6/7 sớm để chốt hành vi. |
| 2 ORM (Drizzle + sqlc) tranh chấp cùng bảng | 2 | 3 | 6 | Quy ước 1 owner/bảng; session state để Redis, không nhân đôi. |

**Score 20 (Sysbox)** → BẮT BUỘC hoàn tất proof pod trước khi P1 bắt đầu build orchestrator create-pod.

## Timeline (P0)

| Task nhóm | Effort | Notes |
|---|---|---|
| 0.A Monorepo/toolchain | M | Nền cho mọi thứ |
| 0.B Contract proto+codegen | M | Chặn 0.D/0.E |
| 0.C Data layer | S | |
| 0.D Web + Better Auth + tRPC (10 luật 1–9) | L | Nặng nhất mảng sản phẩm |
| 0.E Skeleton Go services | M | |
| 0.F **Sysbox node proof** | L | **Đường găng — khởi động ngày 1** |
| 0.G CI/CD | M | |
| **Total P0** | **L (2–3 tuần)** | Critical sub-path: 0.F (Sysbox) ∥ 0.B→0.D |
