# Phase 0 — Nền móng (Foundation)

**Mức chi tiết:** DETAILED · **Effort:** L (2–3 tuần) · **Blocks:** P1, P2, P3, P4 · **Blocked by:** — (không)

## Objective

Dựng bộ khung monorepo build/test/lint được end-to-end, hạ tầng dữ liệu (Postgres + Redis), auth thật (Better Auth login), skeleton 2 Go service nói chuyện qua gRPC contract, CI/CD, và **1 node kubeadm + Sysbox chạy được 1 pod unprivileged**. Kết thúc P0: có thể đăng nhập, có contract codegen 2 chiều, và chứng minh Sysbox hoạt động — mở đường cho engine ở P1.

**Không làm ở P0:** warm-pool, terminal streaming, nội dung lesson. Chỉ khung + chứng minh khả thi.

## Trạng thái (cập nhật 2026-08-08)

| Nhóm | Trạng thái | Ghi chú |
|---|---|---|
| 0.A Monorepo & toolchain | ✅ xong | Node **24 LTS + pnpm 11** thay vì Node 20 + pnpm 9 — Node 20 EOL 04/2026 |
| 0.B Contract-first (proto) | ✅ xong | Go sinh vào **`proto/gen/go`** (module dùng chung) thay vì `services/*/gen` — xem dưới |
| 0.C Data layer | ✅ xong | Chưa dùng sqlc (task 10 đặt sqlc ở dạng có điều kiện; Go chưa sở hữu bảng nào) |
| 0.D Web + Better Auth + tRPC | ✅ xong | Next.js 15.5 App Router dựng trên tầng dữ liệu 0.C; Better Auth + tRPC + đủ 9 luật bảo mật; 59 test web xanh |
| 0.E Skeleton Go services | ✅ xong | Thêm module **`services/shared`** (envx/logging/httpx) không có trong design §8 |
| 0.F Sandbox node | ✅ xong (cả task 27) | Cổng `04-verify-sysbox.sh` 8/8 xanh; Helm chart đã deploy **thật** 3 revision lên kubeadm v1.34.10 — 3/3 pod `1/1 Running` |
| 0.G CI/CD | ✅ xong — **run 31245735175 XANH toàn bộ** | 3 job đều xanh trên GitHub: `ci` + `secret-scan` + `images` (4 image đã push lên `ghcr.io/nghaiz/dlp-*`). Mất 5 run hotfix mới xanh — 4 gotcha thật: (1) pnpm/action-setup cấm khai version khi package.json đã có `packageManager`; (2) buf-setup-action không truyền version thì dùng default NƯỚNG CỨNG 1.50.0 chứ không phải latest → pin 1.72.0; (3) **input `.proto` bị smudge CRLF trên Windows làm protoc-gen-es nhả trailing whitespace vào JSDoc** → drift ping-pong dev↔CI, fix `*.proto eol=lf` trong .gitattributes (vụ 85ffccb trước là triệu chứng bệnh này); (4) install.sh master của golangci-lint mang checksum bộ version khác pin → cài qua `go install`. **Gotcha 5 & 6, cả hai lộ ở PR đầu tiên (PR #1, 2026-08-08) — cùng một họ: cấu hình đúng trên máy dev, sai trên runner.**

*Gotcha 6 — `buf breaking` không thấy `main` trên PR.* `fetch-depth: 0` tải đủ **lịch sử** nhưng KHÔNG tạo **local branch** `main`: trên PR, `actions/checkout` để HEAD detached ở merge commit và refspec của nó chỉ phủ ref đang checkout. buf resolve `branch=main` bằng cách clone local `.git` ⇒ `fatal: couldn't find remote ref main`. Trên máy dev không bao giờ thấy vì local `main` luôn có sẵn. Fix: bước `git fetch origin +refs/heads/main:refs/heads/main` (guard `if: github.ref != 'refs/heads/main'` — fetch vào branch đang checkout là lỗi cứng của git). Nhân tiện đổi cách chọn baseline từ **loại event** sang **vị trí** (`github.ref`): bản key theo `event_name` làm push lên nhánh feature rơi vào nhánh `HEAD~1`, chỉ soi được commit cuối thay vì cả nhánh.

*Gotcha 5 — gitleaks 403.* Job `secret-scan` thiếu `permissions: pull-requests: read`. Trên event `pull_request`, gitleaks-action chạy nhánh `ScanPullRequest` và gọi `GET /repos/.../pulls/{n}/commits`; thiếu quyền ⇒ **403 "Resource not accessible by integration"**, job đỏ **trước khi quét được dòng nào**. Im lặng suốt P0 vì mọi commit đều push thẳng `main` (nhánh khác, xanh thật) và secret-scan chưa phải required check. Khai `permissions:` là **đè toàn bộ** mặc định nên phải khai lại cả `contents: read`, không thì `actions/checkout` mất quyền đọc repo. Task 30 branch protection: **ĐÃ BẬT** — main require **hai** check (strict): "CI (TS + proto + Go)" + "Secret scan (gitleaks)". gitleaks thêm vào required ở đợt đóng P0; trước đó nó chạy nhưng đỏ vẫn merge được, tức cổng chống commit secret không gác gì. `enforce_admins:false` nên owner vẫn push thẳng được (R8) |

**Chín điểm lệch có chủ ý so với bản plan gốc** (lý do đầy đủ ở `proto/README.md`, `services/shared/README.md`, và acceptance criteria dưới):

1. **Code Go sinh từ proto vào `proto/gen/go`, không phải `services/*/gen`.** Hai service dùng chung đúng một contract; sinh vào từng service tạo hai bản sao byte-identical, vi phạm SSOT và cho phép chúng lệch nhau khi ai đó chỉ regenerate một bên.
2. **Thêm Go module `services/shared`.** `envx` + `logging` + `httpx` giống hệt nhau ở cả hai service; bản sao thứ hai sẽ lệch ngay lần đầu ai đó sửa một bên.
3. **`go build ./...` từ root không chạy được** — dùng `make go-build` (lặp qua module).
4. **`buf.gen.yaml`: `import_extension=js` → `none`, và PIN version cả 3 remote plugin** (`go:v1.36.11`, `grpc/go:v1.6.2`, `es:v2.13.0`). `packages/shared-types` là package **source-only** được webpack của Next bundle thẳng — specifier `.js` trong file sinh ra sẽ vỡ resolve ngay khi proto có import chéo. Pin version vì bản plugin nằm trong header file sinh ra, còn `make proto-check` fail trên **mọi** diff ⇒ không pin thì ngày buf phát hành bản mới, drift gate đỏ trên một PR chẳng liên quan gì tới proto. Diff codegen duy nhất khi đổi: dòng header.
5. **`apps/web/tsconfig.json` dùng `moduleResolution: bundler`** + `allowImportingTsExtensions` + `declaration: false` — hệ quả của (4): app tiêu thụ package source-only qua bundler chứ không qua output `.d.ts`.
6. **`getDb()` / `getAuth()` là lazy singleton — CẤM gọi `createDatabase()` / `betterAuth()` ở module scope.** Bước "Collecting page data" của `next build` import mọi route handler; trong docker build không có env ⇒ khởi tạo ở mức module giết chết build.
7. **`turbo.json` → `tasks.test.env` khai đủ 9 biến.** `envMode` strict lột sạch biến không khai ⇒ CI đỏ trong khi local xanh.
8. **Knob `RATE_LIMIT_TRUST_PROXY` (mặc định TẮT).** Chỉ tin `X-Forwarded-For` khi `=1`; mặc định **skip rate-limit và ghi log** thay vì tin một header giả mạo được. Enforce thật nằm ở Traefik (P3) — xem luật 5 dưới.
9. **Cookie refresh đặt `path=/api/auth`** (rộng hơn `/api/auth/refresh`) để `/api/auth/logout` xoá được nó — RFC 6265 path-match: `Set-Cookie` chỉ xoá được cookie khi path khớp.

**Bằng chứng lần cook 2026-08-08:** artifacts harness ở [`reports/harness/2026-08-08-p0-cook/`](reports/harness/2026-08-08-p0-cook/) — `verification`, `review-decision`, `risk-gate`, `adversarial-validation`, `context-snippets`.

## Tầng thực thi cô lập sandbox (dựng 2026-08-08, TRƯỚC khi P1 bắt đầu)

Không nằm trong task list gốc của P0 — thêm sau 2 audit bảo mật độc lập chỉ ra rằng cô lập đang phụ thuộc hoàn toàn vào việc code orchestrator **nhớ** set đúng field: một bug làm rơi `runtimeClassName` là root-in-pod thành root-on-node, và không gì phát hiện được. Đưa ràng buộc xuống **admission** biến task 17–21 của P1 từ "nhớ mà set" thành "pod spec phải tuân thủ policy". Chi tiết + bằng chứng thực nghiệm: [phase-1.md §1.D](phase-1.md).

- `ValidatingAdmissionPolicy` `platform-sandbox-isolation` (8 CEL) ép `runtimeClassName: sysbox-runc` + `hostUsers:false`, cấm `hostNetwork/hostPID/hostIPC`, `privileged`, `hostPath`. Kiểm chứng 5/5 kịch bản, trong đó ca quan trọng nhất là **pod Sysbox đúng chuẩn vẫn được cho qua** (policy không chặn oan P1).
- PSA `baseline` enforce trên `dlp-sandbox` (KHÔNG `restricted` — `restricted` đòi `runAsNonRoot` nên sẽ giết chính pod Sysbox).
- NetworkPolicy default-deny egress: pod thật bị chặn cả 4 đường (IMDS, apiserver, internet, LAN).
- RBAC tối thiểu per-service + `automountServiceAccountToken:false` cho web.
- `ResourceQuota` + `LimitRange` + `PriorityClass` cho 3 pod nền tảng.
- Rate limit tRPC **per-user** (khoá theo `ctx.user.id`, không theo IP) — chặn pod-bomb từ tài khoản hợp lệ.

**Ảnh hưởng tới cổng P0.F:** `04-verify-sysbox.sh` có 3 check là *đọc lại manifest* (`kubectl get` chính field vừa apply) — chúng chứng minh API server lưu đúng, không chứng minh runtime thực thi. Nay đã có admission đứng sau nên chúng không còn vô nghĩa, nhưng bằng chứng cô lập THẬT vẫn là `/proc/self/uid_map` (`0 3480748032 65536`) và `docker run` chạy được trong pod không-privileged. Viết lại 3 check đó thành proof runtime: **P3**.

## Đóng P0 (2026-08-08) — dọn tàn dư trước khi mở P1

Rà soát toàn bộ lịch sử P0 + code review 2026-08-07. C1, I1–I12, M1/M3/M4/M5/M8 đã vá ở `a32e27a`. Phần còn lại xử lý ở đợt đóng này:

| Hạng mục | Trạng thái |
|---|---|
| Contract pin nốt: RPC `ExtendSession` + `Session.revision` | ✅ — xem dưới |
| `make proto-breaking` (`buf breaking`) + wire vào CI | ✅ — `buf.yaml` khai `breaking: use: FILE` từ đầu P0 nhưng KHÔNG lệnh nào chạy nó; contract SSOT không có breaking-check là contract chỉ có trên giấy, và P1 chính là phase mở rộng proto |
| R3 — cookie `access_token` | ✅ **ĐÃ GỠ**. Nó write-only: `trpc/routers/session.ts` đã tự mint token `aud=orchestrator` ngay trước mỗi lần gọi gRPC, nên cookie kia là bearer credential nằm không trên máy user, TTL 15 phút, zero consumer. Token `aud=gateway` mà P1 cần là token KHÁC (buộc theo sessionId, đời bằng đời session) — xem phase-1 task 12 |
| R5 — `jwks.expiresAt` | ✅ thêm (migration `0002`, cột NULLABLE) + test gác. Thêm lúc bảng còn rỗng thì miễn phí; thêm sau khi rotation đã bật là migration trên khoá đang ký |
| `BETTER_AUTH_SECRET` + 2 OAuth secret | ✅ chuyển sang `secretKeyRef` (`templates/web-secret.yaml`) + `checksum/web-secret` để xoay secret có rollout thật. `web.env.existingSecret` cho đường prod (giá trị không đi qua `--set`) |
| gitleaks thành required check | ✅ — trước đó protection chỉ require `"CI (TS + proto + Go)"`, secret-scan đỏ vẫn merge được |
| M2 — log INFO trên endpoint chưa authz | ✅ hạ `Debug` (log-flood rẻ tiền + PII vô điều kiện) |
| M7 — `db:generate/migrate/studio` không nạp `.env` | ✅ `node --env-file-if-exists=.env` |
| `enforce_admins` | ❌ **cố ý để `false`** — owner vẫn push thẳng `main` được, bỏ qua CI. Gate chỉ ràng buộc đường PR |

**Ba điểm lệch mới (nâng "chín điểm lệch" ở trên lên mười hai):**

10. **`Session.revision` (int64).** Mọi cập nhật trên session đang chạy là read-modify-write từ tiến trình KHÁC tiến trình tạo nó (gateway gia hạn TTL trong khi reaper có thể đang reap). Không có revision thì ghi cuối thắng im lặng — gateway hồi sinh được một session vừa bị reap.
11. **RPC `ExtendSession`.** P1 task 13 yêu cầu gateway cập nhật `lastActive` cho idle-reap. Không có RPC thì việc đó buộc phải chui qua đường WS hoặc ghi thẳng Redis từ gateway — kênh thứ hai giữa gateway và orchestrator mà contract không mô tả, đúng thứ `contract-first-integration.md` cấm. Ngữ nghĩa **hai đồng hồ**: idle deadline gia hạn được, hard cap (từ `created_at`) thì không ⇒ heartbeat bị chiếm quyền cũng không giữ pod sống vĩnh viễn.
12. **Baseline của `buf breaking` khác nhau theo sự kiện CI.** PR so với `main`; push thẳng `main` so với `HEAD~1` — so với `main` lúc đang Ở TRÊN `main` là tự so với chính mình, tức cổng luôn xanh. Kèm `fetch-depth: 0` vì baseline là git ref, shallow clone không có.

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

> **Cập nhật 2026-08-08 — đã xong.** Ghi chú triển khai đáng nhớ: (a) route catch-all `app/api/auth/[...all]/route.ts` là **bắt buộc** — thiếu nó thì mọi endpoint Better Auth (kể cả sign-in) trả 404. (b) Refresh token nằm ở **bảng riêng `auth_refresh_tokens`**, tách khỏi session cookie: lưu SHA-256 (token thô không bao giờ chạm DB), rotation nguyên tử bằng **một câu `UPDATE`** (chống race double-refresh), replay token đã revoke ⇒ thu hồi **cả chuỗi hậu duệ** (RFC 6819 §5.2.2.3). (c) Migration `0001` chỉ **THÊM** `accounts`/`sessions`/`verifications`/`jwks`/`auth_refresh_tokens`; bảng `users` và cột `role` đã có sẵn từ 0.C ⇒ giữ nguyên quy ước 1 owner/bảng (task 11). (d) JWT plugin: `aud=orchestrator`, TTL 15m, `disableSettingJwtHeader` (token đi bằng cookie, không qua header — luật 8). (e) `/api/health` **không đụng DB** (probe phải xanh cả khi chưa có Postgres — xem task 27). (f) `NEXT_OUTPUT=standalone` chỉ bật **trong Docker**: trên Windows standalone cần symlink ⇒ `EPERM`.

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
27. Helm chart khung `infra/helm/platform` deploy được orchestrator + gateway + web lên cluster kubeadm (values self-host; giữ chỗ values cloud node pool). **Xong 2026-08-08 — đã deploy thật 3 revision, 3/3 pod `1/1 Running`, `/healthz` in-cluster 200 cả ba, `dlp_build_info` OK.** Quyết định trong chart: probe bám đúng contract từng service (web `/api/health:3000`, orchestrator `/healthz:8081`, gateway `/healthz:8083` với `ADMIN_ADDR=:8083`); **port admin của gateway KHÔNG lên Service** (metrics/healthz không phơi ra cluster); `betterAuthSecret` **bắt buộc** truyền qua `--set`, không có default trong git; `DATABASE_URL`/`REDIS_URL` **omit khi rỗng** — P0 chỉ cần web `Running`, route đụng DB trả 500 cho tới khi P1 có Postgres/Redis in-cluster (**có chủ ý**); `ORCHESTRATOR_GRPC_ADDR` tự suy DNS in-cluster.

### 0.G CI/CD

> **Cập nhật 2026-08-08 — file đã viết xong, `actionlint` sạch, 10/10 action tag verified qua GitHub API; CHƯA có run đầu tiên vì chưa push.** `.github/workflows/ci.yml` có **3 job**: `ci` (pnpm 11 / Node 24 → drift gate `make proto-check` → Postgres 16 + Redis 7 → migrate → `turbo` → Go qua `go.work` → `golangci-lint v2.12.2`), `images` (**matrix 4 image** — thêm `sandbox-base` so với bản gốc "3 image" — đẩy lên `ghcr.io/nghaiz/dlp-{web,orchestrator,terminal-gateway,sandbox-base}`, tag `sha-*` + `latest` trên `main`, chỉ chạy khi `ci` xanh), `secret-scan` (gitleaks, `fetch-depth: 0`). **Redis chạy bằng `docker run` chứ không phải khối `services:`** — `services:` của Actions không set được CMD nên không truyền được `--requirepass`.

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
- [x] Đăng ký + đăng nhập (email/pw) hoạt động; session cookie set; `/dashboard` chỉ vào được khi đã login. *(0.D — E2E bằng `curl`: đăng ký → đăng nhập → `/dashboard` 200 → logout → `/login` 200, không loop redirect.)*
- [x] OAuth Google/Microsoft đi tới màn consent (env placeholder OK). *(0.D — nút + provider config đã có, đúng mức plan yêu cầu. **Trung thực:** với client id placeholder thì KHÔNG tới được màn consent thật của Google/Microsoft — cần client id thật, để P1.)*
- [x] orchestrator + gateway trả `/healthz` 200 và `/metrics` có metric (`dlp_build_info` + metric runtime Go).
- [x] tRPC `session.*` gọi được orchestrator gRPC (mock). *(0.D — verify độc lập: HTTP 501 có cấu trúc ở đầu tRPC + log Go xác nhận RPC **chạm tới server**. RPC phía Go cố ý trả `Unimplemented` thay vì mock, xem 0.E.)*
- [x] Postgres migrate được (Drizzle Kit); Redis SET/GET/EXPIRE ok qua cả TS lẫn Go client.
- [x] Helm chart deploy 3 service lên cluster kubeadm 1-node; pod Running. *(task 27 — 3/3 pod `1/1 Running` trên `debian-sandbox` (K8s v1.34.10), `/healthz` in-cluster 200 cả ba, `dlp_build_info` OK. Web chưa có Postgres/Redis in-cluster ⇒ route đụng DB trả 500 tới P1 — có chủ ý.)*
- [x] `bash infra/host/04-verify-sysbox.sh` exit 0 (8/8 pass) — **cổng P0.F ĐÃ ĐÓNG XANH 2026-08-07** trên `debian-sandbox` (containerd 2.3.3, K8s v1.34.10). Lưu ý: check 8 (metadata `169.254.169.254`) xanh trên VM local là do NAT không định tuyến địa chỉ đó, KHÔNG phải do NetworkPolicy — trên cloud thật (Host B) check này sẽ WARN cho tới khi P1 task 20 / P3 siết NetworkPolicy. Nên đọc là "7 kiểm soát thật + 1 baseline môi trường".

**Bảo mật (luật §6 — testable):**
- [x] **Luật 1:** truy cập resource của user khác qua tRPC → 403 (test: user A gọi resource `ownerId=B`, chặn ở `assertOwnerOrAdmin`).
- [x] **Luật 2:** request với `Origin` lạ → không có CORS header cho phép; không reflect origin; header credentials không đi cùng wildcard. Allowlist đọc từ env, preflight đầy đủ + `Vary`. *(Test ở mức middleware-invocation + smoke `curl` thật.)*
- [x] **Luật 3:** payload có field thừa hoặc sai type → tRPC reject 400 (Zod `.strict()`). Không dùng Mongo ở đâu cả.
- [x] **Luật 4:** list request `limit=1000000` → server ép về ≤100 (`listInput` dùng chung).
- [x] **Luật 5:** body > 1MB → **413** (kèm đủ security header trên chính response 413). **Vế 429 chỉ enforce khi có trusted proxy** (`RATE_LIMIT_TRUST_PROXY=1`): mặc định ở P0 middleware **skip rate-limit và ghi log** thay vì tin `X-Forwarded-For` giả mạo được — enforce thật nằm ở Traefik (P3). Test phủ cả 3 case trust-proxy.
- [x] **Luật 6:** decode access token thấy `aud=orchestrator`, TTL 15m; refresh xoay ra token mới.
- [x] **Luật 7:** dùng access token ở endpoint refresh → 401; refresh cũ sau rotation → từ chối **và thu hồi cả chuỗi hậu duệ** (RFC 6819). Regression test: chuỗi rotation 3 tầng.
- [x] **Luật 8:** không endpoint nào nhận token qua query string; grep codebase 0 kết quả token-in-URL; token chỉ đi bằng cookie httpOnly + Secure + SameSite.
- [x] **Luật 9:** `curl -I` trang chính có đủ HSTS/CSP (nonce)/X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy. *(Test ở mức middleware-invocation + smoke `curl` thật.)*
- [x] **Luật 10 (nền):** proof pod chạy `runtimeClassName: sysbox-runc`, **KHÔNG privileged**; `id` trong pod = root nhưng UID map trên host ≠ 0 — `04-verify-sysbox.sh` 8/8 xanh 2026-08-07 (bằng chứng ghi lại; xem lưu ý về check 8 ở mục chức năng).

## Verify commands

```bash
# Toolchain + build
pnpm install && pnpm turbo run lint build test

# Go: KHÔNG chạy `go build ./...` từ root — root không phải module nên workspace mode
# từ chối pattern. Các target dưới lặp qua từng module, lấy danh sách từ `go list -m`.
go work sync && make go-build go-vet go-test go-lint

# Contract drift gate
make proto-check

# Contract breaking gate — buf.yaml khai `breaking: use: FILE` nhưng tới 2026-08-08
# mới có lệnh chạy nó. Baseline mặc định là main (đúng cho dev + PR); CI khi push
# THẲNG main phải đè, không thì nó tự so với chính mình = cổng luôn xanh.
make proto-breaking
BUF_BREAKING_AGAINST='.git#ref=HEAD~1' make proto-breaking

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

# Web (0.D) — 59 test: schema + mỗi luật 1..9 một file + regression
pnpm --filter @devops-platform/web test
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/health   # 200, KHÔNG đụng DB

# CI (0.G) — kiểm workflow trước khi push (chưa có run thật trên GitHub)
actionlint .github/workflows/ci.yml

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

# Helm deploy — `betterAuthSecret` BẮT BUỘC truyền qua --set (không có default trong git)
helm upgrade --install platform infra/helm/platform -f infra/helm/platform/values-selfhost.yaml \
  --set web.env.betterAuthSecret="$(openssl rand -hex 32)"
kubectl get pods   # web/orchestrator/gateway Running

# Secret KHÔNG được lọt vào Deployment (đợt đóng P0) — phải in ra 0
helm template platform infra/helm/platform -f infra/helm/platform/values-selfhost.yaml \
  --set web.env.betterAuthSecret=deadbeefsecret | awk '/^kind: Deployment/,/^---/' | grep -c deadbeefsecret

# Đường prod: Secret tạo ngoài băng, giá trị KHÔNG đi qua --set (nên không nằm lại
# trong shell history / `helm get values` / log CI). Chart sẽ không tạo Secret nữa.
kubectl create secret generic dlp-web-prod \
  --from-literal=BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  --from-literal=GOOGLE_CLIENT_SECRET=... --from-literal=MICROSOFT_CLIENT_SECRET=...
helm upgrade --install platform infra/helm/platform -f infra/helm/platform/values-selfhost.yaml \
  --set web.env.existingSecret=dlp-web-prod

# Image build local rồi nạp thẳng vào containerd (chart để pullPolicy: Never, không qua registry)
docker save dlp/orchestrator:dev | sudo ctr -n k8s.io images import -
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

### Rủi ro tồn đọng sau 0.D (code review 2026-08-08 — PASS_WITH_RISK, 0 critical, 8/10)

Không mục nào chặn P0; tất cả đều có chủ nhân ở phase sau.

| ID | Rủi ro tồn đọng | Xử lý |
|---|---|---|
| R1 | `middleware.ts` chỉ kiểm **sự tồn tại** cookie, không verify chữ ký ⇒ đây là redirect-guard, KHÔNG phải authz | Authz thật nằm ở tRPC (luật 1). Verify chữ ký ở middleware là ứng viên P1 |
| R2 | Rate-limit thực tế **OFF** ở P0 (mặc định skip khi không có trusted proxy) | Enforce ở Traefik P3; bật `RATE_LIMIT_TRUST_PROXY=1` khi đã có proxy tin cậy đứng trước |
| R3 | Cookie `access_token` **write-only** — chưa consumer nào đọc | ✅ **ĐÓNG 2026-08-08 — đã GỠ.** Không phải "chờ P1 dùng": `trpc/routers/session.ts` đã tự mint token `aud=orchestrator` ngay trước mỗi lần gọi gRPC ⇒ cookie kia zero consumer từ đầu. Token P1 cần là loại khác (`aud=gateway` + `sid`) — phase-1 task 12 |
| R4 | Cookie refresh path `/api/auth/*` rộng hơn mức tối thiểu | Đánh đổi có chủ ý (điểm lệch 9) — thu hẹp được nếu logout đổi sang xoá bằng route cùng path. **Còn mở** |
| R5 | Bảng `jwks` **thiếu cột `expiresAt`** | ✅ **ĐÓNG 2026-08-08** — migration `0002`, cột NULLABLE (NULL = khoá chưa có hạn, chế độ trước khi bật rotation), có test gác |
| R6 | Helm chart chưa đặt `securityContext` mức pod | **Còn mở, P3.** Đã hạ mức nghiêm trọng: pod sandbox nay bị `ValidatingAdmissionPolicy` + PSA baseline ép từ tầng admission (xem mục "Tầng thực thi cô lập"); phần còn thiếu là `securityContext` của 3 Deployment **nền tảng** (web/orchestrator/gateway), không phải của pod lab |
| R7 | Action CI chưa pin bằng SHA (`@v7`, `@v2`… là tag di động) | ✅ **ĐÓNG — xác minh 2026-08-10.** `21/21` dòng `uses:` trong `ci.yml` đều pin SHA 40 ký tự (`grep "uses:" | grep -vE "@[0-9a-f]{40}"` → rỗng). Việc này xảy ra dần qua các PR #17–#28 mà không ai cập nhật lại bảng, nên bảng ghi "còn mở" suốt trong khi rủi ro đã hết |
| R8 | `enforce_admins: false` — owner push thẳng `main` bỏ qua CI | **Cố ý.** Gate ràng buộc đường PR; siết khi có người thứ hai vào repo |

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
