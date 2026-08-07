# Phase 0 — Nền móng (Foundation)

**Mức chi tiết:** DETAILED · **Effort:** L (2–3 tuần) · **Blocks:** P1, P2, P3, P4 · **Blocked by:** — (không)

## Objective

Dựng bộ khung monorepo build/test/lint được end-to-end, hạ tầng dữ liệu (Postgres + Redis), auth thật (Better Auth login), skeleton 2 Go service nói chuyện qua gRPC contract, CI/CD, và **1 node kubeadm + Sysbox chạy được 1 pod unprivileged**. Kết thúc P0: có thể đăng nhập, có contract codegen 2 chiều, và chứng minh Sysbox hoạt động — mở đường cho engine ở P1.

**Không làm ở P0:** warm-pool, terminal streaming, nội dung lesson. Chỉ khung + chứng minh khả thi.

## Trạng thái (cập nhật 2026-08-07)

| Nhóm | Trạng thái | Ghi chú |
|---|---|---|
| 0.A Monorepo & toolchain | ✅ xong | Node **24 LTS + pnpm 11** thay vì Node 20 + pnpm 9 — Node 20 EOL 04/2026 |
| 0.B Contract-first (proto) | ✅ xong | Go sinh vào **`proto/gen/go`** (module dùng chung) thay vì `services/*/gen` — xem dưới |
| 0.C Data layer | ✅ xong | Chưa dùng sqlc (task 10 đặt sqlc ở dạng có điều kiện; Go chưa sở hữu bảng nào) |
| 0.D Web + Better Auth + tRPC | ⬜ chưa làm | `apps/web` hiện là package TS thuần giữ tầng dữ liệu; Next.js dựng lên trên nó |
| 0.E Skeleton Go services | ✅ xong | Thêm module **`services/shared`** (envx/logging/httpx) không có trong design §8 |
| 0.F Sandbox node | ✅ xong (trừ task 27) | Cổng `04-verify-sysbox.sh` 8/8 xanh; Helm chart task 27 chưa làm |
| 0.G CI/CD | ⬜ chưa làm | |

**Ba điểm lệch có chủ ý so với bản plan gốc** (lý do đầy đủ ở `proto/README.md`, `services/shared/README.md`, và acceptance criteria dưới):

1. **Code Go sinh từ proto vào `proto/gen/go`, không phải `services/*/gen`.** Hai service dùng chung đúng một contract; sinh vào từng service tạo hai bản sao byte-identical, vi phạm SSOT và cho phép chúng lệch nhau khi ai đó chỉ regenerate một bên.
2. **Thêm Go module `services/shared`.** `envx` + `logging` + `httpx` giống hệt nhau ở cả hai service; bản sao thứ hai sẽ lệch ngay lần đầu ai đó sửa một bên.
3. **`go build ./...` từ root không chạy được** — dùng `make go-build` (lặp qua module).

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

> **Cập nhật 2026-08-07 — Debian 13 Trixie + kubeadm + containerd (thay "k3s + Ubuntu").** Chi tiết bằng chứng: [design §5b](../reports/2026-08-07-devops-learning-platform-design.md). Tóm tắt: đọc **mã nguồn** `sysbox-deploy-k8s.sh` (docs của Sysbox lạc hậu hơn code) — `is_supported_distro()` có nhánh `debian`, distro lạ chỉ warn chứ không `die`, kernel gate non-Ubuntu là **≥5.5** (Trixie có 6.12), Debian dùng chung `bin/generic` với Ubuntu, và `crio-installer.sh` là tarball nên không phụ thuộc distro. Bỏ k3s vì Sysbox không hỗ trợ (phải build từ source). **Ghim K8s v1.34** — Sysbox chỉ hỗ trợ v1.32–v1.35, `stable` đã là v1.36.x. **Host Debian, image sandbox vẫn Ubuntu.**

24. Dựng **VM Debian 13 + cluster kubeadm 1-node** bằng bộ script lặp lại được ở [`infra/host/`](../../infra/host/README.md) (`setup-all.sh` chạy 00→04). Self-managed (KHÔNG GKE Autopilot). Cùng một bộ script + cùng distro cho **VM local (VMware)** lẫn **cloud VM** (`cloud-init.yaml`) ⇒ dev ≡ prod. Hướng dẫn cài từng bước: [`VMWARE-DEBIAN-SETUP.md`](../../infra/host/VMWARE-DEBIAN-SETUP.md). **POD_CIDR mặc định `10.244.0.0/16`, KHÔNG dùng `192.168.0.0/16` của Calico** — nó chồng lấn dải NAT/LAN phổ biến, Calico không SNAT gói tới địa chỉ trong pool nên pod mất đường về gateway (DNS treo timeout dù ra internet vẫn chạy). [`02-kubeadm-init.sh`](../../infra/host/02-kubeadm-init.sh) có cổng chặn tự phát hiện chồng lấn; trên VPC cloud dải 10.x dùng `POD_CIDR=172.20.0.0/16`. Chi tiết sự cố: [decision report §11.2](../reports/2026-08-07-debian-host-decision.md).
25. Cài **Sysbox** qua daemonset chính chủ `sysbox-install.yaml` ([`03-sysbox-install.sh`](../../infra/host/03-sysbox-install.sh)) — với `containerd.io` 2.3.x từ repo Docker, `is_containerd_with_userns()` trả true nên daemonset dùng userns containerd và **KHÔNG cài CRI-O**. Daemonset tự tạo `RuntimeClass sysbox-runc`. **Gotcha đã gặp thật (containerd 2.3.3):** RuntimeClass (object k8s) được tạo đúng, nhưng runtime **handler ở tầng CRI** thì KHÔNG — daemonset ghi section theo plugin ID đời 1.x còn containerd 2.x dùng config `version = 4` với ID mới, nên bỏ qua im lặng ⇒ pod kẹt `handler "sysbox-runc" is not known`. `03` giờ kiểm cả tầng CRI (`containerd config dump | grep sysbox-runc`); sửa bằng [`fix-containerd-handler.sh`](../../infra/host/fix-containerd-handler.sh). Chi tiết: [decision report §11.1](../reports/2026-08-07-debian-host-decision.md). Dự phòng: `SYSBOX_USE_CRIO=true` ép CRI-O.
26. **Proof pod** = [`04-verify-sysbox.sh`](../../infra/host/04-verify-sysbox.sh), 8 kiểm chứng tự động: `runtimeClassName` + `hostUsers:false`, `uid_map` (root-in-pod ≠ root-on-host), không `docker.sock`, drop ALL caps, không privileged, seccomp RuntimeDefault, **`docker run` chạy được trong pod không-privileged**, metadata endpoint. Fail bất kỳ mục nào → exit 1, **cổng P0.F đỏ**.
27. Helm chart khung `infra/helm/platform` deploy được orchestrator + gateway + web lên cluster kubeadm (values self-host; giữ chỗ values cloud node pool).

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
| Infra | `infra/host/**` (bootstrap host+cluster+Sysbox), `infra/k8s/**`, `infra/helm/**`, `images/sandbox-base/Dockerfile` (placeholder) |
| CI | `.github/workflows/**` |

**Sequencing để tránh đụng file:** 0.B (proto) phải xong trước 0.D/0.E dùng generated types. 0.C schema trước 0.D tRPC. 0.F độc lập, chạy song song ngay từ đầu (rủi ro cao nhất).

## Dependencies

- **Blocks:** toàn bộ P1–P4.
- **Blocked by:** không.
- **Nội bộ:** 0.B → (0.D, 0.E); 0.C → 0.D; 0.A → tất cả; 0.F song song (ưu tiên khởi động ngày 1).

## Acceptance criteria

**Chức năng:**
- [x] `turbo run lint build test` và `make go-build go-vet go-test` đều xanh từ clean checkout. **Lệch so với bản gốc:** `go build ./...` từ root KHÔNG chạy được — root repo không phải Go module, và ở chế độ workspace Go từ chối pattern nằm ngoài mọi module (`directory prefix . does not contain modules listed in go.work`). Makefile lặp qua từng module, danh sách lấy từ `go list -m`.
- [x] `make proto` sinh lại type Go + TS; chạy lại không tạo diff (drift gate xanh).
- [ ] Đăng ký + đăng nhập (email/pw) hoạt động; session cookie set; `/dashboard` chỉ vào được khi đã login. *(0.D — chưa làm)*
- [ ] OAuth Google/Microsoft đi tới màn consent (env placeholder OK). *(0.D — chưa làm)*
- [x] orchestrator + gateway trả `/healthz` 200 và `/metrics` có metric (`dlp_build_info` + metric runtime Go).
- [ ] tRPC `session.*` gọi được orchestrator gRPC (mock). *(0.D — chưa làm. RPC phía Go cố ý trả `Unimplemented` thay vì mock, xem 0.E.)*
- [x] Postgres migrate được (Drizzle Kit); Redis SET/GET/EXPIRE ok qua cả TS lẫn Go client.
- [ ] Helm chart deploy 3 service lên cluster kubeadm 1-node; pod Running. *(task 27 — chưa làm)*
- [x] `bash infra/host/04-verify-sysbox.sh` exit 0 (8/8 pass) — **cổng P0.F ĐÃ ĐÓNG XANH 2026-08-07** trên `debian-sandbox` (containerd 2.3.3, K8s v1.34.10). Lưu ý: check 8 (metadata `169.254.169.254`) xanh trên VM local là do NAT không định tuyến địa chỉ đó, KHÔNG phải do NetworkPolicy — trên cloud thật (Host B) check này sẽ WARN cho tới khi P1 task 20 / P3 siết NetworkPolicy. Nên đọc là "7 kiểm soát thật + 1 baseline môi trường".

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

# Go: KHÔNG chạy `go build ./...` từ root — root không phải module nên workspace mode
# từ chối pattern. Các target dưới lặp qua từng module, lấy danh sách từ `go list -m`.
go work sync && make go-build go-vet go-test go-lint

# Contract drift gate
make proto-check

# Hạ tầng dữ liệu: migrate + SET/GET/EXPIRE qua CẢ hai client
cp .env.example .env      # compose dùng ${VAR:?} — thiếu mật khẩu là dừng, không chạy bừa
docker compose up -d
pnpm --filter @devops-platform/web db:migrate
make smoke

# Service chạy thật
curl -s -o /dev/null -w '%{http_code}\n' localhost:8081/healthz           # 200 orchestrator
curl -s localhost:8081/metrics | grep dlp_build_info                      # có metric
curl -s -o /dev/null -w '%{http_code}\n' 127.0.0.1:8083/healthz           # 200 gateway (port admin)
curl -s -o /dev/null -w '%{http_code}\n' localhost:8082/ws/session/abc123 # 401 (chưa có authz — đúng ý đồ)
curl -s -o /dev/null -w '%{http_code}\n' localhost:8082/metrics           # 404 — metrics không ở port công khai

# Image
docker build -f services/orchestrator/Dockerfile -t dlp/orchestrator:dev .
docker build -f services/terminal-gateway/Dockerfile -t dlp/terminal-gateway:dev .

# Security header check (web chạy local)
curl -sI https://localhost:3000/ | grep -Ei 'strict-transport|content-security|x-frame|x-content-type|referrer-policy|permissions-policy'

# CORS không reflect
curl -s -H "Origin: https://evil.example" -I https://localhost:3000/api/trpc/me | grep -i 'access-control-allow-origin'  # phải KHÔNG match evil

# Dựng host + cluster + Sysbox (chạy TRÊN host Linux, không phải Windows)
bash infra/host/setup-all.sh

# Sysbox proof — CỔNG P0.F (8 kiểm chứng, exit 0 = xanh)
bash infra/host/04-verify-sysbox.sh
KEEP=1 bash infra/host/04-verify-sysbox.sh   # giữ pod lại để mổ xẻ khi đỏ

# Version phải nằm trong dải Sysbox hỗ trợ (v1.32–v1.35), KHÔNG được là v1.36+
kubectl version -o json | jq -r '.serverVersion.gitVersion'

# Helm deploy
helm upgrade --install platform infra/helm/platform -f infra/helm/platform/values-selfhost.yaml
kubectl get pods   # web/orchestrator/gateway Running
```

## Risk Assessment (P0)

| Rủi ro | Likelihood | Impact | Score | Mitigation |
|---|---|---|---|---|
| Sysbox không cài được / node OS không hỗ trợ (kernel, shiftfs) | 4 | 5 | **20** | **Đã hạ rủi ro 2026-08-07:** Debian 13 Trixie (kernel 6.12 — vượt gate 5.5 của trình cài đặt, và ≥5.19 ⇒ dùng idmapped mounts, KHÔNG cần shiftfs vốn chỉ có trên kernel Ubuntu) + kubeadm + K8s ghim v1.34 + `apt-mark hold`. [`00-preflight.sh`](../../infra/host/00-preflight.sh) chặn sớm mọi host không hợp lệ (WSL, thiếu systemd/sudo/curl, userns tắt, AppArmor chặn userns, kernel cũ). Nếu bí sau 3 lần → escalate hỏi user. |
| **Debian không được Nestybox test trên K8s** (chỉ Ubuntu được test) ⇒ không có vendor support | 3 | 4 | 12 | Quyết định dựa trên **mã nguồn** trình cài đặt chứ không phải docs (design §5b) — Debian nằm trong `is_supported_distro()`, dùng chung `bin/generic`, CRI-O là tarball. Cổng `04-verify-sysbox.sh` chạy NGAY sau khi cài ⇒ hỏng lộ ở P0 chứ không lòi ra ở P1. Dự phòng: `SYSBOX_USE_CRIO=true`. Escalate nếu cổng đỏ sau 3 lần. |
| **Cài nhầm K8s v1.36+** ⇒ Sysbox không hỗ trợ, hỏng âm thầm | 3 | 5 | 15 | `K8S_VERSION` ghim v1.34 + `apt-mark hold` trong `01`; `03` có cổng chặn version, thoát ngay nếu server ngoài dải v1.32–v1.35. |
| **containerd 2.x không đăng ký handler `sysbox-runc`** (lệch plugin ID config v4 vs section đời 1.x của Sysbox) ⇒ pod kẹt `ContainerCreating` | 4 | 4 | 16 | **ĐÃ GẶP & SỬA 2026-08-07** (decision §11.1). `03` kiểm `containerd config dump` bắt lỗi ngay ở P0; [`fix-containerd-handler.sh`](../../infra/host/fix-containerd-handler.sh) suy plugin ID từ entry `runc` nên không lạc hậu khi containerd lên đời. |
| **POD_CIDR chồng lấn dải mạng host** (mặc định Calico 192.168/16 nuốt NAT/LAN) ⇒ pod mất đường về gateway, DNS treo timeout | 4 | 4 | 16 | **ĐÃ GẶP & SỬA 2026-08-07** (decision §11.2). Mặc định đổi `10.244.0.0/16` + cổng chặn chồng lấn trong `02`. VPC cloud 10.x → `172.20.0.0/16`. Định vị: `diagnose-pod-network.sh`. |
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
