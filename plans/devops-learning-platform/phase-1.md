# Phase 1 — Sandbox Session Engine (MVP lõi)

**Mức chi tiết:** DETAILED · **Effort:** L · **Blocks:** P2, P3, P4 · **Blocked by:** P0 (đã đóng 2026-08-08)
**Soát lại:** 2026-08-09 — ba lane planner đọc lại repo + đo trực tiếp trên cluster lab. Bản 2026-08-07 sai ở nhiều chỗ; xem §"Đã sửa gì so với bản 2026-08-07".
**Soát lại lần 2:** 2026-08-09 (sau PR #22) — review đối kháng bản trên, 8 lỗi chặn/cao đã vá. Ba phát hiện đến từ **thực nghiệm chứ không phải suy luận**: trần quota đo trên cluster sống, hành vi tmux đa client đo trên tmux 3.4, và endpoint JWKS đọc từ `node_modules`. Xem §"Đã vá gì sau PR #22".
**⚠️ ĐÂY LÀ CRITICAL PATH.** 3 rủi ro high-score của toàn dự án tập trung ở đây.

## Objective

Xây engine dùng chung cho cả 3 trụ cột: người dùng đã đăng nhập → bấm "Start" → nhận **1 sandbox pod Sysbox cô lập trong < 1s** (từ warm-pool) → mở terminal xterm.js trong trình duyệt nối vào PTY của pod qua WSS, với **per-session authz** (không ai vào được shell của người khác). Session có TTL + reaper dọn. Sandbox chạy image `images/sandbox-base` với terminal UX cao cấp.

**Định nghĩa "done" P1:** 1 user claim được pod < 1s, gõ lệnh trong terminal thật, mất mạng rồi vào lại thì thấy đúng màn hình cũ, session tự hết hạn và pod bị reap, và một user khác KHÔNG thể nối vào session đó.

---

## Quyết định đã chốt (2026-08-09)

| # | Quyết định | Chốt |
|---|---|---|
| **D1** | **Transport token sandbox** | **Cookie httpOnly `dlp_sandbox`** (`Secure; HttpOnly; SameSite=Strict; Path=/ws`), KHÔNG subprotocol. XSS không ăn cắp được, và nhất quán với quyết định P0 `disableSettingJwtHeader: true`. **Hệ quả bắt buộc:** gateway phải **cùng origin** với `apps/web` ⇒ Ingress route `/ws/*` ở prod, reverse proxy gộp origin ở dev. Chi tiết: [`docs/ws-terminal-protocol.md`](../../docs/ws-terminal-protocol.md) §2. |
| **D2** | **Gateway có được chạm Redis không?** | **ĐỌC được, GHI thì không.** Comment `session.proto` cấm cụ thể *"ghi thẳng Redis từ gateway"* — nó cấm kênh **mutation** thứ hai, không cấm đọc. Gateway đọc `session:{id}` cho authz (rẻ, một lượt, không round-trip gRPC mỗi lần mở WS); mọi thay đổi trạng thái đi qua `ExtendSession`/`ReapSession` gRPC. |
| **D3** | **Reconnect giữa phiên** | **tmux.** Image cài tmux, gateway exec vào `tmux new-session -A -s dlp`. Mất mạng rồi vào lại thấy đúng màn hình cũ, scrollback còn, tiến trình đang chạy không chết. Không có tmux thì `pods/exec` mỗi lần attach sinh tiến trình MỚI — đó không phải reconnect, và với nền tảng học làm lab dài thì mất bài giữa chừng là UX hỏng. |
| **D4** | **`docker run hello-world` vs NetworkPolicy default-deny** | **Đổi AC của P1: chứng minh DinD offline.** Giữ default-deny nguyên vẹn. Chứng minh Sysbox DinD chạy được bằng `docker info` + `docker build` một image `FROM scratch` rồi `docker run` nó — không cần mạng, và đó đúng là thứ AC thật sự muốn kiểm. Registry mirror trong cluster để **P2** khi bài lab thật cần kéo image. Dòng `169.254.0.0/16` trong `egressExcept` không bao giờ được bỏ. |
| **D5** | **Token CNI Calico hết hạn mỗi 24h** | **CronJob `rollout restart ds/calico-node` mỗi 12h ngay, chuyển `tigera-operator` sau.** Xem R0 — đây là blocker đang sống, không phải rủi ro giả định. |
| **D6** | **Kiểu dữ liệu `pool:free`** | **LIST.** `LMOVE` là O(1) và FIFO nên pod cũ nhất được dùng trước ⇒ pod hỏng lộ sớm. Sửa cả 3 chỗ mô tả đang nói khác nhau (`docs/redis-key-namespace.md` "set/list", `redis-keys.ts` "Sorted set/list", `keys.go` không nói). |
| **D7** | **`rediskeys` sống ở đâu** | **Chuyển sang `services/shared/rediskeys/`.** Hiện nằm dưới `services/orchestrator/internal/` nên gateway (module Go khác) **không compile được** nếu import — đây là chặn ở compile, không phải rủi ro. Kéo theo: sửa đường dẫn vector trong `keys_test.go` từ 4 cấp `..` xuống 3. |
| **D8** | **Pod spec sandbox là SSOT ở đâu** | **Go builder `services/orchestrator/internal/k8s/podspec.go`.** Orchestrator phải tính tên/label/TTL động nên YAML tĩnh không đủ. `infra/k8s/pod-template-sandbox.yaml` (**file này chưa tồn tại**) chỉ dùng để test VAP thủ công, không phải nguồn sinh pod. Sửa bảng ownership cho khớp. |
| **D9** | **Migration Postgres do ai sở hữu** | **Drizzle giữ toàn bộ schema.** Một DB, một công cụ migration, một thứ tự. Go đọc/ghi `sessions_audit` bằng pgx query viết tay. Repo hiện không có sqlc/goose và không nên thêm. |
| **D10** | **Hash tag `{dlp}` cho Redis Cluster** | **Không thêm ở v0.** P1 dùng Redis đơn. Ghi giới hạn CROSSSLOT vào `docs/redis-key-namespace.md` để P3 không bất ngờ khi cân nhắc Cluster. |
| **D11** | **Số của hai đồng hồ** | `HARD_CAP=2h`, idle-window `15m`, `EXTEND_DEFAULT=300s`. Tất cả qua env, không hardcode. |
| **D12** | **Số biến thể image** | **Một image, điều khiển bằng build-arg** (`INCLUDE_PWSH=0`, `INCLUDE_DOCKER=1` mặc định). Tách slim/full chỉ khi đo được thời gian pull làm hỏng mục tiêu claim < 1s — YAGNI cho tới lúc đó. |
| **D13** | **Service-auth gateway → orchestrator** | **mTLS in-cluster + nhánh `system_component`** đã có sẵn trong `ReapSessionRequest.actor`. Không thêm key nào phải xoay vòng. Gateway không mint được JWT `aud=orchestrator` (private key JWKS nằm trong Postgres của Better Auth, chỉ `apps/web` chạm được). |
| **D14** | **Cách thực thi P1** | **Tuần tự từng chặng bằng `/t1k:cook`**, không fan-out `/t1k:team`. P1 có HARD-GATE thật (hai spike phải xanh mới được mở 1.B/1.C) và sáu rủi ro ≥ 15; chạy song song sớm sẽ vượt gate trước khi gate kịp đóng. Bản đồ ownership zero-overlap ở dưới vẫn giữ nguyên giá trị — nó là ranh giới file để mỗi chặng biết được phép chạm gì, không phải lời mời fan-out. |
| **D15** | **Khoá ký sandbox token** (bản trước bỏ trống — không task nào sinh ra nó) | **Dùng lại khoá JWKS của Better Auth, KHÔNG sinh khoá mới.** Đọc từ `node_modules` (better-auth 1.6.26): plugin `jwt()` phơi `GET /api/auth/jwks`, alg mặc định **EdDSA/Ed25519**, `signJWT` nhận `overrideOptions` ⇒ mint `aud=gateway` chỉ là một hàm mới cùng khoá cũ. Gateway verify bằng JWKS, cache theo `kid`, **refetch khi gặp `kid` lạ** (chịu được rotation không cần redeploy). Ép `alg=EdDSA` phía server, không đọc `alg` từ header token. Env mới **duy nhất**: `GATEWAY_JWKS_URL`. Giữ đúng lời hứa "không thêm key nào phải xoay vòng" của D13. Chi tiết: [`ws-terminal-protocol.md`](../../docs/ws-terminal-protocol.md) §2. |
| **D16** | **`POOL_TARGET` vs quota thật** | **`POOL_TARGET=1` trên lab.** Đo trực tiếp trên cluster 2026-08-09: `pods:10` nhưng LimitRange (`defaultRequest 512Mi/500m`, `default 1Gi/1cpu`) × quota (`requests 2Gi/2cpu`, `limits 4Gi/4cpu`) ⇒ trần **hiệu lực = 4 pod**. *Sửa 2026-08-09 sau khi thêm canary: quota `requests` nâng lên `2100m/2112Mi` — đúng 4 pod sandbox **cộng** phần của pod canary (10m/16Mi + biên). Để ở 2/2Gi thì canary không được admit đúng lúc có 4 pod sandbox ⇒ **báo động giả**, và đỏ-vì-quota trùng tín hiệu với đỏ-vì-CNI-chết nên chuông mất khả năng phân biệt. Trần đồng thời vẫn là 4, công thức không đổi.* Công thức phải nhớ: **`trần session đồng thời = quota_hiệu_lực − POOL_TARGET`**. `POOL_TARGET=3` cho đúng **1** user đồng thời rồi replenish chết vĩnh viễn vì quota. Không đụng LimitRange ở P1 — hạ nó xuống 256Mi thì dockerd + `docker build` có nguy cơ OOM và làm AC DinD đỏ theo kiểu khó chẩn đoán; đo RSS thật ở 1.E rồi mới bàn ở P3. |
| **D17** | **Bao nhiêu WS trên một session** | **`GATEWAY_MAX_WS_PER_SESSION=1`** (bản trước để 2). Đo thật trên tmux 3.4: hai client attach cùng session `dlp` ⇒ tmux ép **một** kích thước cửa sổ theo client hoạt động gần nhất — client2 (80×24) attach làm cửa sổ của client1 (200×50) **tụt xuống 80×23**, rồi lật qua lại mỗi keystroke. Tab thứ hai không "thêm terminal", nó **phá terminal đang có**. Trần này chặn *đồng thời*, KHÔNG chặn *reconnect* (WS đóng → `DECR` về 0, tmux session vẫn sống). Kèm theo: **tắt status bar tmux** (`set -g status off`) vì nó ăn đúng 1 dòng (200×50 → window 200×**49**) làm `stty size` lệch so với `rows` FE gửi. |

**Ownership 4 file `apps/web` nằm ngoài mọi lane nhưng bắt buộc phải sửa** → giao **lane gateway**: bên *phát* token nên là bên hiểu bên *verify* token.
`src/server/trpc/routers/session.ts` (phát sandbox token + set cookie) · `src/server/trpc/init.ts` (thêm `resHeaders` — hiện `TRPCContext` chỉ có `db`/`user`/`reqHeaders` nên **không Set-Cookie được từ procedure**) · `src/server/auth/jwt.ts` (thêm `mintSandboxTokenFor` — `aud=gateway` qua `overrideOptions`, **cùng khoá** với `mintAccessTokenFor`, xem D15) · `src/server/security/headers.ts` (CSP `connect-src` — **kiểm DevTools trước**: CSP3 cho `'self'` khớp cả `wss://` cùng origin nên rất có thể không phải sửa gì; đừng nới CSP vô cớ).

---

## Kiến trúc luồng (P1)

```
[Start] tRPC session.create ─► orchestrator.CreateSession (gRPC, aud=orchestrator)
                                  │  claim pod từ pool:free (Lua atomic một lượt)
                                  │  ghi session:{id} hash + session:{id}:pod (TTL)
                                  │  replenish pool async
                                  ▼
        BFF mint sandbox token (aud=gateway, sid=sessionId, exp=expires_at)
        → Set-Cookie dlp_sandbox (httpOnly, Path=/ws)  ← cần resHeaders trong TRPCContext
        → trả {sessionId, wsUrl}
[Browser xterm.js] ── WSS /ws/session/{id} (cookie, CÙNG ORIGIN) ─►
        terminal-gateway: 9 bước kiểm trước upgrade (ws-terminal-protocol.md §3)
                          ĐỌC redis session:{id} cho authz — không ghi (D2)
                          ── client-go NewFallbackExecutor(ws, spdy) ──► tmux ──► PTY
        stdin/stdout ⇄ WS binary frame ; resize ⇄ control JSON
        traffic thật → gRPC ExtendSession (mTLS, expected_revision)
Reaper (orchestrator): keyspace expiry + sweep định kỳ → xoá pod + Redis key (idempotent)
```

## Contract đã pin (không lane nào tự chế shape)

| Contract | SSOT | Ghi chú |
|---|---|---|
| gRPC | `proto/orchestrator/v1/session.proto` | 5 RPC, `Session.revision`, `expected_revision`, `hard_cap_reached`. CI có cổng `buf breaking` — **lane nào cũng KHÔNG được đổi breaking**. |
| WS wire | [`docs/ws-terminal-protocol.md`](../../docs/ws-terminal-protocol.md) | **MỚI 2026-08-09.** Nhúng nguyên văn vào brief cả lane gateway lẫn lane FE. |
| Redis key + **field** | `docs/redis-key-namespace.md` + `docs/redis-key-vectors.json` | Bản song sinh Go (`services/shared/rediskeys/`) và TS (`packages/shared-types/src/redis-keys.ts`), test hai bên đọc chung vector. **Bản cũ chỉ pin tên key, KHÔNG pin field** — phải bổ sung, xem 1.B0.3. |
| Sandbox token | D1 + D15 + `ws-terminal-protocol.md` §2 | `aud=gateway`, `sub=userId`, `sid=sessionId`, `exp=expires_at`. **Ký bằng khoá JWKS của Better Auth (EdDSA/Ed25519) — không khoá mới**; gateway verify qua `GATEWAY_JWKS_URL`. Dùng lại được trong TTL. |

**Field của hash `session:{id}` (pin mới, camelCase cho khớp `redis-keys.ts`):**
`userId` · `podName` · `namespace` · `status` · `tier` · `createdAt` · `expiresAt` · `revision` · `lastActiveAt`

**Key mới cần thêm:** `pod:{name}` (hash state machine) · `pool:claimed` (list) · `idem:{key}` (string, dedupe — proto BẮT BUỘC `idempotency_key` nhưng namespace hiện không có key nào cho nó) · `session:{id}:ws` (đếm WS đồng thời, cho luật 5).

---

# Task list

## 1.B0 — Prerequisite chặn cứng (làm TRƯỚC cả spike)

**1.B0.1 — Vá Calico CNI token 24h (D5).** `install-cni` là **initContainer** nên token SA 24h không bao giờ được refresh; hết hạn thì mọi pod mới `FailedCreatePodSandBox: ClusterInformation: connection is unauthorized`, trong khi pod cũ vẫn Running nên lỗi **ẩn hoàn toàn**. Bước 1: CronJob `rollout restart ds/calico-node` mỗi 12h, có log. Bước 2 (sau, không chặn P1): chuyển `tigera-operator`. Thêm **canary tạo-pod** vào cron/CI để lỗi lộ ngay thay vì lộ lúc demo. *Chạm: `infra/host/`, `infra/k8s/`. Effort: S.*

**1.B0.2 — Đưa Redis + Postgres vào cluster.** Hiện **không có trong cluster**, chỉ ở `docker-compose.yml` trên máy dev ⇒ orchestrator sẽ CrashLoop ngay khi gọi `RequireDataStores()`. Redis **phải bật `notify-keyspace-events Ex`** (hiện chưa bật ⇒ task reaper pub/sub sẽ không nhận event nào và im lặng) và `appendonly yes`; Postgres dùng named volume (`rules/docker-volume-discipline.md`). Điền `orchestrator.env.redisUrl/databaseUrl`. *Chạm: `infra/helm/platform/templates/`, `values-selfhost.yaml`, `docker-compose.yml`. Effort: M.*
> **Bổ sung sau khi thực thi 2026-08-09:** cluster kubeadm **không có StorageClass nào** — plan bản trước ngầm định có. Không có nó thì PVC Pending vĩnh viễn với `no persistent volumes available`, và đó là chặn cứng chứ không phải bất tiện. Đã thêm `local-path-provisioner` vào [`infra/host/05-cluster-addons.sh`](../../infra/host/05-cluster-addons.sh); `datastore.storageClassName` trỏ **tường minh** `local-path` thay vì dựa vào `is-default-class` vô hình. Kèm theo: **web cũng phải có `DATABASE_URL`**, không chỉ orchestrator — Better Auth lưu khoá JWKS trong bảng `jwks`, nên thiếu DB thì `/api/auth/jwks` (D15) không trả được khoá nào và toàn bộ G2 sập theo.

**1.B0.3 — Pin contract Redis mở rộng + chuyển `rediskeys` sang shared (D6, D7, D10).** Sửa `docs/redis-key-vectors.json` **TRƯỚC** để cả hai suite Go+TS đỏ, rồi mới bắt kịp hai bên — vector là thứ giữ hai bản song sinh khỏi trôi. Thêm field của `session:{id}` + 4 key mới vào `docs/redis-key-namespace.md`. Di chuyển package sang `services/shared/rediskeys/`, sửa đường dẫn vector trong test. *Chạm: `docs/redis-key-namespace.md`, `docs/redis-key-vectors.json`, `services/shared/rediskeys/**`, `packages/shared-types/src/redis-keys.ts`. **File chung 3 lane — làm tuần tự, không fan-out.** Effort: S.*

**1.B0.4 — Gộp origin cho web ↔ gateway (D1).** Prod: Ingress route `/ws/*` → Service gateway cùng origin với web. Dev: reverse proxy (Caddy/Traefik) trong `docker-compose.yml`. **Phải xong trước khi lane FE code**, nếu không FE viết xong mới phát hiện cookie không bao giờ được gửi. *Chạm: `infra/helm/platform/templates/`, `docker-compose.yml`. Effort: S.*

**1.B0.5 — Đường JWKS từ gateway tới web (D15).** Thêm `GATEWAY_JWKS_URL` vào **cả 4 nơi** cùng lúc (`internal/config`, `.env.example`, Helm `values.yaml` + `gateway-deployment.yaml`, `.github/ci.env`). *Đính chính sau khi thực thi: `make env-check` chỉ gác **3 trong 4** nơi cho service Go (code ↔ `.env.example` ↔ Helm deployment). Ràng buộc với `.github/ci.env` trong `scripts/env-check.mjs` chỉ chạy với `requireEnv()` của TypeScript, nên xoá `GATEWAY_JWKS_URL` khỏi `ci.env` vẫn cho cổng xanh. Nơi thứ tư là kỷ luật, không phải cổng — đừng tin vào cổng cho nó.* Prod trỏ Service in-cluster của web (`http://<release>-web:3000/api/auth/jwks`), dev trỏ `http://localhost:3000/...`. Kiểm bằng tay **trước** khi lane gateway code G2: `curl -s $GATEWAY_JWKS_URL | jq '.keys[0] | {kty,crv,alg,kid}'` phải trả `Ed25519`/`EdDSA` và một `kid`. Nếu endpoint 404 thì plugin `jwt()` chưa mount và toàn bộ G2 vô nghĩa — phát hiện ở đây rẻ hơn nhiều so với phát hiện lúc debug WS. *Chạm: `services/terminal-gateway/internal/config/`, `.env.example`, `infra/helm/platform/`, `.github/ci.env`. Effort: S.*

## 1.A — Spike khử rủi ro (HARD-GATE, chặn toàn bộ 1.B/1.C)

> Mục tiêu spike là **khử rủi ro**, không phải viết trước code thật. Code spike được phép xấu; cái phải đẹp là **báo cáo gotcha**.

### 1.A-1 — Spike WS ⇄ pod-exec (rủi ro #1 toàn dự án, score 20)

> **✅ Đã chạy 2026-08-09.** Kết quả + 6 gotcha: [`reports/2026-08-09-spike-ws-exec.md`](reports/2026-08-09-spike-ws-exec.md). Patch chốt: **client-go `v0.34.9`** chứ không `.10` — `.10` kéo `protobuf v1.36.12-pre` lệch với orchestrator, và một repo chỉ nên có một version protobuf.

**S1 — Dependency + exec chạy được.** Thêm `k8s.io/client-go` (minor khớp cluster: **v0.34.x** cho K8s 1.34.10) + `k8s.io/api`, `k8s.io/apimachinery` vào `services/terminal-gateway/go.mod` (hiện có **0 dependency k8s**). Viết `cmd/spike-exec/main.go` exec `/bin/sh -c 'echo hello'` vào pod có sẵn trong `dlp-sandbox`. Chốt patch bằng `go list -m -versions`, không chép số từ blog.

**S2 — Ba transport, đo và so.** Cờ `-transport=ws|spdy|fallback`. **Plan cũ chốt SPDY là lỗi thời:** `kubectl` mặc định WebSocket từ K8s 1.31; ở **1.34** (cluster của ta là v1.34.10) RemoteCommand-over-WebSockets là **beta bật mặc định** (`v5.channel.k8s.io`) và lên Stable ở 1.35. **Chốt dùng `NewFallbackExecutor(wsExec, spdyExec, httpstream.IsUpgradeFailure)`** — đúng khuôn mẫu `kubectl exec`, WS là đường chính, SPDY là lưới an toàn. Ghi kết quả vào `plans/reports/`.

**S3 — Bridge thật, người gõ được.** WS `/spike/{pod}` nối stdin/stdout ⇄ binary frame, resize qua control. Kèm `-client` mode đặt terminal local vào raw mode + bắt `SIGWINCH` để **một con người gõ thử mà không cần lane FE**.

**S4 — Ghi gotcha + đóng gate.** Viết `plans/reports/2026-08-XX-spike-ws-exec.md` trả lời đủ: hành vi `TerminalSizeQueue.Next()` trả `nil` (= "hết queue, đừng hỏi nữa" — trả nhầm khi channel đóng là cách resize chết âm thầm giữa phiên); lỗi chính xác khi set `tty=true` kèm `stderr=true` (**PTY chỉ có một luồng ra, apiserver từ chối**); close code THẬT của `SetReadLimit` (`coder/websocket` tự đóng bằng `1009`, không phải mã ứng dụng — quyết định pin `4413` hay `1009` vào spec phụ thuộc kết quả đo này); cách lấy exit code (`exec.CodeExitError`); half-close stdin ở v5 so với v4; transport nào thắng.

**Thư viện WS: `github.com/coder/websocket`, KHÔNG `gorilla/websocket`.** Gorilla **panic khi hai goroutine cùng `WriteMessage`** — bridge terminal có đúng bài toán đó (goroutine đọc-pod ghi binary, goroutine điều khiển ghi control JSON, goroutine keepalive ghi ping); với gorilla cả ba phải qua một write-mutex tự viết, quên một chỗ là panic trong production. `coder/websocket` có `context.Context` trên mọi thao tác (khớp `httpx` sẵn có) và writer an toàn đa goroutine. Ràng buộc còn lại: **một reader tại một thời điểm** ⇒ kiến trúc một-goroutine-đọc là bắt buộc.

> **Tiêu chí xanh (tất cả phải đạt trước khi mở G1):** (1) `fallback` executor attach được vào pod Sysbox trong `dlp-sandbox`; (2) `vim` + `htop` vẽ đầy đủ, không rác ANSI; (3) kéo cửa sổ → `stty size` trong pod khớp trong < 1s; (4) `exit` → WS đóng sạch, tiến trình thoát 0, `-race` không báo, không goroutine leak; (5) xoá pod giữa phiên → bridge báo lỗi rõ, không treo.

### 1.A-2 — Spike claim atomic (rủi ro #3, score 16)

> **✅ Đã chạy 2026-08-09.** Code: [`services/orchestrator/internal/pool/`](../../services/orchestrator/internal/pool/) · gotcha: [`README.md`](../../services/orchestrator/internal/pool/README.md). 20/20 xanh dưới `-race -count=20` trên Redis 7 thật.

**A1 — Chốt state machine.** `pool:free` = **LIST** (D6). State: `free → claimed → active → reaping → gone`, sống ở hash `pod:{name}` (`state`, `sessionId`, `updatedAt`); `pool:free`/`pool:claimed` chỉ là index.

**A2 — Viết `claim.lua`** (`internal/pool/claim.lua`, nhúng `go:embed`, nạp `SCRIPT LOAD`/`EVALSHA`). Một script làm trọn: `LMOVE pool:free pool:claimed` → `HSET pod:{name}` → `HSET session:{id}` → `SET session:{id}:pod` → `EXPIRE` cả hai → trả `podName`. Pool rỗng → trả sentinel `nil` để Go rẽ cold-path, **không phải lỗi**. *Không dùng `LMOVE` trần: move thì atomic nhưng 4 lệnh ghi sau đó thì không — crash ở giữa để lại pod nằm trong `pool:claimed` mà không có session.*
> **Đính chính sau khi thực thi (review đối kháng, 2026-08-09):** "một script Lua nên hoặc chạy trọn hoặc chưa chạy" là **SAI**. Redis Lua có **isolation**, KHÔNG có **rollback**: một `redis.call` lỗi ở giữa thì mọi ghi trước đó được giữ và replicate. Đo được: `EXPIRE` với ttl vô lý làm lỗi ở **lệnh cuối** ⇒ session ghi xong mà **không có TTL** (giữ pod vĩnh viễn) trong khi caller nhận error và retry. Script vì thế phải **tự hoàn tác** (`redis.pcall` + `undo()` trả pod về `pool:free`), và phải **kiểm `pod:{name}.state == "free"`** trước khi ghi — LIST không chống trùng, một tên pod lọt vào `pool:free` hai lần là **hai sinh viên vào chung một pod**, cả hai đều qua authz. Xem `internal/pool/README.md`.

**A3 — Test đua.** `N_POOL=50`, `N_G=200` goroutine claim đồng thời, `-race -count=20` (race chỉ hiện theo xác suất). **Xanh =** đúng 50 thành công, 150 trả "pool rỗng", **0 podName trùng**, `LLEN pool:free == 0`, `LLEN pool:claimed == 50`, không panic.

**A4 — Chạy trên Redis THẬT, không miniredis.** miniredis hỗ trợ Lua không đầy đủ (đặc biệt `LMOVE` + `redis.call` lồng nhau) ⇒ xanh trên miniredis mà đỏ trên Redis thật là guard không gác gì. Dùng Redis từ `docker-compose.yml`; `t.Skip` có log rõ khi `REDIS_URL` trống — **không giả vờ xanh**.

**A5 — Ghi gotcha.** `services/shared/rediskeys/README.md` hoặc `internal/pool/README.md`: `EVALSHA` sau khi Redis restart trả `NOSCRIPT` → phải fallback `EVAL`; giới hạn CROSSSLOT nếu sau này lên Cluster (D10).

## 1.B — Orchestrator: lifecycle + warm-pool + reaper

> **Tiến độ:** ✅ **1.B XONG** — B1–B4 (PR #26) + B5–B9 & B0′ (PR #27), cùng ngày 2026-08-09. Cả 5 RPC của contract đều có hành vi thật, không còn nhánh `Unimplemented` nào.
> *Xác minh lại 2026-08-10:* test Go **163 PASS / 0 SKIP** dưới `-race` với Postgres/Redis thật, và metric B9 sống trên cluster. Chi tiết: [`../reports/2026-08-10-audit-p0-p1.md`](../reports/2026-08-10-audit-p0-p1.md) · artifact: [`harness/2026-08-10-audit-p0-p1/`](reports/harness/2026-08-10-audit-p0-p1/).
>
> **Ba nợ bằng chứng của PR #27 đã đóng bằng SỐ ĐO, không bằng lập luận:**
> 1. **Reaper chạy thật trên cluster (tầng 2a).** Pod mồ côi tạo tay trong `dlp-sandbox` (label `app=sandbox`, `EXISTS pod:{name}` = 0): reaper **không đụng suốt 340 giây** rồi xoá ở vòng sweep đầu tiên sau khi hết `orphanGrace` 5 phút. `dlp_reaper_orphan_pods_total` 0→1, `sweep_failures_total` 0, warm-pool `sandbox-20ad99c1d909` **vẫn Running**. Cửa sổ 340s im lặng đó chính là guard "đừng giết pod đang sinh ra" được chứng minh bằng **quan sát** — trước đó nó chỉ là một comment. ⚠️ **Bốn tầng còn lại (1, 2b, 2c, 3) VẪN chưa có proof runtime.**
> 2. **`helm install` thật** — xem §"Còn để ngỏ": phép thử này lôi ra một lỗi CHẶN mà `helm template` không thể thấy.
> 3. **AC `claim p95 < 1s, ≥ 50 mẫu` ĐẠT:** 50 mẫu warm, **p95 = 0.090s**, đọc từ histogram của server. Công cụ: [`cmd/bench-claim`](../../services/orchestrator/cmd/bench-claim/) — nằm trong repo để đo lại được sau 1.E. *Số liệu trung thực kèm theo: cần **102** lượt `CreateSession` mới gom đủ 50 mẫu warm; **52** lượt rơi cold-path vì `POOL_TARGET=1` không kịp ấm lại giữa hai claim liên tiếp. Không AC nào bị vi phạm (AC chỉ nói nhánh warm), nhưng đó là câu trả lời thật cho "người thứ hai bấm Start ngay sau người thứ nhất chờ bao lâu" — và **chưa AC nào hỏi câu đó**.* p95 này đo với image `pause:3.10`, **phải đo lại sau 1.E**.
>
> **Bốn lỗ hổng mã của `unverifiedClaims` đã vá** (chi tiết trong artifact): M-6 đếm lặp pod `Terminating` — chuyển từ "suy luận" sang **tái hiện được** sau khi sửa test double cho khớp API server thật (Delete trên pod đã có `DeletionTimestamp` là no-op), kèm kiểm đột biến; `rest.Config.Timeout=30s` loại bỏ tiền đề của giả thuyết orphanGrace; `StreamDenyInterceptor` chặn stream RPC tương lai đi vòng qua B0′; và `TestOrphanGraceBaoTronReadyTimeout` ràng buộc `orphanGrace` với `pool.DefaultReadyTimeout` — hai hằng trước đây nằm ở hai package không gì buộc chúng đi cùng nhau.
>
> **⛔ B5 — CÔNG THỨC ĐÃ SỬA SO VỚI BẢN PIN.** Bản pin ghi `expires_at = min(now + extend_seconds, created_at + HARD_CAP)`. Đo được là công thức đó **kéo lùi hạn**: session tạo với `SESSION_TTL=1h`, heartbeat ĐẦU TIÊN với `EXTEND_DEFAULT=300s` hạ TTL từ 1h xuống 5m và đẩy `expires_at` **lùi 55 phút**. Ba hậu quả: (1) AC "đóng WS → nối lại cùng `{id}` trong TTL vào đúng pod cũ" gãy — cửa sổ nối lại thành `EXTEND_DEFAULT` chứ không phải `SESSION_TTL`; (2) BFF mint sandbox token với `exp = expires_at`, nên token **đã cấp** sống lâu hơn session và FE thấy đồng hồ đếm ngược nhảy giật lùi; (3) `EXPIRE` rút ngắn TTL hash ⇒ reaper tầng 1 bắn sớm 55 phút. **Công thức thật là `max(current, min(now + extend, created_at + HARD_CAP))`** — hạn chỉ tiến, không lùi.
>
> **B0′ (R25) đã có khung, cổng vẫn TẮT.** Interceptor + `PeerTrust` đã có; nhánh `system_component` bị **từ chối** khi `GRPC_REQUIRE_MTLS=false` (fail-closed), và `config.Load` **từ chối khởi động** khi ai đó bật `true` — vì service chưa có `grpc.Creds`/`ClientCAs` nào nên bật cờ = 100% RPC trả `Unauthenticated`, tức một cổng an ninh GIẢ. mTLS thật vẫn thuộc D13, làm cùng lane gateway.
>
> **B7 có TẦNG 2c ngoài ba tầng plan mô tả.** Ba tầng đã pin đều bỏ sót một chế độ hỏng: khi tầng 1 lỡ event (reaper offline lúc `helm upgrade`), session hết hạn để lại pod có hash `pod:{name}` **TTL = -1**, nằm trong `pool:claimed`, Pod vẫn ăn quota — mà hash TỒN TẠI nên không phải "mồ côi", không còn `session:*` để SCAN thấy, không nằm trong quarantine. Tầng 2c quét `pool:claimed` đối chiếu `pod:{name}.sessionId` với `EXISTS session:{id}`. Mỗi lần rollout orchestrator, mọi session hết hạn trong cửa sổ restart là −1 **vĩnh viễn** trên trần 4 pod nếu thiếu tầng này.
>
> **B8 kèm tự động hoá migration** — đóng món nợ "chạy tay qua `kubectl port-forward`" ở §"Còn để ngỏ": image `migrator` riêng (image runtime là Next.js standalone đã prune, không có drizzle-kit và npm đã bị gỡ có chủ ý) + Job Helm hook `pre-install,pre-upgrade`. `datastore-secret` cũng phải thành hook, nếu không Job không đọc được `DATABASE_URL` ở lần install ĐẦU TIÊN.
> Ba quyết định phát sinh khi thực thi, ghi lại để B5–B9 không đi ngược: (1) **`SESSION_TTL` chốt `1h`** (khoảng trống mà §"Còn để ngỏ" giao cho B3) — nằm dưới `HARD_CAP=2h` nên hai đồng hồ vẫn phân biệt được; (2) **`SANDBOX_IMAGE` mặc định `registry.k8s.io/pause:3.10`**, đổi bằng env khi 1.E lên ghcr — không sửa code; (3) **`ClaimSession` là đường ĐỌC LẠI idempotent**, không phải bước tạo thứ hai — sơ đồ luồng đã pin `CreateSession` claim pod ngay trong cùng lời gọi (BFF mint token với `exp=expires_at` ngay sau đó), nên mở đường tạo thứ hai ở đây là mời đúng cái pod thứ hai mà B3 và `claim.lua` đang chặn.

**B0′ — Auth cho cổng gRPC của orchestrator. ⚠️ CHƯA CÓ CHỦ TRƯỚC BẢN NÀY.** `grpc.NewServer()` hiện chạy **không interceptor, không mTLS, không verify token**: `user_id` trong mọi RPC là field **client tự khai**, trong khi comment của `session.proto` viết *"server kiểm object-level authz (luật 1) chứ không tin client"*. Kèm theo, chart chỉ có NetworkPolicy cho `dlp-sandbox`, **không** cho namespace platform (R24). Hệ quả cụ thể: bất kỳ workload nào tới được `:9090` đều gọi `CreateSession` với `user_id` bất kỳ và **cạn trần 4 pod** — DoS toàn nền tảng, không cần biết bí mật nào. *Rò dữ liệu thì KHÔNG*: `GetSession`/`ClaimSession` đòi cả `session_id` 128-bit lẫn `user_id` khớp.
> **Vì sao nó lọt tới tận đây:** D13 chỉ nói về đường **gateway → orchestrator** (mTLS + `system_component`), và đường đó thuộc B6/G7. Đường **BFF → orchestrator** chưa task nào, chưa AC nào, chưa risk nào nhắc tới. Đây là khoảng trống của PLAN, không phải lệch implement.
>
> **Giao cho B6** (nơi `oneof actor` bắt đầu cần phân biệt người gọi thật sự) — làm cùng lúc với mTLS của D13, không tách. Chấp nhận rủi ro tới lúc đó vì **chưa consumer nào gọi orchestrator**: `apps/web` chưa có client gRPC. Ngày `session.ts` (G12) nối vào là hạn chót. *Chạm: `services/orchestrator/internal/grpcserver/` (interceptor), `infra/helm/platform/templates/`. Effort: M.*

**B1 — `internal/k8s`: pod builder + client-go.** `rest.InClusterConfig()` với fallback kubeconfig cho dev. `BuildSandboxPod(name, sessionID)` sinh spec **tuân thủ đủ 8 CEL của VAP** — thiếu một field là admission từ chối, không phải runtime lỗi. *Effort: M.*

**B2 — Warm-pool manager.** Goroutine giữ `POOL_TARGET` pod `pool=free`, replenish async sau claim, backoff khi tạo pod fail. **`POOL_TARGET` mặc định 1 trên lab (D16)** — quota hiệu lực đo được là **4 pod**, và `trần session đồng thời = 4 − POOL_TARGET`. Đặt 3 thì chỉ phục vụ được **1** user rồi replenish bị quota chặn vĩnh viễn; đặt 1 thì phục vụ 3 user và pool vẫn luôn có sẵn 1 pod ấm để claim < 1s. Replenish khi chạm quota **không phải lỗi hệ thống** — log `WARN` + tăng `dlp_pool_replenish_quota_blocked_total`, không backoff vô hạn như lỗi API. Lỗi tạo pod khác phải log **nguyên văn message từ API server** (VAP reject có message rất rõ), không nuốt.
> **⛔ Thứ tự ghi khi replenish là luật cứng, không phải chi tiết.** `claim.lua` chỉ nhận pod có `pod:{name}.state == "free"`; pod nào không thoả bị đẩy sang `pool:quarantine` và **không bao giờ quay lại**. Nếu B2 `RPUSH pool:free` **trước** khi `HSET pod:{name} state=free`, một claim đồng thời rơi vào cửa sổ đó sẽ **cách ly vĩnh viễn một pod hoàn toàn tốt** — và mỗi pod mất đi là −1 trên trần 4 (D16). Bắt buộc: **`HSET pod:{name} state=free` xong mới `RPUSH pool:free`**, kèm một test đảo thứ tự để chứng minh nó đỏ. *(README của `internal/pool` §4 chỉ ràng buộc **đầu nào** của LIST — RPUSH giữ FIFO — chứ chưa ràng buộc thứ tự hash↔list; đây là vế còn thiếu.)* *Effort: M.*

**B3 — `CreateSession` + dedupe idempotency.** `SET idem:{key} {sessionID} NX EX 600`; trúng key cũ → trả lại đúng session cũ, **không tạo pod thứ hai**. `SANDBOX_TIER_UNSPECIFIED` → `InvalidArgument` (fail-closed theo comment proto). Pool rỗng → cold path + log `WARN` có đo latency.
> **⛔ `"claim: session da ton tai"` KHÔNG phải lỗi — nó là tín hiệu đọc-lại.** `claim.lua` chặn claim đè bằng `EXISTS session:{id}`. Nhưng nếu lời gọi Redis timeout ở **tầng mạng sau khi script đã chạy trọn**, caller nhận error và tin là thất bại; retry cùng `sessionID` đụng đúng guard đó. Coi nó là lỗi ⇒ rẽ cold-path ⇒ **tạo pod thứ hai** trong khi pod thứ nhất đã claim cho chính session đó, và pod thứ nhất rò vĩnh viễn (hash `session:{id}` tồn tại nên heuristic mồ côi của B7 không thấy). Đường `idempotency_key` **không** cứu ca này — nó dedupe ở *ngoài* `Claim()`, còn đây là retry *bên trong*. Bắt buộc: gặp error này → `HGETALL session:{id}`, có `podName` thì trả về như claim thành công. *Effort: M.*

**B4 — `ClaimSession` / `GetSession`.** TTL bắt đầu đếm **lúc claim, không phải lúc create**. `GetSession` với `user_id` lệch trả **`NotFound`, KHÔNG phải `PermissionDenied`** — `PermissionDenied` xác nhận session tồn tại, biến chính RPC thành oracle dò id. *Effort: M.*

**B5 — `ExtendSession` hai đồng hồ + optimistic lock.** `expires_at = min(now + extend_seconds, created_at + HARD_CAP)`; `expected_revision != 0 && != current` → `FailedPrecondition`; mọi lần ghi `INCR` revision **trong cùng một Lua script** với việc ghi field — đọc-rồi-ghi bằng 2 lệnh Go là tự tạo lại đúng race mà revision sinh ra để chặn. *Effort: M.*

**B6 — `ReapSession` idempotent + authz theo `oneof actor`.** Nhánh `user_id` phải khớp `session.user_id`; nhánh `system_component` chỉ chấp nhận trên listener in-cluster (chặn ở interceptor theo peer addr, **không tin field**). Session đã reap → trả **OK** kèm session cuối, không lỗi. Xoá pod `GracePeriodSeconds: 0` + bỏ qua `IsNotFound`. *Effort: M.*

> ⛔ **TẦNG THỨ TƯ CÒN THIẾU — pod CHẾT nằm lại trong `pool:free` và sẽ được phát cho sinh viên tiếp theo.** Phát hiện 2026-08-11 khi rà soát cụm sau sự cố VMware (chi tiết: [`reports/2026-08-11-verify-1f-terminal-fe.md`](reports/2026-08-11-verify-1f-terminal-fe.md)). Quan sát được, không phải suy luận:
>
> ```
> Redis:      pool:free = [sandbox-674a2a67af4a]   pod:{name}.state = free
> Kubernetes: phase = Failed, container terminated, exitCode 255
> ```
>
> `podspec.go` đặt `RestartPolicy: Never`, nên **mọi lần node reboot** là pod sandbox chuyển `Failed` vĩnh viễn. `claim.lua` chỉ hỏi `pod:{name}.state == 'free'` — nó **không hỏi apiserver**. Và không tầng nào hiện có phủ ca này: tầng 1 cần một `session:{id}` hết hạn (pod rảnh không có), `sweepOrphanPods` đòi hash **VẮNG** (hash này **CÓ**), `sweepGhostSessions` đòi có `session:{id}` (không có), tầng 2c quét `pool:claimed` (pod này ở `pool:free`), tầng 3 quét `pool:quarantine` (không ở đó). `IsTerminal()` **có tồn tại** trong `internal/k8s/pods.go` nhưng chỉ được gọi ở `waitReady` — tức lúc **tạo**, không bao giờ gọi lại.
>
> Với `POOL_TARGET=1` thì **sinh viên ĐẦU TIÊN bấm Start sau mỗi lần reboot nhận đúng pod chết**. Đã dọn tay trên cụm (xoá pod + `LREM pool:free` + `DEL pod:{name}`; warm-pool dựng lại pod sạch trong 5s). **Bản vá đúng — chưa làm:** tầng sweep thứ 4 quét `pool:free` đối chiếu phase với apiserver, cùng khuôn idempotent với ba tầng kia. *Effort: S.*

**B7 — Reaper hai tầng.** Tầng 1: subscribe `__keyevent@0__:expired`. Tầng 2: **sweep định kỳ bắt buộc có** (`REAP_INTERVAL=60s`) — keyspace notification là *best-effort*, mất event khi reaper offline là mất pod vĩnh viễn. Sweep dọn cả **pod mồ côi** (label `app=sandbox` mà `pod:{name}` không tồn tại) và **session ma** (`session:{id}` còn mà pod đã biến mất → chuyển `FAILED`).
> **⛔ Tầng thứ ba bắt buộc: dọn `pool:quarantine`.** Pod bị `claim.lua` cách ly **vẫn là Pod đang chạy** trong `dlp-sandbox`, vẫn ăn quota — nhưng nó **vẫn có** hash `pod:{name}` nên không phải "pod mồ côi", và không có `session:{id}` nào trỏ tới nên không phải "session ma". Không nhánh nào ở trên chạm được nó. Với trần 4 pod (D16), ba lần cách ly là nền tảng chết mà không lỗi nào nói vì sao. Sweep phải: `LRANGE pool:quarantine` → xoá Pod (bỏ qua `IsNotFound`) → `DEL pod:{name}` → `LREM pool:quarantine`. Idempotent như mọi nhánh reaper khác. *Effort: M.*

**B8 — Audit Postgres (D9).** Ghi `created/claimed/extended/reaped/failed` vào `sessions_audit` (migration bằng **Drizzle**, query bằng pgx). **Chỉ audit, không phải state** — bảng này không được có cột nào trả lời "session X đang chạy ở pod nào" (`plan.md` §4 no-derived-fields). Lỗi ghi → log `ERROR` + counter, **RPC vẫn thành công**; audit không được chặn đường claim. *Effort: M.*

**B9 — `/metrics`.** `dlp_claim_duration_seconds` (histogram, để đo p95 < 1s), `dlp_pool_free_size`, `dlp_pool_replenish_failures_total`, `dlp_reaper_orphan_pods_total`, `dlp_cold_path_total`, **`dlp_pool_quarantine_size`** (gauge). *`README.md` của `internal/pool` đã hứa "B9 đếm nó" nhưng danh sách này trước đó không có — nghĩa vụ nằm ở tài liệu không ai đọc lúc code. Quarantine dài ra là tín hiệu **duy nhất** cho biết có nguồn nào ghi sai vào `pool:free`, và mỗi mục là **−1 trên trần 4** (D16).* *Effort: S.*

## 1.C — Terminal-gateway: WS ⇄ exec + per-session authz

> **Tiến độ:** ✅ **LANE GATEWAY XONG.** 1.C-1 (G1, G2, G3, G11, G13 + bước i của G8) 2026-08-10 · 1.C-2 (G4–G6) 2026-08-10 · G12 2026-08-11 · **1.C-3 (G7–G10) 2026-08-11**. Còn lại của lane này chỉ là **1.C-4 — mTLS (D13/R13/R25)**, tách chương có chủ ý; xem dưới.
>
> Chặng này cố ý **upgrade thật rồi đóng ngay `4500`** thay vì dừng trước upgrade: một bộ acceptance chỉ toàn ca ĐỎ không phân biệt được "chặn đúng chỗ" với "chặn tất cả". Ca 101 là đối chứng, và nó là ca duy nhất chứng minh chín bước kia có thể MỞ.
>
> **Bốn quyết định phát sinh khi thực thi:**
> 1. **Biến env thứ năm — `GATEWAY_TOKEN_ISSUER` — là KHOẢNG TRỐNG CỦA PLAN, không phải env thừa.** G11 liệt kê đúng 4 biến mới của P1 và không có nó, trong khi contract §2 lại bắt kiểm `iss`. Không suy ra được từ `GATEWAY_JWKS_URL`: trong cluster JWKS là DNS **nội bộ** (`http://<release>-web:3000/…`) còn `iss` là URL **công khai** trình duyệt thấy — cắt đuôi `/api/auth/jwks` của cái này để lấy cái kia là suy luận chạy được ở dev rồi **401 toàn bộ ở prod**. Chart lấy nó từ đúng `web.env.betterAuthUrl` nên không đẻ ra hằng số thứ hai. Bỏ check `iss` (đường còn lại) là bỏ một vế của luật 6.
> 2. **`REDIS_URL` thành biến BẮT BUỘC của gateway** (cùng lý lẽ `RequireDataStores`): thiếu nó thì mọi handshake trả 500 **sau khi đã qua hết phần verify token**, tức triệu chứng nằm cách nguyên nhân rất xa. Ngược lại, gateway **KHÔNG ping Redis lúc khởi động** — mất Redis là mất khả năng mở phiên MỚI, không phải mất cả tiến trình, và pod phải lên `Ready` để kubelet thôi restart nó trong lúc Redis rollout.
> 3. **Bước i (trần WS) phải là Lua, không phải `INCR` rồi `EXPIRE` từ Go.** Gateway chết giữa hai lệnh đó để lại bộ đếm **không có TTL**, mà `DECR` thì nằm trong defer của một tiến trình đã chết ⇒ session khoá **vĩnh viễn** ở trạng thái "đang mở ở tab khác". Script dùng `pcall` + tự hoàn tác, đúng khuôn `claim.lua` — Redis Lua có isolation, **không có rollback** (bài học 1.A-2).
> 4. **`websocket.Accept` phải đặt `InsecureSkipVerify: true`, và đó KHÔNG phải nới lỏng.** Kiểm mặc định của `coder/websocket` so `Origin` với `r.Host`, sai ở đúng topology mà D1 bắt buộc: gateway ngồi **sau** reverse proxy gộp origin nên `Host` nó thấy (`platform-gateway:8082`) không bao giờ là origin trình duyệt gửi. Để nguyên thì **mọi handshake hợp lệ trả 403**. Phép kiểm được dời lên bước a, nơi đọc được allowlist thật.
>
> **⛔ Một test alg-confusion đã suýt là tautology — chỉ KIỂM ĐỘT BIẾN mới lôi ra.** Nới allowlist thành `{EdDSA, HS256}` mà hai test "từ chối alg=none/HS256" **VẪN XANH**: token HS256 khi đó đi tiếp tới `sig.Verify` và chết vì go-jose từ chối dùng một `ed25519.PublicKey` làm secret HMAC — tức chúng đo một tầng phòng thủ khác với tầng chúng tự nhận là đang đo, và ngày ai đó truyền raw bytes vào `Verify` là tầng đó biến mất mà không test nào đỏ. Đã thêm ca bám đúng tính chất **thứ tự**: token sai `alg` phải chết TRƯỚC khi gateway đi hỏi JWKS, đo bằng **đếm hit endpoint JWKS**. Bảy đột biến (bỏ check `aud`, nới `alg`, bỏ bước e, bỏ bước g, bỏ `PEXPIRE` trong Lua, bỏ sàn refetch, log token) đều làm đúng test tương ứng ĐỎ.
>
> **⛔ Ba cổng CI đỏ ở PR, cả ba là phát hiện thật — ghi lại vì mỗi cái là một họ lỗi.**
> 1. **`SCRIPT FLUSH` là lệnh TOÀN SERVER, và nó vượt qua mọi cách cô lập test đang có.** Test mới của gateway (`TestScriptSongSotSauScriptFlush`, gác đường EVALSHA→EVAL của bài học A5) xoá cache script của **mọi package ở mọi module** dùng chung Redis — bảng phân bổ DB (11–15) cô lập được KEY, không cô lập được cache script. Nó làm đỏ `TestClaimIdempotentDocLaiKhiMatReply` bên orchestrator, package mà chặng này không chạm một dòng. Nguyên nhân gốc **nằm ở test kia, không ở gateway**: hook của nó nuốt reply của cả lời gọi trả `NOSCRIPT` — tức lời gọi mà script CHƯA chạy — nên go-redis mất đường rơi về `EVAL` và test đòi phục hồi một state chưa từng được ghi; hook tự mâu thuẫn với comment của chính nó. Ẩn suốt vì `internal/lifecycle` chạy trước và luôn nạp sẵn `claim.lua`. Vá bằng guard `err != nil → trả thẳng`, kiểm đột biến xác nhận. **Bài học chung: thêm một lệnh toàn-server vào một suite chạy song song thì phải soát các suite khác — không cổng nào ép chúng độc lập.**
> 2. **`required` cho `REDIS_URL` trong chart nghe như fail-closed tốt, thực ra là hồi quy.** `values.yaml` và `values-cloud.yaml` để `datastore.enabled: false` (bản cloud-shaped) nên `helm template` **ABORT** trên hai bộ đó. Tôi chỉ thử hai nhánh **tự thiết kế** thay vì ba bộ values **CI thật sự render** — đúng loại "cổng chưa từng chạy trên đường CI" mà chính workflow cảnh báo trong comment của nó. Gỡ `required`; cổng thật nằm ở Go (`config` từ chối khởi động, có test + đột biến), và cổng thứ hai ở tầng template chỉ làm chart lệch khỏi khuôn orchestrator đang dùng cho cùng biến.
> 3. **Vá secret ở commit tip là CHƯA ĐỦ.** `gitleaks-action` trên event `pull_request` quét cả **dải commit** của PR, nên một hằng đã xoá ở tip vẫn bị bắt trong lịch sử nhánh. (Hằng đó là `Sec-WebSocket-Key: dGhl…` — nonce ví dụ của RFC 6455, không phải secret, nhưng **đúng hình dạng** rule `generic-api-key` tìm: base64 22 ký tự cạnh một tên chứa chữ "Key". Vá bằng cách **sinh** nonce, không nới allowlist.)
>
> ---
>
> ### 1.C-2 — cầu exec (G4+G5+G6) ✅ XONG 2026-08-10, **có chứng minh trên cluster thật**
>
> `internal/podexec` nối kết nối đã qua authz vào PTY của pod. Khác 1.C-1 ở đúng một điểm quan trọng: chặng này **đã chạy trên cluster**, không chỉ trong test.
>
> **Chín phép kiểm end-to-end trên lab** (session tạo qua **gRPC `CreateSession` thật**, pod là pod thật vừa claim từ warm-pool — KHÔNG seed Redis bằng tay):
> 1. `CreateSession` → `session=9c5a18c8…`, `pod=sandbox-7d69d4975fe5`, `status=CLAIMED`.
> 2. control `ready` mang đúng `podName` orchestrator vừa claim, `expiresAt` RFC3339, `maxFrameBytes=32768`.
> 3. **GÕ ĐƯỢC LỆNH THẬT:** `echo BANG-CHUNG-<nonce>` → pod trả lại đúng marker.
> 4. **`stty size` trong pod = `34 120`** — khớp TUYỆT ĐỐI `cols`/`rows` của frame `init`, **không lệch 1**. Đây là phép đo đóng cả hai thứ cùng lúc: `init`-trước-dial của G6, và `set -g status off` của E4.
> 5. `tmux ls` thấy session `dlp` ⇒ gateway attach qua tmux (D3).
> 6–8. Đóng WS rồi mở lại: vào **đúng pod cũ**, và `tmux capture-pane -p -S -50` **vẫn thấy dấu vết ghi trước khi ngắt** ⇒ nối lại là PHIÊN THẬT, không phải shell mới. Trần 1 WS chặn đồng thời mà không chặn reconnect.
> 9. **`ReapSession` giữa phiên → close code `4404`**, không phải `1000`. Đây chính là chế độ hỏng mà spike đánh dấu **CHẶN G5**: `exit 137` của pod bị xoá trùng khít với `kill -9` hợp lệ, nên nếu không tra Redis thì FE hiểu thành "tự gõ exit, đừng retry".
>
> **Bốn quyết định phát sinh:**
> 1. **`rest.Config.Timeout` PHẢI là 0 cho đường stream.** Nó chảy vào `http.Client.Timeout` — deadline **tuyệt đối** trên cả vòng đời request, không phải idle-timeout. Orchestrator đặt `30s` và đúng cho nó (một `Get` treo từng suýt làm reaper xoá nhầm pod); cùng con số đó ở gateway nghĩa là **mọi phiên terminal chết đúng 30 giây sau khi mở**, bất kể sinh viên đang gõ gì. Đây là cùng cái bẫy mà `httpx.NewStreamingServer` đã tách khỏi `NewServer`, ở đầu ngược lại của kết nối.
> 2. **`ready` chỉ phát khi có bằng chứng đã attach** — byte stdout ĐẦU TIÊN, cộng lưới `attachGrace` 2s cho lệnh im lặng. `ready` theo contract §5 nghĩa là "đã attach vào pod thật"; phát nó rồi mới báo lỗi là nói dối FE: nó vẽ terminal, tắt spinner, rồi mới nhận close — người dùng thấy một terminal chớp lên rồi biến mất.
> 3. **`hardCapAt` của `ready` CỐ Ý VẮNG dù contract §5 liệt kê nó.** Gateway không tính được mốc đó: nó `= createdAt + HARD_CAP`, mà `HARD_CAP` là config của **orchestrator**. Thêm một `GATEWAY_HARD_CAP` là dựng hằng số thứ hai cho cùng một con số — đúng thứ phase-1 đã trả giá vài lần. Đường đúng là **G7** (`hard_cap_reached` tới từ `ExtendSession`). FE dùng `expiresAt` cho đồng hồ đếm ngược, đủ cho mọi thứ nó cần ở chặng này.
> 4. **`GATEWAY_EXEC_COMMAND` rỗng → service TỪ CHỐI khởi động.** Rỗng nghĩa là apiserver nhận `command: []` và chạy `CMD` của image, tức `sleep infinity` (1.E) — pod attach "thành công" rồi terminal treo câm. Fail-fast thay vì để lỗi đó lộ ra ở tận trình duyệt.
>
> **⛔ MÓN NỢ MỞ RA TỪ CHÍNH PHÉP CHỨNG MINH NÀY:** vì G12 chưa có, không ai mint được cookie `dlp_sandbox` thật, nên prover **tự đóng vai bên phát token** (sinh cặp Ed25519, phục vụ JWKS riêng, gateway được `--set gateway.env.jwksUrl` trỏ vào đó). Đổi **duy nhất** bên phát token; toàn bộ pipeline authz + cầu exec chạy nguyên vẹn. Đã trả cấu hình lab về mặc định kế thừa ngay sau khi đo (`jwksUrl=''` ⇒ `http://platform-web:3000/api/auth/jwks`). **Vế còn thiếu vẫn là G12**, và nó cũng là hạn chót của R25.
>
> **⛔ MÓN NỢ THỨ HAI — cùng họ với `--set sandboxImage` đã đóng ở PR #31:** release lab đang chạy gateway tag **`dev-4030577`** (dựng từ nhánh, side-load bằng tay) chứ không phải một tag `sha-*` do CI đóng. Đóng nợ ngay sau khi PR merge, theo đúng thứ tự đã dùng ở 1.E-1 — **side-load TRƯỚC, `helm upgrade` SAU**: `docker save` tag `sha-<merge>` → `scp` → `ctr -n k8s.io images import` → `helm upgrade --reset-then-reuse-values --set gateway.image.tag=sha-<merge>`.
>
> **Cổng chống DoS của JWKS là SÀN THỜI GIAN, không phải `singleflight`.** "Refetch khi gặp `kid` lạ" (D15) mà không có sàn là một cần gạt DoS công khai vào `apps/web`: 200 token mang 200 `kid` bịa ra = 200 lượt fetch. `singleflight` chỉ gộp các lượt **đồng thời**; các lượt này đi **lần lượt** nên nó không thấy gì cả. Kèm `lastAttempt` đếm cả lần THẤT BẠI — nếu chỉ đếm lần thành công thì đúng lúc `apps/web` yếu nhất, gateway đạp mạnh nhất.

**G1 — Khung handler + Origin + subprotocol.** Pipeline pre-upgrade: allowlist `Origin` (`GATEWAY_ALLOWED_ORIGINS` — đây là thứ đóng CSWSH, bắt buộc vì handshake WS không chịu CORS), kiểm client chào `dlp.terminal.v1`, rồi mới upgrade và echo lại đúng một subprotocol. **Request VẮNG header `Origin` thì CHO QUA** (contract §3a) — trình duyệt luôn gửi `Origin` nên CSWSH vẫn đóng kín, còn fail-closed ở đây sẽ chặn `wscat`/`websocat`/test e2e/probe vận hành, tức chặn chính bộ acceptance IDOR ở dưới. Bước này đọc là *"có `Origin` thì phải đúng"*, không phải *"phải có `Origin`"*. Unit test cả hai ca: vắng → qua, sai → 403. *Chạm: `internal/wsroute/`, `internal/ws/`. Effort: M.*

**G2 — Verify sandbox token (luật 6 + 8, D15).** Đọc token **chỉ từ cookie `dlp_sandbox`**; có unit test khẳng định query string bị **bỏ qua và bị từ chối**. Verify bằng **JWKS của Better Auth** lấy từ `GATEWAY_JWKS_URL` (1.B0.5): cache theo `kid`, **refetch khi gặp `kid` lạ** (rotation không cần redeploy), có TTL cache + single-flight để một trận `kid` lạ không thành DoS vào web. **Ép `alg == EdDSA` phía server** — tuyệt đối không đọc `alg` từ header token (đó là đường `alg=none`/confusion kinh điển). Rồi ép `aud == "gateway"`, `exp` chưa qua, `iss` khớp, `sub`/`sid` không rỗng. Sai → **401 trước upgrade**. *Chạm: `internal/authz/token.go`, `internal/authz/jwks.go`. Thư viện: `go-jose/go-jose/v4` hoặc `lestrrat-go/jwx/v3` (cả hai đỡ Ed25519 — chốt bằng `go list -m -versions`, không chép từ blog). Effort: M.*

**G3 — Per-session authz hai vế (luật 10 + 1).** Đọc Redis `session:{id}` bằng helper shared (D2, D7 — không nối chuỗi tay). **Vế 1** `token.sid == {id}` trong URL, **vế 2** `hash.userId == token.sub`, và `status ∈ {CLAIMED, RUNNING}`. Lệch bất kỳ vế nào → **403 trước upgrade**. Log `Warn` **có rate-limit/sampling** — endpoint public, log mỗi request là DoS vào quota log. *Effort: M.*

**G4 — Nối pod exec.** `NewFallbackExecutor` theo kết quả spike, exec vào `hash.podName`/`hash.namespace` với `TTY: true`, `Stdin/Stdout` bật, **`Stderr` để VẮNG (`nil`)** — spike đo được: đặt `Stderr` cùng `TTY:true` **không sinh lỗi nào**; `client-go/tools/remotecommand/v2.go:80` có `if p.Stderr != nil && !p.Tty` (nền của cả V4 lẫn V5, tức cả SPDY lẫn WS) nên stream stderr không được tạo và writer truyền vào **không bao giờ nhận byte**, không tín hiệu nào cho biết. *(Plan bản trước viết "apiserver từ chối" — sai; im lặng nguy hiểm hơn từ chối.)* Lệnh là **hằng số phía server** `GATEWAY_EXEC_COMMAND`, mặc định **`tmux new-session -A -s dlp`** (D3) — tuyệt đối không lấy từ frame client. Với D17 (trần 1 WS) lệnh này luôn chạy ở tư thế client-duy-nhất, nên không có ca hai client tranh kích thước cửa sổ; status bar tmux đã tắt từ image (E4) nên `stty size` trong pod khớp **chính xác** `cols`/`rows` của frame `init`. **Predicate fallback không được nuốt lỗi authz:** RBAC 403 KHÔNG phải upgrade-failure; predicate quá rộng thì lỗi thiếu quyền `pods/exec` sẽ hiện ra dưới dạng "SPDY failed". *Effort: M.*

**G5 — Bơm dữ liệu hai chiều.** Binary frame đi thẳng, **không parse, không decode UTF-8**. Backpressure: buffer có trần, client chậm quá trần → đóng `4429` thay vì phình bộ nhớ. **⛔ CHẶN — phát hiện từ spike:** khi stream kết thúc, `exit 137` **không phân biệt được** "pod bị reap" với "người dùng `kill -9` trong pod của mình". Coi mọi `CodeExitError` là thoát bình thường ⇒ đóng `1000` ⇒ FE hiểu là "tự gõ exit", không hiện "phiên đã hết hạn" và không retry. Với exit ∈ {137, 143} hoặc lỗi hạ tầng, **phải đọc `session:{id}` rồi mới chọn mã**: key mất / `status ∈ {EXPIRED, REAPED}` → `4404`; còn sống → `1000`. Một lượt Redis trên đường đóng, không phải đường nóng. Chi tiết: `ws-terminal-protocol.md` §6. Đồng thời **hạ mức log `Unhandled Error` của client-go** — nó in ở mức `E` trên chính đường exit-0 thành công, để nguyên thì cảnh báo thật chìm nghỉm. *Effort: M.*

**G6 — Resize + handshake `init`.** Đợi frame `init` mang `cols`/`rows` **trước khi dial exec** (timeout 3s → 80×24) để prompt oh-my-posh vẽ đúng bề rộng ngay lần đầu. Resize dồn dập phải **coalesce giữ giá trị cuối**, không đóng kết nối. **`TerminalSizeQueue.Next()` phải BLOCK** — trả `nil` nghĩa là "queue đóng vĩnh viễn"; client-go thoát hẳn vòng đọc và mọi resize sau đó rơi vào hư không trong khi WS vẫn sống (đo ở spike). Chỉ trả `nil` khi ctx đóng. **Coalesce buffer-1 giảm chứ không chặn lưu lượng:** spike đo 201 resize liên tiếp mất **~900ms** để PTY lắng (một resize đơn lẻ: 20ms) ⇒ debounce ~50ms phía FE (contract §4) là thứ thật sự chặn bão, đừng bỏ nó vì "server đã coalesce". *Effort: S.*

**G7 — Keepalive + `ExtendSession`.** Server ping mỗi 20s, không pong trong 10s → chết. **Chỉ traffic thật (stdin/stdout) mới gọi `ExtendSession`; ping/pong KHÔNG tính** — nếu tính, một tab bỏ quên giữ pod sống tới tận trần cứng. Gửi `expected_revision` đọc từ hash; `FailedPrecondition` → đọc lại, xác minh còn đúng chủ + còn sống, thử lại **đúng một lần**, vẫn lệch → đóng `4404` (không hồi sinh session đã reap). `hard_cap_reached` → đẩy control `expiring`. Auth: mTLS + `system_component` (D13). *Effort: S.*

**G8 — Rate/size limit (luật 5).** Read limit 32 KiB/frame; token-bucket 256 KiB/s (burst 512 KiB) → `4429`; control > 100/s → `4400`. Trần WS **trên mỗi session `GATEWAY_MAX_WS_PER_SESSION=1` (D17)** đếm bằng `session:{id}:ws`: `INCR` sau khi qua hết bước authz và **trước** upgrade, `DECR` trong `defer` của handler; vượt trần → **429 + `code: "SESSION_IN_USE"`**. Bộ đếm phải chịu được gateway chết giữa phiên — đặt **TTL trên `session:{id}:ws` bằng TTL của session** để một lần crash không khoá vĩnh viễn session của sinh viên ở trạng thái "đang mở ở tab khác". Trần theo user **suy ra** từ trần session/user của orchestrator — không nhân bản quota người dùng sang hai service. *Effort: S.*

**G9 — Stateless.** Không map session→pod trong RAM; tra Redis mỗi lần connect. State duy nhất được giữ là vòng đời của **chính kết nối đang mở**. *Effort: S.*

**G10 — Metrics.** `dlp_gateway_ws_active`, `..._ws_connections_total{result,reason}`, `..._exec_errors_total{kind}`, `..._ws_bytes_total{direction}`, `..._attach_duration_seconds` (101→`ready`), `..._extend_total{result}`. **Không label `session_id`/`user_id`** — nổ cardinality và là PII. *Đổi tên so với plan cũ: gateway đo **attach** latency; **claim** latency thuộc orchestrator.* *Effort: S.*

**G11 — Config + cổng env-drift.** Mỗi biến mới phải sửa **đồng thời 4 nơi** hoặc `make env-check` đỏ: code, `.env.example`, Helm (`values.yaml` + deployment), `.github/ci.env`. Biến mới của P1: `GATEWAY_JWKS_URL`, `GATEWAY_ALLOWED_ORIGINS`, `GATEWAY_EXEC_COMMAND`, `GATEWAY_MAX_WS_PER_SESSION`. Làm cùng lúc mỗi task thêm env, không dồn cuối. *Effort: S.*
> **Sửa danh sách sau khi thực thi 1.C-1:** thiếu **hai** biến. **`GATEWAY_TOKEN_ISSUER`** — contract §2 bắt kiểm `iss` nhưng không task nào sinh ra giá trị để so, và nó KHÔNG suy ra được từ `GATEWAY_JWKS_URL` (DNS in-cluster vs URL công khai). **`REDIS_URL`** — G3 bắt gateway đọc `session:{id}` nhưng biến để nối tới Redis chưa từng có trong danh sách nào của lane này; nó cũng là biến gateway **bắt buộc** duy nhất. Cả hai đã vào đủ 4 nơi, `env-check` xanh với 51 biến / 4 scope. `GATEWAY_EXEC_COMMAND` **chưa thêm** — biến chỉ được khai khi có code đọc nó (chính là luật của cổng này), nên nó tới cùng G4.

**G12 — Sửa 4 file `apps/web`** (ownership giao lane này, xem bảng D): phát sandbox token + `Set-Cookie` trong `session.ts`; thêm `resHeaders` vào `TRPCContext`; thêm **`mintSandboxTokenFor`** vào `jwt.ts` — `signJWT({ payload: {sub, sid, aud:"gateway", iss, iat, exp} })`, **cùng khoá** với `mintAccessTokenFor`, không sinh khoá mới (D15); `headers.ts` chỉ sửa **nếu** DevTools thật sự báo CSP violation. *Effort: M.*

> ### G12 ✅ XONG 2026-08-11 — **18/18 trên cluster thật, bên phát token là `apps/web` THẬT**
>
> Đây là chặng đóng đúng món nợ mà 1.C-2 mở ra: bằng chứng lần đó phải để prover **tự đóng vai bên phát token** (sinh khoá riêng, phục vụ JWKS riêng). Lần này gateway giữ **nguyên cấu hình kế thừa** — `jwksUrl=''` ⇒ `http://platform-web:3000/api/auth/jwks`, `tokenIssuer=''` ⇒ `betterAuthUrl` — và chuỗi chạy đủ: **sign-up Better Auth → tRPC `session.create` → `Set-Cookie: dlp_sandbox` → WS `/ws/session/{id}` → `ready` → gõ lệnh thật trong pod**. Pod `sandbox-8aafb3e05db3`, marker trả về đúng 2 lần (1 lần là tiếng vọng bàn phím; 2 lần mới chứng minh shell CHẠY nó). Báo cáo: [`reports/2026-08-11-verify-g12-sandbox-cookie.md`](reports/2026-08-11-verify-g12-sandbox-cookie.md).
>
> **⛔ Lỗi CÓ SẴN từ P0 mà chính chặng này lôi ra — và nó đã chặn G12 hoàn toàn.** `session.*` trả thẳng message proto ra tRPC, mà `Session` có **ba field `bigint`** (`expiresAt.seconds`, `createdAt.seconds`, `revision: int64`). `JSON.stringify` **NÉM** trên bigint. Đo được trên cluster trước khi vá: `POST /api/trpc/session.create` → **HTTP 500 `"Do not know how to serialize a BigInt"`**, và nó xảy ra **SAU khi pod đã được claim** ⇒ người dùng mất một pod khỏi trần quota 4 rồi nhận về một lỗi 500 không nói gì.
>
> **Vì sao 64 test cũ mù hoàn toàn:** tất cả gọi qua `appRouter.createCaller`, trả object JS thẳng — **không có bước serialize nào**. Bằng chứng 1.C-2 thì gọi `CreateSession` bằng gRPC, cũng không qua tRPC. **Đường HTTP của `session.*` chưa từng chạy một lần nào** cho tới hôm nay. Cùng họ với "job `images` chỉ chạy trên `main` nên `Dockerfile` không có cổng review" ở 1.E-1: *một đường không ai đi thì không ai gác* — và ở đây chính công cụ test (`createCaller`) là thứ bỏ qua đúng tầng bị hỏng. Vá bằng `toJsonSession` (Timestamp → ISO-8601, revision → number), áp cho **cả 5** procedure, kèm test quét toàn cây trả về tìm bigint sót.
>
> **Ba quyết định phát sinh:**
> 1. **`overrideOptions` bị LOẠI, dù plan (dòng trên, đã sửa) và contract §2 đều gợi ý nó.** Đọc `better-auth@1.6.26/dist/plugins/jwt/sign.mjs`: `signJWT` lấy `aud`/`exp`/`iss` **thẳng từ payload** (`const aud = payload.aud; … setAudience(aud ?? defaultAud)`) ⇒ payload đã thắng, `overrideOptions` **thừa**. Tệ hơn, endpoint merge **NÔNG** (`{...options, ...c.body.overrideOptions}`) nên truyền `{jwt:{audience:'gateway'}}` là thay TRỌN khối `jwt` và **mất `issuer`**. Ở lab không lộ vì `baseURL` trùng `betterAuthUrl`; ngày hai giá trị tách nhau — đúng thứ `GATEWAY_TOKEN_ISSUER` tồn tại để phân biệt — thì gateway 401 toàn bộ.
> 2. **`GATEWAY_AUD` đặt cạnh `ORCHESTRATOR_AUD` trong `config.ts` — file THỨ NĂM, ngoài bảng ownership G12.** Ghi rõ vì đây là lệch có chủ ý: `aud` là thứ **duy nhất** tách token gọi gRPC với token mở shell (contract §2), nên hai hằng số phải nhìn thấy nhau. Chú thích P0 ("thêm service thứ hai thì tham số hoá thay vì thêm hằng số") đã bị thay — tham số hoá `aud` chính là bỏ mất chỗ khẳng định "chỉ có đúng hai giá trị và chúng phải khác nhau". Bảng ownership không bị vi phạm về tinh thần vì chặng này chạy tuần tự, không fan-out.
> 3. **Admin tạo session HỘ user khác → KHÔNG phát cookie.** `assertOwnerOrAdmin` cho phép nhánh đó, nhưng cả hai lựa chọn mint đều sai: `sub=ctx.user.id` sinh cookie chết sẵn (bước g của gateway → 403) mà lại **đè mất** cookie của chính admin; `sub=input.userId` thì phát cho trình duyệt admin một chìa mở thẳng shell của user kia — quyền KHÁC HẲN "tạo session hộ", và không qua bước authz nào của luật 10. Session vẫn tạo được; cookie thì không.
>
> **⛔ MÓN NỢ MỚI, cùng họ với hai lần trước:** release lab đang chạy web tag **`dev-g12b`** (dựng từ nhánh, side-load bằng tay) chứ không phải tag `sha-*` do CI đóng. Đóng ngay sau khi PR merge, **side-load TRƯỚC, `helm upgrade` SAU**. *(Nợ gateway `dev-4030577` của 1.C-2 đã ĐÓNG ở chặng này — lab nay chạy `sha-841fb3d`, revision 13.)*
>
> **Còn để ngỏ, có chủ ý:** `headers.ts` **không sửa** — G12 nói chỉ sửa nếu DevTools báo CSP violation thật, mà chưa có trang `/session` nào để quan sát. Vế đó thuộc AC "Mở `/session`: 0 CSP violation" của 1.F, không phải chặng này. Câu hỏi thật cần trả lời ở đó: `connect-src 'self'` có phủ `wss://` cùng origin không.

**G13 — Test IDOR e2e (acceptance BẮT BUỘC).** Chạy trong CI với Redis thật + apiserver giả. Phải có **cả hai** vế, vì chúng chết ở hai bước khác nhau và một test không che được test kia:
- **Vế e** (`token.sid == {id}`): token hợp lệ của user B, URL là session của A → 403.
- **Vế g** (`hash.userId == token.sub`): token **ký bằng khoá test** với `sid == sessionA` nhưng `sub == userB` → 403. BFF thật không bao giờ mint được token này, nên **bắt buộc phải forge trong test** — nếu bỏ, ai đó implement thiếu bước g và toàn bộ acceptance vẫn xanh (đúng loại tautology mà D-17′ phê phán). *Effort: S.*

> ### 1.C-3 — G7–G10 ✅ XONG 2026-08-11
>
> Bốn task đều gắn nhãn *Effort: S* trong bảng trên. Ba trong số đó đúng là S. Cái còn lại (G7) giấu một quyết định thiết kế mà plan không lường, và hai cạnh sắc của thư viện chỉ lộ khi chạy.
>
> **⛔ 1. `FailedPrecondition` của `ExtendSession` phủ BA nguyên nhân, và ba nguyên nhân đó đòi ba hành vi khác nhau.** `mapExtendError` trả cùng một mã gRPC cho *revision lệch* (→ đọc lại, thử lại), *trạng thái cuối đời* (→ đóng `4404`), và *đã qua trần cứng* (→ đóng `4409`). Plan mô tả G7 như thể chỉ có nhánh revision. Coi mọi `FailedPrecondition` là va-revision nghĩa là: sinh viên dùng hết 2 giờ sẽ bị thử lại một lần vô ích rồi nhận `4404` — FE nói **"phiên của bạn bị thu hồi"** cho một người vừa chạy hết thời lượng hợp lệ.
>
> Đường phân loại hiển nhiên — so `err.Error()` với thông báo tiếng Việt của orchestrator — **bị loại**: chuỗi đó là văn xuôi cho người đọc, không ai coi nó là contract, và ngày ai đó sửa một dấu phẩy thì gateway phân loại sai mà **không test nào của HAI service đỏ**. `extend.classify` thay vào đó đọc LẠI hash và suy ra nguyên nhân từ **bằng chứng**, theo đúng thứ tự các phép kiểm của `extend.lua`: key còn không → chủ còn khớp không → status còn chạy được không → `createdAt` có tồn tại không → `revision` có đổi so với giá trị vừa gửi không. Revision **không** đổi mà vẫn bị từ chối ⇒ chỉ còn trần cứng. Không so chuỗi, không thêm field vào proto.
>
> *Nhánh thứ tư, suýt mất:* `extend.lua` cũng trả `state:` khi hash **thiếu `createdAt`** — một hash hỏng, không phải một trạng thái vòng đời. Nếu classify chỉ kiểm status rồi mặc định "hard cap", sự cố dữ liệu đó hiện ra với sinh viên là "hết giờ" và với người trực là **không gì cả**. Vì thế `sessionstore.Session` nay đọc thêm `createdAt` — một field tồn tại **chỉ để phân biệt một nhánh lỗi**.
>
> **⛔ 2. `c.Ping` CHẶN tới `pongWait`, nên ping và gia hạn không được ở chung một `select`.** Đặt hai đồng hồ vào một vòng lặp là cách viết tự nhiên nhất, và nó làm mỗi lượt ping đóng băng nhánh gia hạn tới 10 giây — traffic thật của sinh viên vẫn tới nhưng heartbeat không kịp báo, đúng lúc hạ tầng chậm là lúc biên an toàn cần nhất. Đo được ở test với nhịp ping ngắn: nhánh extend **không bao giờ** chạy. Tách hai goroutine.
>
> **⛔ 3. `cancel()` KHÔNG phải một tín hiệu hiền lành.** `coder/websocket` đóng phăng kết nối khi context của một thao tác đọc/ghi bị huỷ, nên mọi close frame gửi SAU đó rơi vào hư không và client chỉ thấy `1006`. Bản đầu của chặng này đặt `cancel()` trước `finish()` để chặn `expiring` chen vào giữa `exit` và close frame — và làm **bốn test có sẵn của 1.C-2 đỏ** (close code `-1`, mất control `exit`). Luật rút ra, nay áp cho cả bốn đường: **ai phát hiện điều kiện kết thúc thì người đó gửi `error` + close frame TRƯỚC, `cancel()` SAU**. `finish` chỉ còn tự đóng đúng nhánh client-chậm — nhánh duy nhất được phát hiện bên trong goroutine copy-stdout của client-go, nơi không ai sở hữu vòng đời kết nối. Heartbeat dừng bằng một **kênh riêng** (`hbStop`), không bằng ctx.
>
> **⛔ 4. `4409` KHÔNG BAO GIỜ TỚI ĐƯỢC NGƯỜI DÙNG, và chỉ phép đo trên cluster mới nói ra điều đó.** Cả 21 test đơn vị đều xanh, kể cả ca "qua trần cứng → 4409" — vì chúng cho `Extender` giả trả thẳng `ExtendHardCap`. Prover trên cluster thì đỏ: phiên chạm trần đóng bằng **`4404` + `SESSION_GONE`**.
>
> Nguyên nhân nằm ở `extend.lua`, không ở gateway: script đặt **TTL của `session:{id}` đúng bằng `expiresAt`**. Tới thời điểm `newExpiresAt <= now` — điều kiện duy nhất để nhánh `extend: hardcap:` bắn — thì hash **đã biến mất**, nên lượt gia hạn kế tiếp nhận "không tồn tại". Nhánh `hardcap:` của script, và `causeHardCap` của `classify`, đều là **mã gần như chết**. Hệ quả với người dùng: ai chạy hết 2 giờ hợp lệ đều được báo *"phiên của bạn bị thu hồi"*.
>
> Vá bằng thứ gateway **đã biết mà không dùng**: nó vừa phát `expiring{hardCapReached:true}` hai phút trước. Một bit `connState.hardCapSeen` biến `ExtendGone` thành `4409` khi đã từng chạm trần, giữ `4404` cho thu hồi thật. Bit đặt trên `connState` chứ không phải biến cục bộ của vòng heartbeat vì **hai goroutine đua nhau tới đường đóng** (heartbeat thấy session mất; reaper xoá pod làm stream đứt và `finish` chạy) — cùng một `closeTerminal` cho cả hai, nếu không close code của cùng một sự kiện phụ thuộc vào hôm đó reaper nhanh hay chậm.
>
> *Bài học lặp lại lần thứ ba trong phase này: **một đường không ai đi thì không ai gác**. Ở 1.E-1 là job CI chỉ chạy trên `main`; ở G12 là `createCaller` bỏ qua tầng serialize; ở đây là test double trả thẳng outcome mà production không bao giờ sinh ra. Cả ba đều xanh cho tới khi có người chạy thật.*
>
> **Contract §5 sửa ngữ nghĩa, không đổi shape** — xem F9. `expiring` phát mỗi lần `expiresAt` đổi; `hardCapReached` phân biệt "hạn vừa dịch" (FE im lặng cập nhật đồng hồ) với "hết đường gia hạn" (FE cảnh báo). Phát đúng **một lần** cho vế thứ hai: cảnh báo lặp mỗi 60 giây là cảnh báo bị bỏ qua.
>
> **G8/G9/G10 đúng là S.** Token-bucket 256 KiB/s burst 512 KiB → `4429`; control 100/s → `4400`. Burst **phải** lớn hơn `MaxFrameBytes`, nếu không một lần dán manifest hợp lệ cũng chết vì thiếu token — trần khi đó chặn tính năng chứ không chặn lạm dụng, và có ca đối chứng cho đúng điều đó. G9 hoá ra là một quyết định **đặt trường ở đâu**, không phải một tính năng: `connState` sống trên stack của `Serve`, không trên `Bridge` (singleton dùng chung); test hai phiên song song trên cùng một `Bridge` là thứ chứng minh nó. G10: 7 collector `dlp_gateway_*`, không nhãn nào mang `session_id`/`user_id`; danh sách mã `reason` do `wsroute` sở hữu vì chính nó phát ra các mã đó.
>
> **Số đo:** 19 ca test mới; **240 PASS / 0 SKIP** toàn repo dưới `-race` với Redis + Postgres thật (gateway 82→101). Chứng minh trên cluster: [`reports/2026-08-11-verify-1c3-heartbeat.md`](reports/2026-08-11-verify-1c3-heartbeat.md), công cụ [`cmd/verify-heartbeat`](../../services/terminal-gateway/cmd/verify-heartbeat/) nằm trong repo để đo lại được.
>
> **⛔ MÓN NỢ, cùng họ với ba lần trước:** release lab đang chạy gateway tag `dev-1c3` (dựng từ nhánh, side-load bằng tay). Đóng ngay sau khi PR merge — **side-load TRƯỚC, `helm upgrade` SAU**. Kèm theo: hai đồng hồ của orchestrator đã bị nén (`sessionTtl=90s`, `extendDefault=120s`, `hardCap=300s`) để phép đo vừa một lượt chạy — **phải trả về `1h`/`300s`/`2h`**.

> ### 1.C-4 — mTLS gateway/BFF ⇄ orchestrator (D13, R13, R25) — **CHƯA LÀM**
>
> Tách chương có chủ ý khi thực thi 1.C-3, không phải bỏ quên. R13 nói "chốt trước G7"; đây là chỗ chốt nó, và kết luận là **hoãn có điều kiện**.
>
> **Vì sao không gộp vào G7.** mTLS thật cần: một CA (cụm **không có cert-manager**), secret cho 3 pod, `grpc.Creds` + `ClientCAs` phía orchestrator, client cert cho **cả hai** consumer — gateway (Go) **và** `apps/web` (Node) — rồi mới bật `grpcRequireMtls=true`. Bật cờ nửa vời chính là "cổng an ninh GIẢ" mà B0′ đã cảnh báo: `config.Load` của orchestrator **từ chối khởi động** với `true` đúng vì server chưa có creds nào, và ép nó chạy sẽ trả `Unauthenticated` cho 100% RPC. Đây là việc chạm 3 service + chart, hai ngôn ngữ — không phải một task `S` đi kèm keepalive.
>
> **Vì sao hoãn được.** G7 **không làm rủi ro nặng thêm**: `apps/web` đã gọi cùng cổng `:9090` không xác thực **từ G12**, nên gateway là consumer **thứ hai** của một lỗ hổng đã mở, không phải người mở nó. Client gRPC của gateway đặt sau một seam nhận `grpc.DialOption`, nên cắm creds vào là đổi một chỗ.
>
> **⛔ Đính chính bảng Timeline:** dòng G12 ghi "**R25 ĐÓNG**" — **SAI**. Thứ G12 đóng là **R20** (khoá ký sandbox token vô chủ). R25 (cổng gRPC orchestrator không xác thực) **vẫn mở**: `grpcRequireMtls: 'false'` trong `values.yaml`, kiểm lại 2026-08-11. Tệ hơn, hạn chót mà chính R25 tự đặt — *"ngày `session.ts` (G12) nối vào"* — **đã trôi qua** hôm 2026-08-11 mà không ai dừng lại. Ghi ở đây để nó không trôi tiếp lần nữa.
>
> *Chạm: `services/terminal-gateway/cmd/`, `services/orchestrator/cmd/` + `internal/config`, `apps/web/src/server/grpc/`, `infra/helm/platform/`. Effort: M–L.*

## 1.D — Pod hardening: chỉ còn 4 khoảng trống

> **Đã xác minh lại 2026-08-09 trên cluster thật — tầng thực thi CÓ THẬT và đúng như mô tả**, không phải tin plan suông. Kiểm từng thứ: VAP `platform-sandbox-isolation` 8 validation CEL (đọc từng expression), ns `dlp-sandbox` PSA `enforce=baseline / audit=warn=restricted`, 3 NetworkPolicy, ResourceQuota + LimitRange, PriorityClass `dlp-platform-critical`=1000000, RBAC (`orchestrator` create pod trong `dlp-sandbox`=**yes** / `default`=**no** / exec=**no**; `gateway` exec=**yes** / create pod=**no**), IMDS bị chặn (`exit=124` timeout), `uid_map` chứng minh user-ns thật.
>
> **Task 17, 18, 20 của bản cũ KHÔNG phải làm lại.** Chỉ còn 4 khoảng trống dưới đây.

**D-17′ — Viết lại AC capability cho đúng sự thật.** Đo được trên pod thật: `CapEff = CapBnd = 000001ffffffffff` (đủ 41 cap) **dù spec có `drop: [ALL]`** — Sysbox bỏ qua ở runtime. Giữ `drop:[ALL]` + `allowPrivilegeEscalation:false` + `seccompProfile:RuntimeDefault` trong spec (phòng thủ chiều sâu: nếu một ngày `runtimeClassName` rơi mất thì pod chạy runc thường và các field này mới có tác dụng), nhưng **bỏ AC "runtime có drop ALL"** — nó là **đúng loại tautology mà chính plan này phê phán** ở 3 check hỏng của `04-verify-sysbox.sh`. AC runtime thay bằng `uid_map` offset ≠ 0. *Effort: S.*

**D-19′ — Đặt PID limit thật. ⛔ PHỤ THUỘC 1.B0.1 — KHÔNG chạy song song.** `/sys/fs/cgroup/pids.max` hiện là `max`, kubelet không có `podPidsLimit` (xác minh 2026-08-09: `grep podPidsLimit /var/lib/kubelet/config.yaml` → không có) ⇒ fork-bomb trong pod sinh viên hạ được node 1-node. Thêm `podPidsLimit: 4096` vào kubelet config + restart.

> **Vì sao không song song:** restart kubelet trên cluster **1-node** bounce toàn bộ pod. Nếu token CNI Calico đang cũ tại thời điểm đó (R0) thì **không pod nào quay lại** — tự tay tạo ra đúng chế độ hỏng mà R0 mô tả. Thứ tự bắt buộc: 1.B0.1 xanh → `rollout restart ds/calico-node` → **kiểm token còn hạn** → đổi kubelet → canary tạo pod ngay sau khi kubelet lên. Làm vào lúc không ai đang demo.

*Chạm: `infra/host/`. Effort: S.*

**D-21′ — Hạ phạm vi task 21 xuống đúng thực tế.** nodeSelector **đã xong bằng RuntimeClass** — `sysbox-runc` tự chèn `nodeSelector: sysbox-runtime=running`, không code thêm. Taint/toleration + node pool riêng **không áp dụng được trên cluster 1-node** (node hiện có `taints: rỗng`) ⇒ dời P3 cùng lúc với cloud multi-node. Ghi rõ lý do thay vì để task treo giả vờ chưa làm. *Effort: S.*

**D-22′ — Sửa verify command sai.** `ls /var/run/docker.sock` kỳ vọng "No such file" **luôn sai** với image DinD — socket đó là của dockerd *bên trong* pod (Sysbox), không phải host sock. Thay bằng check không có `hostPath` volume (VAP validation #8 đã ép). Sửa AC `docker run hello-world` theo D4. *Effort: S.*

## 1.E — `images/sandbox-base`

> **Tiến độ:** ✅ **1.E-1 XONG (E1–E5 + E10)** — 2026-08-10. Image thật đã thay `pause` trên cluster lab và warm-pool đang dựng pod từ nó. **E6–E9 còn nợ** (pwsh, DinD, entrypoint dotfiles) — xem [`images/sandbox-base/README.md`](../../images/sandbox-base/README.md) §"Chưa làm".
>
> **⛔ BASE ĐỔI: `ubuntu:24.04` (Noble Numbat), KHÔNG phải 26.04.** Quyết định của người dùng ngày 2026-08-10 (yêu cầu ban đầu là 22.04, chốt lại 24.04 sau khi đo). Đo `apt-cache policy` trên chính ba base:
>
> | base | image | `eza` | `fastfetch` | `zoxide` | `tmux` | hết hỗ trợ |
> |---|---|---|---|---|---|---|
> | 22.04 | 119 MB | **THIẾU** | **THIẾU** | 0.4.3 (2021) | 3.2a | 2027-04 |
> | **24.04** | **119 MB** | **0.18.2** | THIẾU | **0.9.3** | **3.4** | **2029-04** |
> | 26.04 | 160 MB | 0.23.4 | 2.57.1 | 0.9.8 | 3.6a | 2031-04 |
>
> 24.04 nhẹ hơn 26.04 **41 MB** mà vẫn giữ `eza` trong repo; 22.04 cùng cỡ 119 MB nhưng mất CẢ `eza` LẪN `fastfetch` và `zoxide` tụt về bản 2021 — trả thêm hai món nợ để đổi lấy đúng 0 MB. `tmux 3.4` còn là **chính version mà D17 đo hành vi hai-client**, nên kết luận đó còn nguyên giá trị. `fastfetch` cài từ `.deb` chính chủ ghim version + digest (đã chạy thật trên Noble: `fastfetch 2.67.0`), **không** rơi về `neofetch` (archive từ 2024).
> > ⚠ **Lý do "tốn RAM" KHÔNG đúng và cần ghi lại để không ai quyết định theo nó lần nữa:** kích thước image là **đĩa**, không phải RAM. Pod lab lúc rảnh tốn **~7.5 MB RSS** (PID 1); RAM thật do zsh + tmux + oh-my-posh quyết định và như nhau trên cả ba base. Chọn 24.04 là đúng vì **đĩa + vòng đời hỗ trợ + tài liệu DevOps phần lớn nhắm Noble**, không phải vì RAM.
>
> Số đo: **369 MB** image / **86 MB** tarball; Trivy **0 CRITICAL**, 14 HIGH (cả 14 là CVE **stdlib Go** trong binary `oh-my-posh`, tầng gói Ubuntu sạch) ⇒ **không cần `.trivyignore`**. oh-my-posh ghim `v30.6.4` + sha256; fastfetch ghim `2.67.0` + digest tự tính (release **không publish checksum nào** — đây là trust-on-first-use, KHÔNG phải chữ ký nhà phát hành, nâng version phải tính lại bằng tay).
>
> **⛔ Ba thứ plan KHÔNG lường trước:**
> 1. **`CMD` của image quyết định warm-pool sống hay chết** — và PID 1 phải TỬ TẾ. `podspec.go` không đặt `Command`/`Args` và đặt `RestartPolicy: Never`, nên pod chạy `CMD` của image; `CMD ["/bin/bash"]` của bản placeholder không có TTY ⇒ thoát NGAY ⇒ pod về `Succeeded` trong khi `pool:free` vẫn đếm là ấm. *(Cơ chế này **suy ra khi đọc `podspec.go`** trước lúc đổi image, không phải quan sát được — warm-pool chưa bao giờ chạy image placeholder, nó chạy `pause`.)* Chốt **`tini` làm PID 1 + `CMD ["sleep","infinity"]`**: `sleep` trần là PID 1 tồi ở hai điểm và **cả hai là hồi quy so với `pause`** — không `wait()` nên con mồ côi thành zombie (E7 dockerd sẽ đẻ rất nhiều, ăn thẳng vào trần pids 4096 của D-19′), và không có handler nên kernel **bỏ qua SIGTERM** ⇒ `kubectl delete pod` chờ hết grace 30s, giữ 1 trong 4 khe quota. Đo được: với `tini`, `docker stop` trả về trong **0s**.
> 2. **Đổi `SANDBOX_IMAGE` KHÔNG thay pod đang ấm.** Warm-pool không có logic rollout theo image: pod dựng từ image cũ nằm lại `pool:free` vô thời hạn, `Running`/`Ready` nên nhìn không có gì sai. **Quan sát được** sau `helm upgrade`: pool vẫn giữ nguyên pod `pause`. Chưa task nào sở hữu — ghi ở §"Còn để ngỏ".
> 3. **AC glyph của bản cũ là lệnh không bao giờ xanh được** — xem sửa ở §Acceptance criteria → Terminal UX.
>
> **Bốn gói ngoài danh sách E1**, thêm có chủ ý: `ncurses-term` (tmux `tmux-256color` cần terminfo entry cùng tên, thiếu là tmux chết lúc khởi động ⇒ D3 hỏng ở đúng đường G4 sẽ đi) · `xxd` (AC glyph chạy *trong pod*) · **`vim-tiny`** (cấp `/usr/bin/vi`; base Ubuntu KHÔNG có editor nào, mà rc đặt `EDITOR=vi` ⇒ `git commit` không `-m` chết với "cannot run vi", và trên nền tảng DẠY DevOps thì không sửa được YAML/Dockerfile nghĩa là không làm được bài — **trong khi AC "10 binary" vẫn xanh trọn vẹn**) · `tini`.
>
> **Theme oh-my-posh là tài sản của repo, không phải asset tải về:** `themes.zip` của release **không có dòng nào trong `checksums.txt`** (kiểm 2026-08-10 — file chỉ liệt kê 10 binary), nên tải nó về là đúng cái "tải không checksum" mà E3 vừa cấm. Theme nằm ở `images/sandbox-base/etc/dlp.omp.json`, glyph viết bằng `\uXXXX`.
>
> **`SANDBOX_IMAGE` mất default trong mã Go (`internal/config`).** Trước đây default là `registry.k8s.io/pause:3.10` — một fallback IM LẶNG đúng nghĩa: `pause` chạy được, pod `Ready`, vào `pool:free`, sinh viên claim **thành công**, rồi mới hỏng ở gateway (G4) khi `tmux new-session` không tìm thấy shell. Nguyên nhân và triệu chứng cách nhau ba thành phần. Nay rỗng ⇒ orchestrator **từ chối khởi động** (cùng lý lẽ `RequireDataStores`), có test `TestSandboxImageBatBuoc` + kiểm đột biến (khôi phục default thì test ĐỎ).

**E1 — Base + một layer apt duy nhất.** `--no-install-recommends`: `zsh tmux git curl ca-certificates less jq unzip locales fzf bat zoxide fastfetch eza`. Xoá `/var/lib/apt/lists` **trong cùng layer**. Symlink `/usr/local/bin/bat → batcat`. *Effort: S.*

**E2 — Locale + màu.** Sinh `en_US.UTF-8`, đặt `LANG`, `LC_ALL`, `TERM=xterm-256color`, **`COLORTERM=truecolor`**. Thiếu `COLORTERM` là oh-my-posh rơi về 256 màu và AC "truecolor" fail dù terminal FE đúng. *Effort: S.*

**E3 — `oh-my-posh` ghim version.** **Không** `curl … install.sh | bash` — script kéo `releases/latest` từ CDN nên build không tái lập được và không có checksum. Tải asset GitHub release ghim version, verify `sha256`. *Effort: S.*

**E4 — Shell config dùng chung.** `skel/.zshrc`, `.bashrc`, `.tmux.conf` copy vào `/etc/skel` **và** `$HOME`: init oh-my-posh + zoxide, keybinding fzf, alias `ls→eza --icons`, `cat→bat`. Shell mặc định zsh, bash giữ nguyên. **`.tmux.conf` BẮT BUỘC có `set -g status off` (D17)** — đo được: status bar ăn đúng 1 dòng (client 200×50 → window 200×**49**), nên để nguyên thì `stty size` trong pod luôn lệch 1 so với `rows` FE gửi và AC resize phải mang một số magic "trừ 1". Tắt nó thì kích thước khớp tuyệt đối. Sinh viên cũng không cần status bar: tmux ở đây là **cơ chế reconnect**, không phải công cụ người dùng. *Effort: S.*

**E5 — KHÔNG cài Nerd Font vào image.** Glyph render ở **trình duyệt**, không ở container — font là tài sản của `packages/terminal` (F3). Image chỉ cần theme phát đúng codepoint. *Sửa task 24 cũ: cài TTF vào image là ~50–100 MB vô ích.* *Effort: S.*

**E6 — Build-arg `INCLUDE_PWSH=0`.** Khi `1`: `.deb` universal từ GitHub release (ghim version + sha256, **không** `packages-microsoft-prod` vì chưa có 26.04), rồi `Terminal-Icons` + `PSReadLine` từ PSGallery. *`terminal-icons` là **module PowerShell**, không phải công cụ Linux — plan cũ xếp nhầm vào danh sách apt.* Vỡ thì để `0` và ghi nợ, **không chặn P1**. *Effort: M.*

**E7 — Build-arg `INCLUDE_DOCKER=1`.** **Plan cũ thiếu hoàn toàn task này** dù AC đòi chạy được docker. Cài `docker-ce` + CLI + buildx. Sysbox cho chạy `dockerd` trong pod không cần privileged, **không mount `docker.sock`**. *Effort: M.*

**E8 — `entrypoint.sh`: dockerd + nạp dotfiles an toàn.** Đọc `/mnt/dotfiles` (mount read-only), copy vào `$HOME` với **allowlist tên file** (`.zshrc .bashrc .gitconfig .tmux.conf .config/**`), **từ chối** path tuyệt đối, `..`, và symlink; cap 256 KiB + 50 file. Tuyệt đối không `git clone` URL người dùng cung cấp — đó là bề mặt SSRF. *Effort: M.*

**E9 — tmux là đường vào mặc định (D3).** Image có tmux (E1) và gateway exec vào `tmux new-session -A -s dlp` (G4). Gọi hai lần phải trả về **cùng một** session. *Effort: S.*

**E10 — CI + Trivy + đo size.** Thêm build-args vào hàng matrix `sandbox-base`. **Context build là `images/sandbox-base`, không phải repo root** ⇒ file phụ trợ phải nằm trong thư mục đó. **Quét Trivy CỤC BỘ trước khi merge** — job `images` chỉ chạy trên `main`, đợi CI là quá muộn với image béo lên đáng kể. Có CRITICAL chưa vá → `.trivyignore` kèm lý do + ngày rà lại, **không nới ngưỡng**. *Effort: S.*

## 1.F — `packages/terminal` + trang session

> **Tiến độ:** ✅ **1.F XONG 2026-08-11 — terminal chạy THẬT trong trình duyệt.** F1–F11 đều có code; bằng chứng trên cluster: [`reports/2026-08-11-verify-1f-terminal-fe.md`](reports/2026-08-11-verify-1f-terminal-fe.md), ảnh [`assets/2026-08-11-1f-lenh-that.png`](reports/assets/2026-08-11-1f-lenh-that.png). Sinh viên mở `/session`, bấm "Bắt đầu", và **gõ được lệnh thật** — mọi chặng trước chỉ chứng minh được bằng `wscat`.
>
> **Ba việc chặng này đóng ngoài F1–F11:**
> 1. **Câu hỏi CSP mà G12 để lại đã trả lời dứt điểm: `connect-src 'self'` CÓ phủ `ws://` cùng origin ⇒ `headers.ts` KHÔNG cần sửa.** Đo bằng listener `securitypolicyviolation` **kèm đối chứng âm** (`wss://evil.example` → violation `connect-src`; ảnh cross-origin → violation `img-src`) — vì "0 violation" là khẳng định vô nghĩa nếu CSP không thực thi. *Phương pháp suýt sai: lượt đầu chờ `new WebSocket()` NÉM; Chrome báo vi phạm CSP cho WS **bất đồng bộ**, không bằng exception.*
> 2. **Lệch contract `hardCapAt`** — xem hộp ⛔ ngay dưới.
> 3. **Nợ image `dev-1c3b` đã đóng**: lab về một tag `sha-9776bda` do CI đóng cho cả 5 image, `gateway.image.tag` trả về rỗng (kế thừa). Không còn hằng số thứ hai.
>
> ⛔ **LỆCH CONTRACT chỉ lộ ra trên TRÌNH DUYỆT THẬT — `ready` không có `hardCapAt`.** Contract §5 liệt kê field đó là bắt buộc; `buildReady` của gateway **cố ý không gửi** (mốc = `createdAt + HARD_CAP`, mà `HARD_CAP` là config của **orchestrator** — gateway tự tính là dựng hằng số thứ hai). Parser đầu tiên của lane FE làm đúng theo bảng nên **loại sạch mọi `ready`**: terminal vẫn vẽ prompt và gõ được (byte binary không qua parser), nhưng badge đứng ở "đang kết nối" vĩnh viễn, đồng hồ không hiện, **và không một dòng log nào**. Typecheck hai bên xanh, 90 test xanh, `next build` xanh. Đây là ca mẫu cho chính câu mở đầu của `docs/ws-terminal-protocol.md`: *"chỉ runtime mới lộ"*. **Bên nhượng bộ là contract + FE, KHÔNG phải gateway** — lý lẽ chống-hằng-số-thứ-hai mạnh hơn bảng. Đã sửa contract §5, `hardCapAt: string | null`, ca hồi quy dùng đúng byte gateway gửi, và **bỏ hẳn nhánh bỏ-qua-im-lặng** trong `connection.ts`.
>
> **Hai chỗ kiến trúc lệch plan có chủ ý:** (a) **F7 của plan KHÔNG BUILD ĐƯỢC trên Next 16** — `ssr: false` bị cấm trong Server Component, nên tầng là **ba lớp** (`page` server → `session-client` client/máy-trạng-thái → `terminal-pane` client/`ssr:false`), không phải hai; (b) **bỏ state `claiming`** (`CreateSession` claim pod ngay trong cùng lời gọi ⇒ state đó là code chết; phép kiểm thành *điều kiện* trên cạnh `creating → connecting`) và **thêm state `exited`** cho control `exit` mà danh sách của plan không có chỗ nhận.
>
> **Font: `CaskaydiaCove Nerd Font Mono`** (quyết định của người dùng 2026-08-11). Bản **Mono** vì nó ép icon về đúng một ô, khớp `wcwidth` phía server. Subset **636 KB**, ghim `v3.5.0` + sha256 tự tính. **Bỏ dải plane-15** (Material Design Icons): đo được **+428 KB** (635 → 1063) cho một dải mà không gì trong image phát ra. Chỉ ship Regular — chữ đậm để trình duyệt tự tổng hợp, tránh bẫy phủ-glyph lệch giữa hai face.
>
> **Còn nợ (KHÔNG tick):** fallback DOM khi tắt hardware acceleration (có code, chưa chạy) · StrictMode 3 lần mount (đo **gián tiếp** ở tầng connection, chưa đo vòng đời effect) · nút "Gia hạn" (`session.extend` có, chưa bấm thật) · reconnect qua đường FE (chưa ngắt mạng thật).

> ~~Hiện `packages/terminal` **chỉ có README**, chưa có code, chưa có `package.json`.~~ ✅ Đã dựng đủ.
> Package đúng là **`@xterm/*` v6.0.0** (không phải `xterm` cũ), và **v6 đã BỎ canvas renderer** — chỉ còn DOM + WebGL.

**F1 — Dựng package.** Mirror `packages/ui`: `type: module`, `exports: "./src/index.ts"`, **alias TS6/TS7 y hệt** các package khác, `peerDependencies: { react: "^19.0.0" }`. **Bắt buộc có script `build`** (dù chỉ `tsc --noEmit`) vì `turbo.json` khai `typecheck.dependsOn: ["^build","build"]`. Ghim: `@xterm/xterm@6.0.0`, `addon-webgl@0.19.0`, `addon-fit@0.11.0`, `addon-search@0.16.0`, `addon-web-links@0.12.0`, `addon-clipboard@0.2.0`, `addon-unicode11@0.9.0`. *Effort: S.*

**F2 — Core wrapper.** Nạp addon theo thứ tự fit → unicode11 → webgl → search/web-links/clipboard. Vì v6 bỏ canvas renderer, **tự code fallback**: `webgl.onContextLoss` → `dispose()` addon → rơi về DOM renderer + `console.warn` (errors-over-silent-fallback, không nuốt). *Effort: M.*

**F3 — Font self-host.** Một Nerd Font (MesloLGS NF hoặc JetBrainsMono NF) dạng **woff2 subset** trong `src/assets/`, `@font-face` + `font-display: block`. CSP `font-src 'self'` ⇒ CDN bị chặn, self-host là bắt buộc chứ không phải lựa chọn. *Effort: S.*

**F4 — Đo kích thước & resize.** FitAddon chỉ đúng **sau khi font đã load** ⇒ `await document.fonts.ready` rồi mới `fit()`. `ResizeObserver` + debounce **~50ms theo contract §4** (bản trước ghi 100ms — lệch với SSOT; contract thắng). **Gửi `init` trước mọi stdin** (contract §3). *Effort: S.*

**F5 — Theme switch.** 2–3 theme `ITheme` truecolor, đổi runtime qua `term.options.theme`, persist bằng `localStorage` — không cookie (tránh phình header và bề mặt CSRF). *Effort: S.*

**F6 — React binding.** `'use client'`, `useRef` + `useEffect` mount/dispose; terminal là imperative nên **không** re-render theo state. **React 19.2 StrictMode dev chạy effect hai lần** ⇒ thiếu `dispose()` triệt để là 2 canvas WebGL + 2 WS. *Effort: M.*

**F7 — Trang session.** `app/(session)/session/page.tsx` (Server Component, kiểm auth) + `session-terminal.tsx` (`'use client'`) nạp bằng `next/dynamic` với **`ssr: false`** — xterm đụng `document` ngay lúc import module. *Effort: M.*

**F8 — tRPC client (chưa tồn tại).** `apps/web` hiện chỉ có `@trpc/server`. Thêm `@trpc/client` (+ TanStack Query nếu cần cache) và `src/lib/trpc.ts` trỏ `/api/trpc`. Plan cũ giả định sẵn có. *Effort: S.*

**F9 — Máy trạng thái UI.** `idle → creating → claiming → connecting → ready → (reconnecting) → expired | error`. Đếm ngược tới `expiresAt` — lấy mốc đầu từ `ready` rồi **cập nhật lại mỗi lần nhận `expiring`**; chỉ **cảnh báo** khi `expiring.hardCapReached === true`. Thêm mã đóng `4409` (HARD_CAP_REACHED) vào bảng xử lý close code: không retry, hiện "đã dùng hết thời lượng tối đa" chứ không phải "phiên bị thu hồi". Nút "Gia hạn". **Thấy `1006` mà chưa từng nhận `ready`** → gọi tRPC `session.get` để biết lý do thật (contract §7). *Effort: M.*
> **Sửa 2026-08-11 (1.C-3).** Bản trước ghi "đếm ngược tới `expiresAt` (lấy từ `ready`, **không cần gọi thêm**)" — sai, và sai theo kiểu chắc chắn lộ ra ở người dùng. Công thức đã sửa của B5 là `max(current, min(now + extend, createdAt + HARD_CAP))`, nên với `SESSION_TTL=1h` + `EXTEND_DEFAULT=300s` thì hạn **đứng yên ~55 phút** rồi mới nhích 5 phút mỗi lượt gia hạn cho tới trần 2h. Đồng hồ lấy một lần từ `ready` vì thế chạy về 0 ở **mọi phiên dài hơn 55 phút** trong khi terminal vẫn sống. Contract §5 đã được làm rõ (không đổi shape): `expiring` phát mỗi lần `expiresAt` đổi, `hardCapReached` phân biệt "hạn vừa dịch" với "hết đường gia hạn".

**F10 — Reconnect.** Backoff 1/2/4/8s cap 15s, chỉ khi `now < expiresAt`, và **dừng hẳn** với close code báo authz/hết hạn (không retry vô ích vào 403). Nhờ tmux (D3) nối lại là **phiên thật**, không phải shell mới. *Effort: S.*

**F11 — Test.** vitest + jsdom: state machine, parser control message, logic backoff. WebGL và glyph không test tự động được ⇒ checklist thủ công + ảnh chụp lưu `plans/reports/`. *Effort: S.*

---

## File / dir ownership — bản đồ zero-overlap cho fan-out

| Lane | Sở hữu độc quyền |
|---|---|
| **Orchestrator** | `services/orchestrator/internal/{pool,lifecycle,reaper,k8s,audit}/**`, `internal/grpcserver/` |
| **Gateway** | `services/terminal-gateway/**`, **+ 4 file `apps/web`**: `src/server/trpc/routers/session.ts`, `src/server/trpc/init.ts`, `src/server/auth/jwt.ts`, `src/server/security/headers.ts` |
| **Image** | `images/sandbox-base/**` |
| **FE** | `packages/terminal/**`, `apps/web/src/app/(session)/**`, `apps/web/src/lib/trpc.ts` |
| **Infra** | `infra/host/**`, `infra/helm/**`, `infra/k8s/**`, `docker-compose.yml` |

**File chung nhiều lane — làm TUẦN TỰ ở 1.B0.3, không lane nào tự sửa giữa chừng:**
`docs/redis-key-namespace.md` · `docs/redis-key-vectors.json` · `services/shared/rediskeys/**` · `packages/shared-types/src/redis-keys.ts` · `docs/ws-terminal-protocol.md` · `turbo.json` · `.github/ci.env`

**Contract pin trước fan-out** (`rules/contract-first-integration.md`): `docs/ws-terminal-protocol.md` nhúng nguyên văn vào brief lane gateway + lane FE; field hash `session:{id}` nhúng vào brief lane orchestrator + lane gateway.

**Branch/worktree:** lead cấp trước một nhánh cho mỗi lane; teammate **không** `git checkout -b` (chia chung HEAD). Commit bằng dạng pathspec `git commit -m … -- <paths>`, không `git add .` (`rules/parallel-teammate-git-index-race.md`).

**Thứ tự bắt buộc:**
```
1.B0.1 (Calico) ─┬─► 1.B0.2 (Redis/PG) ─┐
                 ├─► 1.B0.3 (contract)  │
                 ├─► 1.B0.4 (origin)    ├─► 1.A-1 spike ─► 1.C gateway ─┐
                 ├─► 1.B0.5 (JWKS) ─────┤                               ├─► tích hợp
                 │                      ├─► 1.A-2 spike ─► 1.B orch ────┤
                 │                      ├─► 1.E image ──────────────────┤
                 │                      └─► 1.F FE (cần WS contract) ───┘
                 └─► D-19′ (kubelet podPidsLimit) ⛔ CHỈ sau khi Calico xanh

1.D: D-17′, D-21′, D-22′ song song hoàn toàn.
     D-19′ KHÔNG — nó restart kubelet trên node 1-node (xem R22).
```
~~**1.E-1 (E1–E5, E10) phải merge + push image lên ghcr TRƯỚC** khi warm-pool tạo pod thật~~ ✅ **XONG 2026-08-10** — nhưng **không phải qua ghcr**: node không có imagePullSecrets cho ghcr private và `podspec.go` ghim `ImagePullPolicy: IfNotPresent`, nên đường giao image ở lab là **side-load** (`docker save` → `scp` → `ctr -n k8s.io images import`), đúng khuôn `values-selfhost.yaml` đã dùng cho 4 image kia. `helm upgrade` xong, warm-pool đang dựng pod từ image thật.
> Chart nay ghép `sandboxImage` từ `image.registry` + `image.tag` khi để rỗng (cùng khuôn `sandboxRuntimeClass`), nên đổi `image.tag` một chỗ là pod lab đi theo — không còn hằng số thứ hai để trôi. Tag `sha-<short>` do CI đóng sẽ dùng được ngay khi `main` có commit này; xem §"Còn để ngỏ" cho món nợ `--set` tạm thời.

---

## Acceptance criteria

### Gate 1.A (HARD-GATE — không mở 1.B/1.C khi chưa xanh)

> **✅ ĐÃ XANH 2026-08-09.** Báo cáo: [`reports/2026-08-09-spike-ws-exec.md`](reports/2026-08-09-spike-ws-exec.md) (WS) · [`services/orchestrator/internal/pool/README.md`](../../services/orchestrator/internal/pool/README.md) (claim).
> Ba giả định của plan **sai và đã sửa** — xem §"Spike sửa gì" ở cuối.

- [x] Spike WS: `fallback` executor attach được vào pod Sysbox; report ghi rõ transport thắng + subprotocol thương lượng. → **WS thắng, `v5.channel.k8s.io`** (đo bằng bắt tay thủ công, không suy luận); SPDY chưa từng chạy. `fallback` 404.6ms ≈ `ws` 405.8ms < `spdy` 442.1ms.
- [x] Spike WS: `vim` + `htop` vẽ đầy đủ, không rác ANSI; kéo cửa sổ → `stty size` khớp < 1s; `exit` đóng sạch, `-race` không báo; xoá pod giữa phiên → báo lỗi rõ, không treo. → vim vào/ra alt-screen + tự báo `columns=120`; htop 8089 byte ANSI có màu; resize khớp sau **20.2ms**; **0** DATA RACE, goroutine về 2 sau cả 6 phiên; xoá pod phát hiện sau **3.2s** không treo *(kèm phát hiện chặn — xem G4/G5)*.
- [x] Spike WS: report trả lời đủ 6 câu gotcha ở S4, **gồm close code thật của read-limit**. → **`1009`** (thư viện tự đóng), contract §6 đã pin lại.
- [x] Spike claim: `-race -count=20` xanh 20/20; đúng 50 thành công / 150 "pool rỗng" / **0 podName trùng**; `LLEN pool:free==0`, `pool:claimed==50`.
- [x] Spike claim chạy trên **Redis thật**; skip có log rõ khi `REDIS_URL` trống.
- [x] Redis restart giữa chừng → `EVALSHA` gặp `NOSCRIPT` tự fallback `EVAL`, không mất claim. → `TestClaimSurvivesScriptFlush` ép bằng `SCRIPT FLUSH` giữa hai lượt claim.

### Prerequisite 1.B0

> **Đã thực thi 2026-08-09** — báo cáo đầy đủ kèm số đo: [`reports/2026-08-09-p1-b0-prerequisites.md`](reports/2026-08-09-p1-b0-prerequisites.md).
> Ba thứ plan không lường trước, chỉ lộ khi chạm cluster thật: **không có StorageClass nào** (PVC sẽ Pending vĩnh viễn ⇒ phải thêm `local-path-provisioner`), `registry.k8s.io/kubectl` là **distroless không có `/bin/sh`** (buộc thiết kế lại canary), và `helm upgrade --reuse-values` **không nạp default mới của chart** (phải dùng `--reset-then-reuse-values`).

- [x] **Calico — AC VIẾT LẠI 2026-08-11 cho chịu được suspend. Xem "Vì sao đổi" ngay dưới trước khi sửa tiếp.** Ba vế, không vế nào phụ thuộc một mốc treo tường:
>   1. **Cron thật sự chạy và thật sự ghi mới token** — ≥ 2 Job `dlp-calico-token-refresh` `Complete` **và** `exp` của token quan sát được tăng. ✅ (3 Job; `exp` 1786340207 → 1786347833.)
>   2. **Tạo pod thành công khi token GỐC chắc chắn đã chết** — tức ở thời điểm cách T0 (`2026-08-09T07:40:14Z`) hơn 24h treo tường. ✅ **Đo 2026-08-11T03:11Z, T0+43.5h:** Job `dlp-canary-manual` (tạo tay từ `cronjob/dlp-cni-canary`) → pod `dlp-canary-manual-p6d4z` `Running`, **có IP** ⇒ CNI cấp địa chỉ được, R0 chưa hề nổ.
>   3. **Canary ĐẦU TIÊN sau mỗi lần chuỗi đứt phải xanh.** Đứt chuỗi = cụm ngủ/mất điện; trong lúc đó token vẫn già đi theo giờ treo tường mà **không** cron nào chạy được. Đây chính là ca đối kháng mạnh nhất của R0, và nó chỉ xuất hiện khi cụm ngủ. ✅ Vế 2 ở trên CHÍNH LÀ ca đó: nó là lần tạo pod đầu tiên sau khoảng đứt 14h.

>   ### Vì sao đổi: mốc treo tường là AC không đo được trên một lab VM
>
>   **Bản cũ đòi "tạo pod thành công tại T+25h *và* T+37h".** Vế T+25h đã chốt 2026-08-10. Vế T+37h (`2026-08-10T20:40:14Z`) thì **không bao giờ đo được** — và lý do không phải là hạ tầng hỏng:
>
>   **Cụm ngủ 14 giờ, ngay trùm lên đúng cái mốc đó.** Khoảng trống trong `journalctl` của host: `2026-08-10T20:05:06 +07` → `2026-08-11T10:09:23 +07`. Lab chạy trên VM trên máy cá nhân; máy ngủ thì VM ngủ. Canary cuối cùng trước khi ngủ hoàn tất `2026-08-10T13:00:14Z`, tức **7h40 TRƯỚC** mốc T+37h, và Job kế tiếp không bao giờ được tạo.
>
>   **Hệ quả kèm theo, ghi lại vì nó là một họ lỗi:** lúc resume, NIC lên chậm hơn kubelet, nên `kube-controller-manager` và `kube-scheduler` mất lease leader election (`dial tcp 192.168.94.130:6443: connect: network is unreachable` → `leaderelection lost` → `exit 1`) và restart — kcm 9 lần, scheduler 14 lần. **Trong lúc kcm chết thì KHÔNG CronJob nào được lên lịch**, kể cả chính `dlp-calico-token-refresh`. Nghĩa là suspend không chỉ tạo lỗ hổng bằng chứng, nó còn **tạm dừng chính bản vá của R0** — `lastScheduleTime` đứng ở `2026-08-10T13:00:00Z` (canary) và `12:00:00Z` (token-refresh) suốt 14h. Cả hai đã tự phục hồi sau khi kcm ổn định.
>
>   **Vì sao bản mới đúng hơn chứ không phải dễ hơn.** Mốc treo tường là **proxy** cho tính chất thật: *"token gốc đã chết từ lâu, và pod vẫn tạo được ⇒ ta đang sống nhờ cron chứ không nhờ token ban đầu."* Vế 2 khẳng định thẳng tính chất đó (T0+43.5h > 24h) thay vì đo hộ nó bằng đồng hồ. Còn vế 3 **chặt hơn** bản cũ: bản cũ giả định ngầm rằng cụm chạy liên tục, nên nó chưa bao giờ kiểm ca "token già đi trong lúc cron không chạy" — ca duy nhất khiến R0 thật sự nổ. Suspend biến từ **lỗ hổng bằng chứng** thành **phép thử tốt nhất hiện có**, với điều kiện ta bắt buộc kiểm ngay sau mỗi lần đứt.
>
>   **Cách phát hiện đứt chuỗi** (không phải nhìn bằng mắt): `kubectl get cronjob dlp-cni-canary -o jsonpath='{.status.lastScheduleTime}'` lệch quá một nhịp so với `date -u` ⇒ đã có gián đoạn ⇒ chạy vế 3.
>
>   ⛔ **Đừng "sửa" bằng cách đặt lại T0 rồi chờ tiếp.** Đã cân nhắc và loại: nó giữ nguyên chữ AC nhưng lùi lịch ~37h, và sẽ vỡ **y hệt** vào lần máy ngủ kế tiếp — trên một lab VM cá nhân thì đó là chuyện thường ngày, không phải sự cố. Một AC vỡ theo lịch ngủ của người dùng là AC đo sai thứ.
>   ⛔ **Bẫy đã vá 2026-08-10 — AC này suýt không đóng được.** `successfulJobsHistoryLimit` là **1**, nhịp cron 30 phút ⇒ Job canary của mốc T+25h bị thu gom mất **trước khi** tới T+37h, và `status.lastSuccessfulTime` chỉ giữ được MỘT mốc ⇒ không có cách nào chứng minh cả hai mốc từ trạng thái cluster. Đã nâng lên **26** (≈13h lịch sử) trong [`infra/k8s/cni-canary.yaml`](../../infra/k8s/cni-canary.yaml) và patch thẳng lên cluster đang chạy. Đây là cùng một họ lỗi với "suite xanh vì skip sạch": **cơ chế thu thập bằng chứng tự huỷ bằng chứng, và im lặng khi làm thế**.
> - [x] Đã đạt vế "≥ 2 lần restart thành công": nay là **3** Job `dlp-calico-token-refresh` `Complete` (đọc 2026-08-10T12:10Z: 23h trước, 12h trước, và 10 phút trước) — cron `0 */12 * * *`, `successfulJobsHistoryLimit: 3`.
> - [x] **Vế T+25h ĐÃ ĐẠT** (chốt 2026-08-10T12:10Z). T0 = `metadata.creationTimestamp` của cả hai CronJob = **`2026-08-09T07:40:14Z`** ⇒ T+25h = **`2026-08-10T08:40:14Z`**. Job canary đầu tiên thành công SAU mốc đó: **`dlp-cni-canary-29772540`**, `succeeded=1`, `completionTime=2026-08-10T09:00:11Z`. Chuỗi liền mạch quanh mốc, không đứt quãng: `…08:30:18Z` → `09:00:11Z` → `09:30:11Z` → … → `12:00:14Z`.
>   > **Ghi ngay thay vì đợi, vì bằng chứng đang bốc hơi.** Đo lúc chốt: chỉ còn **13** Job canary được giữ (cũ nhất `2026-08-10T06:00:11Z`) ≈ **6.5h** lịch sử — chứ KHÔNG phải 13h như `successfulJobsHistoryLimit: 26` hứa. Với nhịp 30 phút, Job của mốc T+25h sẽ bị thu gom **trước** khi tới T+37h (`2026-08-10T20:40:14Z` = 03:40 sáng 11-08 giờ +07). Tức bẫy "cơ chế thu thập bằng chứng tự huỷ bằng chứng" **vẫn còn sống ở mức nhẹ hơn** sau bản vá — nâng limit lên 26 chưa đủ, và lý do khoảng cách 26↔13 thì **chưa điều tra**. Ghi lại ở đây để vế T+37h không phải đo lại từ đầu.
> - [x] ~~**Vế T+37h** — mốc `2026-08-10T20:40:14Z`~~ **BỎ 2026-08-11, thay bằng vế 2 + vế 3 ở trên.** Mốc này rơi trọn vào 14h cụm ngủ nên không có Job nào tồn tại quanh nó; nó cũng là mốc cuối cùng còn đo bằng đồng hồ treo tường. Lý do đầy đủ ở khối "Vì sao đổi".
>   > **Và bằng chứng ĐÃ bốc hơi đúng như cảnh báo ở dòng trên.** Đọc 2026-08-11T03:10Z: 15 Job canary còn lại, cũ nhất `2026-08-10T10:30:12Z`, mới nhất `2026-08-10T13:00:14Z` — Job của mốc T+25h (`dlp-cni-canary-29772540`, `09:00:11Z`) **đã bị thu gom**. Nếu vế T+25h không được chốt bằng số đo ngay hôm 2026-08-10 thì nay nó cũng không chứng minh lại được. Ghi chú "ghi ngay thay vì đợi" ở trên đã trả đúng cái giá nó dự đoán.
- [x] Cron vá chạy được và **token thật sự được ghi mới** — không chỉ "job Complete": `exp` 1786340207 → 1786347833 (= `now` + 24h) sau một lần chạy.
- [x] Canary tạo-pod chạy trong cron, và **đã thấy nó đỏ có chủ ý**: ép `runtimeClassName: khong-ton-tai` → Job `Failed`/`DeadlineExceeded`, event ghi nguyên văn lý do. Canary chưa từng đỏ là canary chưa biết có kêu hay không.
- [x] `redis-cli CONFIG GET notify-keyspace-events` trả chuỗi chứa `E` và `x` — trả `xE`; `appendonly` = `yes`.
- [x] Pod orchestrator `Running` với `REDIS_URL`/`DATABASE_URL` trỏ service in-cluster (qua `secretKeyRef`, không phải `env.value` — hai URL chứa mật khẩu). PVC Postgres 4Gi + Redis 1Gi đều `Bound`.
- [x] Web và gateway **cùng origin**: cookie scope `/ws` do web phát được gửi kèm trong handshake và gateway CHẤP NHẬN nó. ✅ **ĐẠT 2026-08-11 qua G12** — `Set-Cookie` từ `POST /api/trpc/session.create` mang `Path=/ws; HttpOnly; Secure; SameSite=Strict` và **không** `Domain`; gửi đúng cookie đó vào `/ws/session/{id}` → **101** + echo `dlp.terminal.v1` + `ready` + gõ được lệnh thật.
>   **Nói thẳng vế chưa đo:** AC gốc viết "kiểm bằng DevTools Network", và **DevTools thì chưa** — chưa có trang `/session` nào (1.F). Thứ đã đo là tầng DƯỚI của cùng tính chất: thuộc tính cookie đúng scope `/ws`, và một client WS thật gửi nó qua được toàn bộ 9 bước authz. Vế "trình duyệt TỰ ĐỘNG đính cookie theo scope" (tức `SameSite=Strict` + host-only không tự chặn chính mình ở điều hướng thật) chỉ đóng được ở 1.F. Tick ô này vì phần B0 nợ là **topology + cookie đi được**, cả hai đã có số đo; ô DevTools nằm ở AC của 1.F.
- [x] **JWKS tới được từ gateway (1.B0.5):** `curl -s $GATEWAY_JWKS_URL | jq '.keys[0]'` trả `kty:"OKP"`, `crv:"Ed25519"`, `alg:"EdDSA"`, `kid` không rỗng — gọi **từ trong cluster**, đúng URL `http://platform-web:3000/api/auth/jwks` mà gateway đang cấu hình. Khẳng định của D15 được xác nhận bằng số đo, không phải bằng suy luận từ `node_modules`.

### Chức năng
- [ ] 5 RPC trả kết quả thật, không còn `Unimplemented`.
- [x] Claim từ warm-pool **p95 < 1s** (`dlp_claim_duration_seconds`, ≥ 50 mẫu). → **p95 = 0.092s trên 50 mẫu warm với IMAGE THẬT (Ubuntu 24.04)**, đo lại 2026-08-10 sau 1.E-1 bằng [`cmd/bench-claim`](../../services/orchestrator/cmd/bench-claim/) (98 lượt gọi: 50 warm + 48 cold ở `POOL_TARGET=1`). ✅ **Cảnh báo "phải đo lại sau 1.E" ĐÃ ĐÓNG.**
  > Ba lần đo, ba image khác hẳn nhau, cùng một con số: `pause:3.10` **0.090s** · sandbox-base 26.04 (427 MB) **0.089s** · sandbox-base 24.04 (369 MB) **0.092s**. Đúng như cơ chế: claim là một `LMOVE` trên Redis trong pool đã ấm, nó **không chạm image** — nên đây là bằng chứng cho tính bất biến, không phải một cải thiện. Histogram được reset (restart orchestrator) trước mỗi lượt đo nên không mẫu nào lẫn giữa hai image.
  > Thứ image THẬT SỰ ảnh hưởng là **thời gian dựng pod lúc replenish/cold-path**, và AC hiện tại không hỏi câu đó — vẫn đúng như ghi chú cũ: *"người thứ hai bấm Start ngay sau người thứ nhất chờ bao lâu"* chưa AC nào hỏi.
- [ ] Từ `ready` tới prompt đầu tiên: **p95 < 500ms** (`dlp_gateway_attach_duration_seconds`).
  > **AC này tự mâu thuẫn, và metric nay đã tồn tại nên nhìn thấy được** (1.C-3, 2026-08-11). Câu chữ đo *`ready` → prompt*, nhưng `ready` chỉ được phát KHI byte stdout đầu tiên tới nơi (quyết định của 1.C-2: `ready` nghĩa là "đã attach thật", không phải "đã upgrade") — byte đầu tiên CHÍNH LÀ prompt, nên khoảng mà câu chữ mô tả bằng ~0 theo cấu tạo và không bao giờ đỏ được. Metric mà nó trỏ tới đo khoảng KHÁC: **101 → `ready`**, tức thời gian dial exec + dựng stream tới PTY. Đó mới là con số đáng gác. **Số đo đầu tiên: 0.708s cho một mẫu nguội** (dial lạnh, pod vừa claim) — **vượt ngưỡng 500ms**. Một mẫu chưa nói được p95; cần ≥ 50 mẫu như AC claim đã làm. Sửa câu chữ thành "từ 101 tới `ready`" rồi đo lại bằng một vòng lặp mở/đóng WS — **chưa làm ở chặng này**, ghi nợ.
- [x] Prompt đầu tiên vẽ **đúng bề rộng** cửa sổ (không gãy dòng) — chứng minh `init`-trước-dial hoạt động. → Đo mạnh hơn cả AC yêu cầu: `stty size` **trong pod thật** trả **`34 120`**, khớp TUYỆT ĐỐI `cols`/`rows` của frame `init` — không lệch 1, tức `set -g status off` của E4 đúng và `init`-trước-dial đúng. Đo qua WS thật trên cluster 2026-08-10; "không gãy dòng" là quan sát bằng mắt, còn con số này thì tái lập được.
- [ ] `CreateSession` 2 lần cùng `idempotency_key` → **cùng `session.id`**, số pod tăng đúng **1**.
- [ ] `GetSession` với `user_id` sai → **`NotFound`** (không phải `PermissionDenied`).
- [ ] `ExtendSession` với `expected_revision` cũ → `FailedPrecondition`; mỗi lần ghi `revision` tăng đúng 1.
- [ ] Gia hạn liên tục quá `HARD_CAP` → `expires_at` đứng yên, `hard_cap_reached=true`, FE nhận `expiring`.
- [ ] Có traffic → `ExtendSession` được gọi; **chỉ ping/pong → `expires_at` KHÔNG đổi**, WS đóng `4408` sau idle-window.
  > **Hai vế đầu ĐẠT, vế `4408` là một AC KHÔNG THỰC HIỆN ĐƯỢC như viết** (phát hiện khi làm 1.C-3, 2026-08-11). Vế 1–2 có test tự động (`TestGoPhimThiCoGiaHan` / `TestImLangThiKHONGGiaHan`, ca sau đo qua nhiều nhịp ping mà số lượt gia hạn **không tăng**) và có chứng minh trên cluster: hạn dịch 90s→180s→240s khi gõ. Vế 3 thì không: **không có đường nào phát `4408`, và cũng không nên có.** Hệ thống không có "idle-window" tách rời — một phiên im lặng đơn giản là hết `expiresAt`, reaper xoá pod, stream đứt, gateway hỏi Redis và đóng **`4404`**. Muốn phân biệt "chết vì idle" với "bị reap" thì orchestrator phải nói *lý do* reap, tức thêm field vào contract gRPC cho một khác biệt mà FE xử lý y hệt nhau (cả hai đều "phiên đã kết thúc, đừng retry"). **Đề xuất: bỏ `4408` khỏi vế AC này và khỏi bảng close code §6 ở P2**, thay bằng khẳng định `4404`. Không tự ý sửa contract ở chặng này vì nó đụng bảng mã FE sẽ switch trên đó.
- [ ] `ReapSession` gọi 2 lần → cả hai OK; gọi với `user_id` người khác → từ chối, pod **vẫn sống**.
- [ ] Sau claim, `pool:free` tự về `POOL_TARGET` trong ≤ 30s — **đo với `POOL_TARGET=1` và tới 3 session đồng thời** (trần = quota_hiệu_lực 4 − POOL_TARGET 1, xem D16). Session thứ 4 → pool rỗng → cold path thành công + `dlp_cold_path_total` tăng.
- [ ] **Chạm quota có tín hiệu riêng, không giả dạng lỗi:** ép tạo pod thứ 5 → `dlp_pool_replenish_quota_blocked_total` tăng, log `WARN` (KHÔNG phải `ERROR`), và orchestrator **không** backoff vô hạn.
- [ ] Xoá `session:{id}` khỏi Redis → sweep dọn pod mồ côi ≤ 1 chu kỳ. Xoá pod (key còn) → session chuyển `FAILED`. *Một PHẦN đã có proof runtime 2026-08-10: pod mang label `app=sandbox` mà không có hash `pod:{name}` bị sweep xoá đúng một chu kỳ sau khi hết `orphanGrace` (và **không** bị xoá trước đó — 340s im lặng). Nhưng ca dựng bằng cách **tạo pod không hash**, chưa phải ca **xoá `session:{id}` của một session đang chạy**; vế `FAILED` chưa chạy trên cluster. Không tick cho tới khi cả hai vế chạy đúng như viết.*
- [ ] **Quarantine không rò quota (B7 tầng 3):** đẩy tay một tên pod vào `pool:free` khi `pod:{name}.state ≠ free` → claim cách ly nó → sweep xoá **cả Pod lẫn hash** ≤ 1 chu kỳ, `dlp_pool_quarantine_size` về 0, và `kubectl -n dlp-sandbox get pods` **không** còn pod đó. *Không có nhánh này thì mỗi lần cách ly là −1 trên trần 4 và không ai thấy.*
- [ ] **Replenish đúng thứ tự (B2):** đảo thứ tự thành `RPUSH` trước `HSET state=free` → test phải **ĐỎ**. Ca chứng minh cửa sổ cách-ly-nhầm tồn tại, không phải kiểm nó vắng mặt.
- [ ] **Retry mất phản hồi (B3):** gọi `Claim()` hai lần cùng `sessionID` (mô phỏng timeout mạng sau khi script đã chạy) → lần hai trả **cùng `podName`**, số pod tăng đúng **1**, không rẽ cold-path.
- [ ] Tắt Postgres → `CreateSession` **vẫn thành công**, chỉ log `ERROR` audit.
- [ ] `sessions_audit` không có cột nào trả lời được "session X đang ở pod nào".
- [ ] **Reconnect thật (D3):** ngắt mạng 5s → vào lại thấy **đúng màn hình cũ**, scrollback còn, tiến trình đang chạy không chết. `tmux ls` trong pod chỉ có **1** session. ⏳ **HAI TRÊN BA** (đo trên cluster 2026-08-10): đóng WS rồi mở lại → vào đúng pod cũ, và `tmux capture-pane -p -S -50` **vẫn thấy dấu vết ghi trước khi ngắt** ⇒ nối lại là PHIÊN THẬT chứ không phải shell mới; `tmux ls` thấy đúng session `dlp`. **Vế "tiến trình đang chạy không chết" chưa đo** — chưa dựng ca có một tiến trình dài (vd `sleep 300 &` rồi ngắt) để khẳng định nó sống qua lần ngắt. Không tick cho tới khi đo vế đó.
- [ ] **Trần 1 WS không giết reconnect (D17):** đóng WS → `session:{id}:ws` về **0** trong ≤ 1s → mở lại **thành công** (không dính 429). Và: kill gateway giữa phiên (SIGKILL, không kịp `DECR`) → session vẫn mở lại được sau khi TTL của `session:{id}:ws` hết, **không khoá vĩnh viễn**. ⏳ **Vế thứ nhất ĐẠT trên cluster** 2026-08-10: đóng WS rồi mở lại thành công, không dính 429 (vế này cũng đã có test tự động ở 1.C-1). **Vế SIGKILL chưa đo trên cluster** — TTL của `session:{id}:ws` đã có test tự động khẳng định nó được đặt trong CÙNG một lượt atomic, nhưng ca "giết gateway giữa phiên rồi chờ TTL" thì chưa chạy thật.
- [x] Đóng WS → pod **không** bị xoá ngay; nối lại cùng `{id}` trong TTL vào đúng pod cũ. → Đo trên cluster 2026-08-10: đóng WS, mở lại cùng `{id}`, `ready.podName` trả **đúng pod cũ** (`sandbox-7d69d4975fe5`) và scrollback tmux còn nguyên.
- [ ] 2 replica gateway sau round-robin LB: mở/đóng 20 WS xen kẽ (**tuần tự, không chồng lấn** — trần là 1 WS/session), 0 lỗi.

### Terminal UX
- [x] 10 binary có mặt trong image: `zsh tmux git jq fzf zoxide fastfetch eza bat oh-my-posh`. → đủ 10, kiểm **trong pod thật** trên cluster 2026-08-10 (không phải chỉ `docker run` cục bộ).
- [x] `zsh -lic 'echo $COLORTERM'` → `truecolor`; `locale` báo UTF-8. → `truecolor` + `LANG=en_US.UTF-8`. *Kèm theo: đoạn keybinding `fzf --zsh` phải gác `[[ -t 0 ]]` — `zsh -lic` có `-i` nên `-o interactive` đúng nhưng KHÔNG có tty, và zle in `can't change option: zle` vào đúng stdout mà AC này đang đọc.*
- [x] **`eza --icons=always -la` in glyph thật, kiểm bằng CODEPOINT** (`grep -cP '[\x{E000}-\x{F8FF}]'`), không phải `?`. → **3** dòng có glyph PUA trong pod thật; **đối chứng `--icons=never` → 0**.
  > ⛔ **AC bản cũ hỏng ở HAI tầng, và tầng thứ hai chỉ lộ ra khi review đối kháng.**
  > **(a) `--icons` không bao giờ xanh được.** Không kèm giá trị nghĩa là `--icons=auto`, mà `auto` **tắt icon khi stdout không phải tty** — `| xxd` thì luôn là pipe. Đo cả ba ca: `--icons` qua pipe → **0** glyph; `--icons=always` qua pipe → **3**; `--icons` với `-t` (vẫn pipe vào `xxd`) → **0**.
  > **(b) `| xxd | grep -E "ee|ef"` thì ngược lại — nó xanh VÌ LÝ DO SAI.** Regex chạy trên toàn dòng xxd: cột offset `00000ee0:` khớp `ee`, và hai byte cạnh nhau `0xAE 0xE1` in ra `aee1` cũng khớp, dù **không byte nào là PUA**. Bản vá đầu tiên của chặng này chỉ sửa (a) nên đổi một phép kiểm **tự làm mù** lấy một phép kiểm **tự làm sáng** — cùng họ "suite xanh vì skip sạch". Chốt: kiểm codepoint bằng `grep -P`, và **bắt buộc chạy kèm ca đối chứng `--icons=never` phải ra 0** — một phép kiểm không thể đỏ thì không kiểm gì cả.
- [ ] **DinD offline (D4):** `docker info` trả cả client lẫn server; `docker build` một image `FROM scratch` rồi `docker run` nó — thành công **không cần mạng**.
- [ ] Dotfiles: file trong allowlist được copy; **symlink và `../` bị từ chối**, không ghi được ngoài `$HOME`.
- [x] Mở `/session`: DevTools Console **0 CSP violation**; gõ tiếng Việt / ký tự đa-byte không vỡ khi output cắt qua nhiều frame. → Đo trên cluster 2026-08-11 qua Chrome thật: 0 violation, **kèm đối chứng âm** chứng minh CSP đang thực thi (`wss://evil.example` → violation `connect-src`; ảnh cross-origin → violation `img-src`) — không có đối chứng thì "0 violation" đúng một cách vô nghĩa. `echo "phiên lab tiếng Việt ✓ $(hostname)"` trả về nguyên vẹn cả dấu lẫn ✓ (U+2713). ⇒ **`connect-src 'self'` CÓ phủ `ws://` cùng origin, `headers.ts` không cần sửa.**
- [ ] Tắt hardware acceleration → terminal vẫn chạy (fallback DOM renderer) + có `console.warn`.
- [ ] StrictMode dev: mount/unmount 3 lần → chỉ còn **1** WebSocket sống.
- [ ] `trivy image --severity CRITICAL --exit-code 1` pass **cục bộ trước khi merge**.

### Bảo mật (luật 5, 6, 8, 10 — P1 là phase sở hữu luật 10)
> **Hai vế authz chết ở hai bước khác nhau — phải kiểm RIÊNG.** Bước **e** (`token.sid == {id}`) chạy trước bước **g** (`hash.userId == token.sub`). Mọi ca "user B mở session của A" đều dừng ở **e** và **không bao giờ chạm g**. Nếu chỉ kiểm những ca đó, một implement thiếu hẳn bước g vẫn cho acceptance xanh toàn bộ — đúng loại tautology mà D-17′ phê phán. Ca cho bước g bắt buộc phải **forge token bằng khoá test**.

- [x] **IDOR — vế e:** user B, token hợp lệ của chính B, mở `/ws/session/{id-của-A}` → **403, không upgrade, apiserver không nhận request nào**. → `TestG13_VeE_UserBMoSessionCuaA` trên Redis THẬT. *Nói thẳng phần chưa đo được: vế "apiserver không nhận request nào" hiện đúng một cách tầm thường vì 1.C-1 chưa có lời gọi apiserver nào cả — nó chỉ thành một phép kiểm thật khi G4 tồn tại. Vế đo được và ĐÃ đo là **Redis không bị hỏi**: `spySessions` đếm, và một implement đảo thứ tự (đọc Redis trước rồi mới so `sid`) làm test đỏ.*
- [x] **IDOR — vế g (BẮT BUỘC, forge token):** token ký bằng khoá test với `sid == sessionA` nhưng `sub == userB` → **403**. Đây là ca DUY NHẤT chứng minh bước g tồn tại. BFF thật không mint được nó. → `TestG13_VeG_ForgeTokenSidCuaANhungSubLaB`; kiểm đột biến: vô hiệu bước g ⇒ ca này ĐỎ (và **chỉ** ca này).
- [x] Token của A + `sid` session A nhưng URL là session A' (A cũng sở hữu) → **403** (chặn dùng lại token chéo session; vẫn là vế e). → `TestG13_TokenDungLaiCheoSessionCuaChinhMinh`.
- [x] **`{id}` đoán bừa → 403 (KHÔNG phải 404).** Token chỉ mang đúng một `sid`, nên mọi `{id}` lạ đều chết ở bước e. *Bản trước ghi 404 — sai với thứ tự handshake đã pin.* Tính chất này là **tốt**: "id không tồn tại" và "id của người khác" trả cùng một mã, ở cùng một bước, cùng một đường code ⇒ không có kênh phụ để liệt kê session. Không được "sửa" thứ tự cho 404 dễ gặp hơn. → `TestG13_IdDoanBuaTra403ChuKhongPhai404` (3 dạng id); kiểm đột biến: vô hiệu bước e ⇒ cả 3 rơi xuống 404 và ca ĐỎ.
- [x] **404 chỉ khi session của CHÍNH MÌNH biến mất:** `token.sid == {id}` nhưng `session:{id}` không còn trong Redis (đã reap / TTL hết) → **404**. Đây là ca duy nhất bước f tới được. → `TestG13_404ChiKhiSessionCuaChinhMinhBienMat`.
- [x] Session `EXPIRED`/`REAPED` (key còn, status sai) → **409**, không dial exec. → `TestBuocH_SessionKhongOTrangThaiChayDuoc`, kèm ca khẳng định bước i **không** chạy khi bước h đã hỏng (thứ tự) và ca khẳng định dạng ĐẦY ĐỦ của enum (`SESSION_STATUS_CLAIMED`) **không** khớp — Redis giữ dạng ngắn, và nới điều kiện ở đó là cho qua một session mà orchestrator coi là chết.
- [x] **Luật 6:** token `aud=orchestrator` (loại BFF đang mint cho gRPC) → **401** — `aud` là thứ DUY NHẤT tách hai loại token, thiếu check này là token gọi orchestrator mở được shell; ký sai key → 401; `exp` qua → 401; thiếu `sid` → 401. → 6 ca trong `internal/authz`; kiểm đột biến: vô hiệu check `aud` ⇒ ĐỎ.
- [x] **Luật 6 — alg confusion (D15):** token với `alg: "none"` → 401; token `alg: "HS256"` ký bằng chính public key Ed25519 làm secret → **401**. Gateway phải ép `alg=EdDSA` phía server, không đọc `alg` từ header token. → ✅, **nhưng hai ca đầu tiên viết ra cho việc này là tautology** — xem hộp cảnh báo đầu §1.C. Ca thật sự gác allowlist là `TestAlgKhongPhaiEdDSAChetTruocKhiChamKhoa`: nó đo **thứ tự** (token sai `alg` chết trước khi gateway hỏi JWKS) bằng cách đếm hit endpoint, và nới allowlist làm nó ĐỎ.
- [ ] **JWKS rotation (D15):** xoay khoá Better Auth (đổi `kid`) → gateway **tự refetch** và verify token mới **không cần restart**; token cũ (kid cũ, chưa hết hạn) vẫn verify được nếu JWKS còn công bố kid đó. ⏳ **ĐÚNG MỘT NỬA.** Cơ chế đã có test đầy đủ (`TestVerifyTuRefetchKhiGapKidLa`: JWKS đổi từ `{kid-cũ}` sang `{kid-cũ, kid-mới}` giữa chừng, token mới verify được, token cũ vẫn qua) — nhưng chạy trên **endpoint JWKS giả**, chưa phải một lượt xoay khoá THẬT của Better Auth. Không tick cho tới khi xoay trên cluster. *Kèm theo, đã đóng một chế độ hỏng plan không nhắc: `apps/web` chết KHÔNG được kéo theo mọi phiên hợp lệ — cache cũ được dùng tiếp, có test.*
- [ ] **Luật 8:** WS mở bằng query-token → **401**; `grep -rn "URL.Query()"` = 0 ở đường đọc token; log gateway sau một phiên đầy đủ `grep -cE 'eyJ[A-Za-z0-9_-]{10,}'` = **0**; cookie có đủ `HttpOnly; Secure; SameSite=Strict; Path=/ws`. ⏳ **BA TRÊN BỐN.** query-token → 401 (`TestLuat8_TokenQuaQueryStringBiBoQua`); `URL.Query()` = 0 kết quả; và vế log nay là **test tự động** chứ không phải một lượt soát tay không ai nhớ chạy — `TestLuat8_LogKhongBaoGioChuaToken` chạy cả ca hỏng lẫn ca qua ở mức `Debug` rồi grep đúng regex của AC này (đột biến: log `cookie.Value` ⇒ ĐỎ). **Vế cookie attributes chờ G12** — chưa ai mint cookie `dlp_sandbox`.
- [x] **CSWSH:** handshake với `Origin: https://evil.example` → **403**. → `TestBuocA_OriginSaiBiTuChoi`, kèm khẳng định Redis chưa bị hỏi ở request đó.
- [x] **Origin vắng thì cho qua (contract §3a):** handshake **không có** header `Origin`, cookie hợp lệ → **101**. Đây là quyết định, không phải lỗ hổng: trình duyệt luôn gửi `Origin` nên CSWSH vẫn đóng, còn fail-closed sẽ chặn chính các lệnh `wscat` ở §Verify commands. → `TestBuocA_VangOriginThiChoQua`.
- [ ] **Luật 5:** frame vượt read-limit → đóng đúng close code đã pin sau spike; bơm 5 MiB/s → `4429` và RSS gateway không tăng quá 2× baseline; **WS thứ 2 trên cùng session (trần 1, D17) → 429 + `code:"SESSION_IN_USE"`**; bão 200 resize/s → coalesce, **không** đóng, và `stty size` trong pod khớp **chính xác** giá trị cuối (không lệch 1 — status bar tmux đã tắt ở E4). ⏳ **Chỉ vế trần WS xong** (`TestG13_TranMotWSChanDongThoiNhungKhongChanNoiLai` trên đường HTTP thật: WS thứ hai → 429 + `SESSION_IN_USE`, đóng cái thứ nhất → mở lại được, **không** dính 429). Read-limit / byte-rate thuộc G8, bão resize thuộc G6 — cả hai cần cầu exec của 1.C-2.
- [ ] **Pod:** `runtimeClassName == sysbox-runc`; `uid_map` cột 2 ≠ 0; không `hostPath` volume; `pids.max` là **số** không phải `max`; fork-bomb → pod chết, node `Ready`, 3 pod platform không restart.
- [ ] **NetworkPolicy:** từ trong pod `curl http://169.254.169.254/` timeout/deny; ping pod session khác deny.
- [ ] **VAP regression:** pod thiếu `runtimeClassName` → bị từ chối (chạy lại mỗi lần đổi pod builder).

---

## Verify commands

```bash
# ============ Gate 1.A ============
cd services/terminal-gateway
go list -m -versions k8s.io/client-go | tr ' ' '\n' | grep '^v0.34' | tail -3
go run ./cmd/spike-exec -pod "$POD" -ns dlp-sandbox -transport fallback -client
# trong phiên: chạy vim, kéo cửa sổ, rồi `stty size` — phải khớp cols/rows local

docker compose up -d redis
REDIS_URL=redis://:$REDIS_PASSWORD@127.0.0.1:6379/0 \
  go test ./services/orchestrator/internal/pool/... -run TestConcurrentClaim -race -count=20

# ============ Prerequisite ============
# Calico: chạy SAU khi cluster đã lên > 25h
ssh nghaiz@192.168.94.130 'sudo awk "/token:/{print \$2}" /etc/cni/net.d/calico-kubeconfig \
  | cut -d. -f2 | base64 -d | tr "," "\n" | grep exp; date +%s'    # exp PHẢI > now
redis-cli -a "$REDIS_PASSWORD" CONFIG GET notify-keyspace-events    # chứa E và x

# ============ gRPC lifecycle ============
grpcurl -plaintext -d '{"user_id":"u1","tier":"SANDBOX_TIER_SYSBOX","ttl_seconds":600,"idempotency_key":"k1"}' \
  localhost:9090 orchestrator.v1.SessionService/CreateSession        # gọi 2 lần: cùng session.id
grpcurl -plaintext -d '{"session_id":"'$SID'","user_id":"KHONG-PHAI-CHU"}' \
  localhost:9090 orchestrator.v1.SessionService/GetSession           # NotFound
curl -s localhost:8081/metrics | grep dlp_claim_duration_seconds_bucket

# ============ IDOR + luật 8 (acceptance bắt buộc) ============
# LƯU Ý: wscat KHÔNG gửi header Origin trừ khi có --origin. Contract §3a cho qua
# request vắng Origin, nên các lệnh dưới chạy được như viết. Thêm --origin vào để
# đo riêng nhánh "có Origin và đúng"; ca "Origin sai" nằm ở lệnh curl bên dưới.
O="https://app.example.com"
wscat --origin "$O" -c "wss://app.example.com/ws/session/$SID_A" -H "Cookie: dlp_sandbox=$TOKEN_B" -s dlp.terminal.v1  # 403 (vế e)
wscat --origin "$O" -c "wss://app.example.com/ws/session/$SID_A" -H "Cookie: dlp_sandbox=$TOKEN_A" -s dlp.terminal.v1  # 101
wscat --origin "$O" -c "wss://app.example.com/ws/session/$SID_A?token=$TOKEN_A"  -s dlp.terminal.v1                    # 401 (không cookie)
# id đoán bừa → 403 ở bước e (KHÔNG phải 404 — token chỉ mang đúng một sid)
wscat --origin "$O" -c "wss://app.example.com/ws/session/khong-ton-tai" -H "Cookie: dlp_sandbox=$TOKEN_A" -s dlp.terminal.v1  # 403
# 404 chỉ tới được khi sid KHỚP mà Redis đã mất key — reap session của chính A trước
grpcurl -plaintext -d '{"session_id":"'$SID_A'","user_id":"'$UID_A'","reason":"test"}' \
  localhost:9090 orchestrator.v1.SessionService/ReapSession
wscat --origin "$O" -c "wss://app.example.com/ws/session/$SID_A" -H "Cookie: dlp_sandbox=$TOKEN_A" -s dlp.terminal.v1  # 404
# vắng Origin hoàn toàn → vẫn 101 (contract §3a, quyết định có chủ ý)
wscat -c "wss://app.example.com/ws/session/$SID_A2" -H "Cookie: dlp_sandbox=$TOKEN_A2" -s dlp.terminal.v1             # 101
# trần 1 WS/session (D17): mở WS thứ hai khi WS thứ nhất còn sống
wscat --origin "$O" -c "wss://app.example.com/ws/session/$SID_A2" -H "Cookie: dlp_sandbox=$TOKEN_A2" -s dlp.terminal.v1 # 429 SESSION_IN_USE
curl -i -H "Origin: https://evil.example" -H "Cookie: dlp_sandbox=$TOKEN_A" \
     -H "Upgrade: websocket" -H "Connection: Upgrade" -H "Sec-WebSocket-Version: 13" \
     -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" -H "Sec-WebSocket-Protocol: dlp.terminal.v1" \
     "https://app.example.com/ws/session/$SID_A"                     # 403 (CSWSH)
grep -rn "URL.Query()\|r.FormValue" services/terminal-gateway/internal/     # 0 ở đường token
grep -rniE "wss?://[^\"']*(token|jwt|sid)=" apps packages && echo "VI PHẠM" || echo "OK"

# JWKS phải tới được từ gateway TRƯỚC khi code G2 (1.B0.5)
curl -s "$GATEWAY_JWKS_URL" | jq '.keys[0] | {kty,crv,alg,kid}'   # OKP / Ed25519 / kid khác rỗng
# gateway KHÔNG được tin alg trong header token
grep -rn 'alg' services/terminal-gateway/internal/authz/ | grep -vi 'EdDSA'   # rà tay: không nhánh nào đọc alg từ token

# RBAC — LƯU Ý cú pháp --subresource=exec; `can-i create pods/exec` trả kết quả SAI
# LƯU Ý 2 (sửa 2026-08-10): pod nền tảng chạy ở namespace `default`, KHÔNG phải
# `dlp-platform`, và SA tên `platform-gateway`/`platform-orchestrator` (theo release
# name của Helm). Bản cũ trỏ một SA KHÔNG TỒN TẠI — `can-i` với SA ma trả "no" mà
# không báo lỗi gì, nên AC "gateway exec = yes" sẽ đỏ giả và người đọc đi sửa RBAC
# đang đúng. Chỉ có `dlp-sandbox` (namespace của pod lab) là đúng như viết.
kubectl auth can-i create pods --subresource=exec -n dlp-sandbox \
  --as=system:serviceaccount:default:platform-gateway               # yes
kubectl auth can-i create pods -n dlp-sandbox \
  --as=system:serviceaccount:default:platform-gateway               # no
kubectl auth can-i create pods -n dlp-sandbox \
  --as=system:serviceaccount:default:platform-orchestrator          # yes

# ============ Image ============
docker build -t dlp-sandbox-base:slim images/sandbox-base
docker run --rm dlp-sandbox-base:slim bash -lc \
  'for b in zsh tmux git jq fzf zoxide fastfetch eza bat oh-my-posh; do
     command -v "$b" >/dev/null || { echo "MISSING $b"; exit 1; }; done; echo ALL-OK'
docker run --rm dlp-sandbox-base:slim zsh -lic 'echo $COLORTERM; locale | grep -i utf-8'
docker run --rm dlp-sandbox-base:slim bash -lc \
  'tmux new-session -d -A -s dlp; tmux new-session -d -A -s dlp; tmux ls | wc -l'   # 1
# status bar PHẢI tắt (D17/E4) — nếu không, window_height = client_height - 1.
# `tmux show` cần server đã chạy, nên tạo session TRƯỚC rồi mới hỏi (đo thật 2026-08-09).
docker run --rm dlp-sandbox-base:slim bash -lc \
  'tmux new-session -d -s t -x 200 -y 50
   tmux show -gv status                                       # off
   tmux display -p -t t "#{window_width}x#{window_height}"'   # 200x50, KHÔNG 200x49
mkdir -p /tmp/df && printf 'echo hi\n' > /tmp/df/.zshrc && ln -sf /etc/shadow /tmp/df/.evil
docker run --rm -v /tmp/df:/mnt/dotfiles:ro dlp-sandbox-base:slim bash -lc \
  'grep -q hi "$HOME/.zshrc" && echo "copy OK"; [ ! -e "$HOME/.evil" ] && echo "symlink từ chối OK"'
trivy image --severity CRITICAL --exit-code 1 dlp-sandbox-base:slim

# ============ Pod hardening (khoảng trống thật) ============
kubectl exec -n dlp-sandbox $POD -- cat /sys/fs/cgroup/pids.max     # số, không phải "max"
kubectl exec -n dlp-sandbox $POD -- cat /proc/self/uid_map          # cột 2 != 0
kubectl get pod -n dlp-sandbox $POD -o jsonpath='{.spec.volumes}'   # không có hostPath
kubectl exec -n dlp-sandbox $POD -- curl -m 3 http://169.254.169.254/ ; echo "exit=$?"  # deny
# DinD offline (D4) — KHÔNG dùng `docker run hello-world`, nó cần pull
kubectl exec -n dlp-sandbox $POD -- sh -c \
  'printf "FROM scratch\n" > /tmp/D && docker build -q -t t /tmp && docker images t'

# ============ Cổng chung ============
pnpm turbo run lint typecheck build test
make go-build && make go-test && make go-vet && make env-check && make proto-breaking
```

---

## Risk Assessment (P1) — hợp nhất 3 lane, đã đo lại

| Rủi ro | L | I | Score | Mitigation |
|---|---|---|---|---|
| **R0 — Calico CNI token 24h: cluster mất khả năng tạo pod, IM LẶNG.** Pod cũ vẫn Running nên lỗi ẩn hoàn toàn. **ĐANG XẢY RA, đã chữa tạm 2026-08-09.** | 5 | 5 | **25** | D5 + task 1.B0.1 là việc **đầu tiên**, trước cả spike. Canary tạo-pod trong cron/CI để lỗi lộ ngay. `rollout restart` KHÔNG phải fix. |
| **R1 — WS ⇄ pod-exec streaming** (transport, resize, đóng stream, backpressure) | ~~4~~ **2** | 5 | ~~20~~ **10** | *Hạ bằng spike 1.A-1 (2026-08-09): cả 5 tiêu chí xanh đo được trên pod Sysbox thật — WS `v5.channel.k8s.io` thắng, resize 20ms, `-race` sạch, không leak.* Rủi ro còn lại là **đường đóng**: `exit 137` không phân biệt reap với `kill -9` ⇒ G5 phải tra Redis mới chọn được `4404` (chi tiết trong report, chưa implement). |
| **R2 — Warm-pool race, double-claim** | ~~4~~ **1** | 4 | ~~16~~ **4** | *Đóng bằng spike 1.A-2 (2026-08-09), nhưng chỉ sau khi review đối kháng chỉ ra bằng chứng ban đầu phủ **nửa** rủi ro: test đua dùng seed toàn tên duy nhất, nên "0 podName trùng" đến từ seed chứ không từ script — script khi đó vẫn double-claim thật nếu `pool:free` có tên trùng.* Giờ script kiểm `pod:{name}.state == "free"` và cách ly bản trùng sang `pool:quarantine`; `TestClaimRejectsDuplicateInPool` là ca chứng minh. Còn lại: B2 replenish đẩy sai đầu LIST (LIFO thay FIFO) — `TestClaimFIFO` gác phía claim, B2 tự gác phía push. |
| **R3 — Cookie không tới gateway vì khác origin** ⇒ thiết kế luật 8 chết ở deploy | 3 | 5 | **15** | 1.B0.4 **trước** khi lane FE code; Ingress prod + reverse proxy dev; nếu không chốt được thì phải mở lại D1. |
| **R4 — IDOR vào shell người khác** (thiếu một vế authz) | 3 | 5 | **15** | Hai vế (`token.sid=={id}` + `redis.userId==token.sub`), fail **trước** upgrade; G13 test tự động trong CI, không kiểm tay. |
| **R5 — Sysbox pod tạo động fail** | 3 | 5 | **15** | *Hạ từ 4→3 bằng thực nghiệm 2026-08-09: pod Sysbox đầy đủ securityContext Ready trong 6.06s, dockerd trong pod sống.* Rủi ro còn lại là builder quên field ⇒ test regression VAP + log nguyên văn message API server. |
| **R6 — AC bảo mật là tautology** ⇒ tưởng cô lập mà không (`drop:[ALL]` bị Sysbox bỏ qua) | 4 | 3 | **12** | D-17′/D-22′ viết lại AC theo proof runtime. Nguyên tắc: mọi check đọc-lại-manifest phải có một check runtime đi kèm. |
| **R7 — Quota chỉ đủ 4 pod đồng thời** (ba nguồn đang nói 20/10/4) | 4 | 3 | **12** | D16: `POOL_TARGET` từ env, **mặc định 1** trên lab. Công thức `trần đồng thời = quota_hiệu_lực − POOL_TARGET` ghi thẳng vào B2 + AC. `dlp_pool_free_size` + `dlp_cold_path_total` + `dlp_pool_replenish_quota_blocked_total` để thấy nghẹt. Dựng số quota thật trước khi hứa số session đồng thời ở P3. |
| **R20 — Khoá ký sandbox token không có chủ** ⇒ G2 không implement được, hoặc đẻ ra khoá thủ công phải xoay vòng | 4 | 4 | **16** | D15 + task 1.B0.5: dùng lại JWKS Better Auth (đã xác minh có `/api/auth/jwks`, EdDSA/Ed25519, `signJWT` nhận `overrideOptions`). AC rotation + AC alg-confusion. Kiểm `curl $GATEWAY_JWKS_URL` **trước** khi code G2 — 404 ở đó là dừng ngay. |
| **R21 — Hai client tmux tranh kích thước cửa sổ** ⇒ mở tab thứ 2 phá terminal đang có | 4 | 3 | **12** | D17: `MAX_WS_PER_SESSION=1` + `set -g status off`. *Đã đo thật trên tmux 3.4, không phải rủi ro giả định: client2 (80×24) attach làm window của client1 (200×50) tụt xuống 80×23 và lật qua lại mỗi keystroke.* TTL trên `session:{id}:ws` để crash gateway không khoá vĩnh viễn session. |
| **R22 — Kubelet restart (D-19′) trên cluster 1-node trùng lúc token Calico cũ** ⇒ tự gây ra chính sự cố R0 | 3 | 5 | **15** | D-19′ phụ thuộc cứng 1.B0.1; trình tự: restart calico → kiểm token còn hạn → đổi kubelet → canary tạo pod. Không làm lúc đang demo. |
| **R8 — Reaper mất event keyspace** ⇒ pod sống mãi, ăn hết quota | 4 | 3 | **12** | Hai tầng; **sweep là đường chính**, pub/sub chỉ là đường nhanh. `dlp_reaper_orphan_pods_total` > 0 kéo dài = báo động. |
| **R9 — PID limit vắng** ⇒ fork-bomb hạ node 1-node | 3 | 4 | **12** | D-19′; test fork-bomb là AC bắt buộc. |
| **R10 — Redis/Postgres vắng trong cluster** ⇒ CrashLoop khi bật `RequireDataStores` | 4 | 3 | **12** | 1.B0.2 trước B3. Không bật `RequireDataStores()` cho tới khi service in-cluster xanh. |
| **R11 — Contract Redis nở thêm mà lane khác không biết** | 3 | 4 | **12** | 1.B0.3 pin trước fan-out; sửa `redis-key-vectors.json` TRƯỚC để cả hai suite đỏ đúng chỗ thiếu. |
| **R12 — Trivy CRITICAL chặn `main`** sau khi image béo lên | 3 | 4 | **12** | Quét cục bộ **trước khi merge** (job `images` chỉ chạy trên main); ưu tiên gói universe hơn binary bên thứ ba. |
| **R13 — Gateway không có credential gọi `ExtendSession`** | 3 | 3 | 9 | ~~D13 mTLS + `system_component`; chốt trước G7.~~ **Đã chốt 2026-08-11 khi làm G7 — và chốt là HOÃN CÓ ĐIỀU KIỆN, xem 1.C-4.** Hai đính chính so với bản trên: (1) `ExtendSession` **không có `oneof actor`**, nó mang `user_id` phẳng, nên `system_component` không áp dụng cho RPC này — gateway điền `user_id` từ `sub` của token đã verify, đúng như proto yêu cầu; (2) mTLS chưa dựng được (không cert-manager, orchestrator từ chối khởi động với `grpcRequireMtls=true` vì chưa có creds), và gateway dial plaintext **không** làm rủi ro nặng thêm vì `apps/web` đã gọi cùng cổng không xác thực từ G12. |
| R14 — WebGL không khả dụng (v6 đã bỏ canvas renderer) | 3 | 3 | 9 | `onContextLoss` → fallback DOM + `console.warn`; test thủ công với hardware accel tắt. |
| R15 — `pwsh` `.deb` vỡ dependency trên 26.04 | 3 | 3 | 9 | Ghim version + sha256, smoke `pwsh -v` trong Dockerfile; vỡ thì `INCLUDE_PWSH=0`, ghi nợ, **không chặn P1**. |
| R16 — Image phình ⇒ pull chậm ⇒ hỏng mục tiêu claim < 1s | 3 | 3 | 9 | Ngưỡng size trong AC; pre-pull lên node lab; tách biến thể chỉ khi đo được (D12). |
| R17 — FE hiểu nhầm `1006` là "gateway chết" | 4 | 2 | 8 | Contract §7 + F9 probe tRPC `session.get`. |
| R18 — Dotfiles bị lợi dụng ghi ngoài `$HOME` | 2 | 4 | 8 | Allowlist + từ chối symlink/`..` + cap size; ca test symlink trong AC. |
| R19 — Reaper xoá nhầm pod đang active | 3 | 4 | 12 | `lastActiveAt` cập nhật từ traffic thật (không phải ping); grace period; TTL cứng tách idle-timeout; idempotent. |
| **R23 — `idem:{key}` không scope theo user** ⇒ user B trùng `idempotency_key` của A thì nhận lại **session của A**, rò `sessionId` và biến vế authz `g` thành lớp duy nhất chặn B vào shell của A | 3 | 5 | **15** | *Đã đóng ở 1.B0.3 (2026-08-09, do review đối kháng phát hiện):* key đổi thành `idem:{userId}:{key}`, hai đoạn validate riêng, có test "hai user cùng key ra hai key khác nhau" — ca duy nhất chứng minh scope tồn tại. Thêm regex khớp validator vào zod của BFF để từ chối ở biên gần client nhất. |
| **R24 — JWKS đi qua HTTP trần trong namespace platform, không có NetworkPolicy** ⇒ ai chiếm được Service `-web` phục vụ JWKS giả, gateway "refetch khi gặp `kid` lạ" (D15) nạp khoá đó và verify token giả → shell của mọi session | 2 | 5 | **10** | *Sửa mô tả 2026-08-10 theo cluster thật:* **namespace platform KHÔNG tồn tại** — cả 5 pod nền tảng chạy ở **`default`**. Chart chỉ có NetworkPolicy cho `dlp-sandbox`. Hệ quả nặng hơn bản cũ ghi: không có namespace riêng thì **không có seam nào để đặt NetworkPolicy** tách web↔gateway↔orchestrator, nên mitigation "NetworkPolicy cho namespace platform" hiện **không thực hiện được** chứ không phải "chưa làm". Đóng ở **P3** theo đúng thứ tự: (1) tách release sang namespace riêng, (2) NetworkPolicy, (3) hoặc pin JWKS/mTLS giữa gateway ↔ web. Chưa khai thác được từ ngoài (cần đứng trong cluster). Ghi ở đây để nó không biến mất — đây là điểm tin cậy DUY NHẤT của luật 6 và luật 10. |

| **R25 — Cổng gRPC orchestrator không có xác thực nào** ⇒ `user_id` là field client tự khai, và bất kỳ workload nào tới được `:9090` cũng cạn được trần 4 pod (DoS toàn nền tảng, không cần biết bí mật nào) | 3 | 4 | **12** | *Phát hiện 2026-08-09 bằng review đối kháng PR B1–B4; trước đó KHÔNG có task/AC/risk nào nhắc tới — D13 chỉ phủ đường gateway→orchestrator.* Giao **B0′ → làm trong B6** cùng mTLS của D13. ~~Rủi ro **chưa hiện thực** vì `apps/web` chưa có client gRPC; hạn chót là ngày G12 nối `session.ts` vào.~~ Rò dữ liệu thì không: `GetSession`/`ClaimSession` đòi cả `session_id` 128-bit lẫn `user_id` khớp. **⛔ Cập nhật 2026-08-11: HẠN CHÓT ĐÃ TRÔI QUA. Rủi ro nay ĐÃ HIỆN THỰC** — `session.ts` nối vào từ G12 (2026-08-11) và cổng vẫn `grpcRequireMtls: 'false'`, nên `user_id` trong mọi RPC vẫn là field client tự khai. 1.C-3 thêm consumer **thứ hai** (gateway gọi `ExtendSession`) trên cùng cổng đó. Dòng Timeline của G12 ghi "R25 ĐÓNG" là **nhầm với R20**. Chuyển sang **1.C-4**, và đó là chương duy nhất còn lại của lane gateway. |

**Tám mục ≥ 15 (R0, R1, R2, R3, R4, R5, R20, R22)** phải có mitigation **chạy xanh** trước khi task phụ thuộc bắt đầu.

*Cập nhật 2026-08-09 sau Gate 1.A:* **R1 hạ 20→10** và **R2 hạ 16→4** — cả hai bằng số đo trên hạ tầng thật, không phải bằng lập luận. Còn **sáu** mục ≥ 15: R0 (chờ đủ 25h/37h canary), R3, R4, R5, R20, R22.

---

## Timeline (P1)

| Nhóm | Effort | Phụ thuộc |
|---|---|---|
| 1.B0.1 Calico | **S** | 🔴 Chặn TẤT CẢ |
| 1.B0.2 Redis+PG in-cluster · 1.B0.3 contract · 1.B0.4 origin · 1.B0.5 JWKS | **M** | Song song nhau; B0.3 chặn spike claim, B0.4 chặn lane FE, **B0.5 chặn G2** |
| 1.A-1 spike WS⇄exec | ~~M~~ **✅ xong 2026-08-09** | HARD-GATE **đã mở** — 1.C chạy được |
| 1.A-2 spike claim atomic | ~~M~~ **✅ xong 2026-08-09** | HARD-GATE **đã mở** — 1.B chạy được |
| 1.B orchestrator (B1–B9) | **L** | Đường găng |
| 1.C gateway (G1–G13) | **L** · **1.C-1 ✅ xong 2026-08-10** (G1, G2, G3, G11, G13 + bước i) · **1.C-2 ✅ xong 2026-08-10** (G4–G6, cầu exec — **đã gõ được lệnh thật trên cluster**) · **G12 ✅ xong 2026-08-11** (cookie thật, 18/18 e2e — đóng **R20**, KHÔNG phải R25) · **1.C-3 ✅ xong 2026-08-11** (G7–G10: extend theo traffic thật, rate-limit, metrics) · **1.C-4 mTLS còn nợ** (D13/R13/R25, **M–L**) | Đường găng, song song 1.B. **1.F hết bị chặn bởi G12** kể từ 2026-08-11; còn chặn bởi WS contract + B0.4 (cả hai đã xong) ⇒ lane FE mở được ngay. 1.C-4 **không chặn 1.F**. |
| 1.D bốn khoảng trống | **S**×4 | D-17′/D-21′/D-22′ song song hoàn toàn; **D-19′ phụ thuộc 1.B0.1** (restart kubelet, xem R22) |
| 1.E image | ~~M~~ **E1–E5 + E10 ✅ xong 2026-08-10** · E6–E9 còn nợ | Warm-pool đã chạy image thật; E7 (DinD) chặn AC "DinD offline" (D4) |
| 1.F FE | ~~M–L~~ **✅ xong 2026-08-11** (F1–F11; terminal gõ được lệnh thật trong trình duyệt, 0 CSP violation có đối chứng âm) | Đóng luôn câu hỏi CSP mà G12 để lại ⇒ `headers.ts` không phải sửa. Lôi ra lệch contract `hardCapAt` và một lỗi chặn-người-dùng của lane orchestrator (pod chết trong `pool:free`). |
| **Tổng P1** | **L (~3 tuần)** | Đường găng: `1.B0.1 → 1.B0.3 → 1.A → (1.B ∥ 1.C) → tích hợp`. 1.E-1 phải chen sớm. |

---

## Đã sửa gì so với bản 2026-08-07

1. **SPDY → `NewFallbackExecutor(ws, spdy)`** — cluster là K8s v1.34.10 nơi WebSocket exec là beta bật mặc định, Stable ở 1.35; `kubectl` đã mặc định WS từ 1.31.
2. **`rediskeys` chuyển sang `services/shared/`** — gateway không compile được nếu import từ `internal/` của orchestrator. Chặn ở compile, không phải rủi ro.
3. **Field hash `session:{id}` chưa từng được pin** ở đâu cả — chỉ pin tên key. Đây đúng kiểu drift mà `contract-first-integration.md` tồn tại để chặn, và chỉ lộ ở runtime.
4. **Token transport chốt cookie** — bản cũ mâu thuẫn với chính nó (task 12 nói "cookie HOẶC subprotocol", task 27 đã chốt cookie). Kèm hệ quả topology mà bản cũ không ghi.
5. **`docker.sock` tồn tại trong pod DinD** — verify cũ kỳ vọng "No such file" nên **luôn sai**; socket đó là của dockerd bên trong, không phải host sock.
6. **`drop:[ALL]` bị Sysbox bỏ qua ở runtime** — AC cũ là tautology.
7. **Thiếu hoàn toàn task cài Docker vào image** dù AC đòi chạy được docker; và NetworkPolicy default-deny chặn pull ⇒ D4 đổi AC sang DinD offline.
8. **"Reconnect trong TTL" không khả thi như mô tả** — `pods/exec` mỗi lần attach là tiến trình mới ⇒ D3 thêm tmux.
9. **Nerd Font đặt sai chỗ** (image → `packages/terminal`); **`terminal-icons` xếp nhầm** là công cụ Linux (nó là module PowerShell).
10. **`apps/web` chưa có tRPC client**, `TRPCContext` không có `resHeaders` nên **không Set-Cookie được** — cả hai là tiền đề mà bản cũ giả định sẵn có.
11. **`infra/k8s/pod-template-sandbox.yaml` không tồn tại**; bảng ownership trỏ file ma ⇒ D8.
12. **Metric "claim latency" gateway không đo được** — claim xảy ra ở orchestrator trước khi WS tồn tại. Gateway đo **attach** latency.
13. **`pool:free` chưa pin kiểu dữ liệu**, ba nguồn nói khác nhau ⇒ D6.
14. **`idempotency_key` bắt buộc trong proto nhưng namespace Redis không có key nào cho nó.**
15. **Redis chưa bật keyspace notification** ⇒ reaper pub/sub sẽ không nhận event nào và im lặng.
16. **Comment proto cấm *ghi* Redis từ gateway, không cấm *đọc*** ⇒ D2 giải mâu thuẫn task 10/15.

---

## Đã vá gì sau PR #22 (soát lại lần 2, 2026-08-09)

Review đối kháng bản PR #22. Ba phát hiện đến từ **thực nghiệm**, không phải đọc plan.

### Chặn (phải xong trước khi cook)

1. **AC "id đoán bừa → 404" mâu thuẫn với chính handshake đã pin.** Bước e (`token.sid == {id}` → 403) chạy **trước** bước f (Redis tồn tại → 404), nên id lạ luôn chết ở e. Verify command cũ kỳ vọng 404 sẽ **luôn đỏ**. Sửa AC + verify sang 403, và mô tả lại ca duy nhất chạm được 404. Thêm §3b vào contract.
2. **Không task nào sinh ra khoá ký sandbox token.** Plan nhắc "key riêng của gateway" 3 lần nhưng `jwt.ts` chỉ có `mintAccessTokenFor`, gateway 0 dòng JWT, `.env.example`/`ci.env` 0 biến khoá ⇒ G2 không implement được, và G11 (env-drift) sẽ đỏ. Chốt **D15**: dùng lại JWKS Better Auth (xác minh trong `node_modules`: `/api/auth/jwks`, EdDSA/Ed25519, `signJWT` có `overrideOptions`). Thêm **1.B0.5** + AC rotation + AC alg-confusion.
3. **`POOL_TARGET=3` làm AC replenish bất khả thi.** Đo trên cluster sống: quota hiệu lực **4 pod** ⇒ `POOL_TARGET=3` phục vụ đúng **1** user rồi replenish chết vĩnh viễn vì quota. Chốt **D16**: `POOL_TARGET=1` + công thức `trần đồng thời = quota_hiệu_lực − POOL_TARGET` + metric riêng cho ca chạm quota.
4. **D-19′ không phải "song song hoàn toàn".** Nó restart kubelet trên cluster **1-node** — nếu token Calico đang cũ thì không pod nào quay lại, tức tự tay tạo ra R0. Buộc phụ thuộc 1.B0.1; thêm **R22**.

### Cao

5. **AC IDOR chỉ kiểm vế yếu.** Cả hai ca IDOR cũ đều dừng ở bước e và **không bao giờ chạm bước g** (`hash.userId == token.sub`) — implement thiếu hẳn g vẫn cho acceptance xanh. Thêm ca **forge token** (`sid=sessionA`, `sub=userB`) vào G13 + AC.
6. **Mọi verify `wscat` thiếu `Origin`, và hành vi "vắng Origin" chưa được định nghĩa.** Chốt ở contract **§3a**: có `Origin` thì phải đúng, vắng thì cho qua — trình duyệt luôn gửi `Origin` nên CSWSH vẫn đóng, còn fail-closed thì chặn chính bộ acceptance. Thêm `--origin` vào các lệnh + AC cho nhánh vắng.
7. **tmux dùng chung + trần 2 WS đánh nhau về kích thước cửa sổ.** *Đo thật trên tmux 3.4:* client2 (80×24) attach làm window của client1 (200×50) **tụt xuống 80×23**, rồi lật qua lại mỗi keystroke — tab thứ hai **phá** terminal đang có. Chốt **D17**: `MAX_WS_PER_SESSION=1` (reconnect không ảnh hưởng) + TTL trên `session:{id}:ws` để crash gateway không khoá vĩnh viễn. Thêm **R21** + contract §3c.
8. **AC Calico ">25h kể từ lần deploy gần nhất" tự vô hiệu hoá.** Cron restart mỗi 12h ⇒ "lần deploy gần nhất" luôn ≤ 12h, điều kiện không bao giờ thoả **đúng lúc bản vá bắt đầu chạy**. Đo từ **lúc cài cron**; thêm yêu cầu canary phải đỏ ít nhất một lần có chủ ý.

### Kèm theo (phát hiện phụ từ cùng thực nghiệm)

9. **Status bar tmux ăn 1 dòng** (200×50 → window 200×**49**) ⇒ `stty size` lệch so với `rows` FE gửi. Thêm `set -g status off` vào E4; AC resize đo khớp **chính xác**, không mang số magic "trừ 1".
10. **Debounce resize lệch giữa hai tài liệu** — contract §4 nói 50ms, F4 nói 100ms. Contract là SSOT ⇒ F4 sửa về 50ms.

---

## Spike sửa gì (Gate 1.A, 2026-08-09)

Hai spike chạy xong, gate xanh. Ba giả định của plan **sai khi đo thật** — sửa ở đây để lane 1.C không đi theo bản cũ.

1. **`tty=true` + `stderr=true`: apiserver KHÔNG từ chối.** Plan viết "apiserver từ chối" và bảo lane gateway chờ một lỗi. Thực tế: `err == nil`, kubelet âm thầm đặt `stderr=false`, client-go cũng không tạo stream stderr, và byte của stderr gộp vào stdout (đúng hành vi PTY). Hệ quả: một `Stderr: w` để nhầm sẽ **không bao giờ nhận byte** và **không có lỗi nào để phát hiện**. G4 sửa thành "để `Stderr` vắng, có comment".
2. **Read-limit đóng bằng `1009`, không phải `4413`.** `SetReadLimit` của `coder/websocket` tự đóng trong tầng thư viện, code ứng dụng không thấy frame vi phạm nên không có chỗ phát mã ứng dụng. Contract §6 đã pin `1009`. `4429` vẫn là mã ứng dụng vì byte-rate do code tự đếm.
3. **`exit 137` không đủ để biết pod bị reap.** Xoá pod giữa phiên trả `CodeExitError(137)` — trùng với `kill -9` hợp lệ bên trong pod. Bridge spike vì thế đóng bằng `1000` và FE sẽ hiểu là "tự gõ exit". G5 phải tra Redis trước khi chọn `4404` vs `1000`.

Ba thứ nhỏ hơn, đã ghi vào task tương ứng: `Next()` phải block (G6) · bão resize lắng sau ~900ms nên debounce FE vẫn cần (G6/F4) · log `Unhandled Error` của client-go in ở mức `E` trên đường thành công (G5/G10).

Điều **không** đổi: `NewFallbackExecutor(ws, spdy)` đúng như D-chốt — WS thắng với `v5.channel.k8s.io`, SPDY chưa từng chạy, và `fallback` không tốn thêm gì (404.6ms ≈ ws 405.8ms).

---

### Còn để ngỏ (không chặn cook, ghi lại để P2/P3 không quên)

- **D2 (gateway đọc Redis):** lý do "tránh round-trip gRPC" yếu — G7 đã bắt gateway phải có gRPC client + mTLS, và mở WS là 1 lần/kết nối. Cái giá thật là biến field hash `session:{id}` thành contract liên-service mà proto không mô tả (chính lý do phải đẻ ra 1.B0.3). `GetSession` còn gộp 404/403 thành một, tốt hơn cho chống oracle. **Giữ nguyên D2 ở P1**, xem lại ở P2 nếu drift field xảy ra thật.
- ~~**`SESSION_TTL` chưa được pin trong D11**~~ ✅ **ĐÓNG ở B5–B9 (PR #27):** chốt **`SESSION_TTL=1h`**, nằm dưới `HARD_CAP=2h` nên hai đồng hồ vẫn phân biệt được. Verify command cũ ghi `ttl_seconds: 600` là **tham số của lời gọi**, không phải default của service — hai thứ khác nhau, không mâu thuẫn.
- ~~**Migration Postgres chưa tự động hoá**~~ ✅ **ĐÓNG — nhưng chỉ sau bản vá 2026-08-10, KHÔNG phải ở B8.**
  > ⛔ **Đính chính (cùng ngày, sau khi đo).** Bản ghi buổi sáng 2026-08-10 đánh dấu mục này "đóng ở B8 (PR #27)" — **sai**, và sai vì đọc plan thay vì chạy thử. `helm install` THẬT vào namespace nháp cho thấy đường **fresh install + Postgres của chart KHÔNG BAO GIỜ chạy được**: Job mang `helm.sh/hook: pre-install`, mà hook `pre-install` chạy trước TOÀN BỘ pha apply thường, nên lúc Job khởi động thì `datastore-postgres.yaml` (resource thường) **chưa tồn tại** — `kubectl get deploy,svc` trả `No resources found` đúng lúc Job đang chạy. Cả 3 lượt Job treo ở `applying migrations…` rồi cháy `activeDeadlineSeconds`, `helm install` ABORT.
  >
  > **Vì sao nó sống sót:** từ trước tới nay chỉ có `helm upgrade` lên một Postgres đã chạy sẵn từ chart đời trước ⇒ đường DUY NHẤT hỏng cũng là đường DUY NHẤT chưa ai đi. Và `helm template` **không thể** phát hiện — nó render giống hệt trong cả hai ca, nên "kiểm bằng template + đọc tài liệu Helm" (đúng những gì PR #27 làm) là phép thử mù với đúng lỗi này. Đây là lý do `unverifiedClaims` liệt kê "Job migration chưa từng được `helm install` THẬT" — và nó đã chỉ đúng chỗ.
  >
  > **Còn tệ hơn tình trạng cũ:** món nợ gốc là "web lên nhưng thiếu migration ⇒ `/api/auth/jwks` trả 500"; B8 biến nó thành "`helm install` hỏng hẳn".
  >
  > **Bản vá:** `helm.sh/hook: post-install,pre-upgrade`. Fresh install chạy migration SAU khi Postgres đã apply; upgrade giữ nguyên thứ tự schema-trước-code. Chứng minh cả hai đường trên cluster thật: fresh install → `deployed` + `enum_range(session_event)` trả đủ 6 giá trị đúng thứ tự trong Postgres của release; upgrade → revision 2 `deployed`. **Đánh đổi đã biết và chấp nhận:** ở lần install ĐẦU TIÊN, web có thể lên trước khi migration xong và trả 500 ở route đụng DB (gồm `/api/auth/jwks` mà G2 phụ thuộc) trong vài chục giây — nó TỰ KHỎI, còn `helm install` abort thì không. **Độ dài cửa sổ đó chưa đo** (probe chạy với `web.enabled=false`) — ghi nợ ở đây.
- **Cổng Trivy chạy SAU `push: true`** (phát hiện khi rà 2026-08-10). Image có CRITICAL **vẫn được publish lên ghcr**; cổng chỉ làm run đỏ chứ không chặn artifact — đúng chế độ hỏng mà #28 mô tả nhưng chỉ vá phần CVE, không vá thứ tự. Sửa được bằng `push: false` + `load: true` → quét → bước push riêng, hoặc chấp nhận và ghi rõ "tag đỏ vẫn tồn tại trên registry". **P3.**
- **`make` không có trên máy dev Windows** ⇒ mọi verify command dạng `make go-test` / `make proto-check` / `make env-check` trong hai phase doc **không chạy được như viết**. Đường thay thế đã kiểm 2026-08-10: `go test ./...` lặp qua `go list -m`, `buf lint`/`buf breaking --against '.git#ref=HEAD~1'`/`buf generate`, `node scripts/env-check.mjs`. **Và phải tự export `REDIS_URL`/`DATABASE_URL`** — root `.env` chỉ có 6 biến của compose, thiếu chúng thì 81 test Go tự SKIP và suite xanh mà không kiểm gì.
- **LimitRange 1Gi cho pod DinD** có thể chật với dockerd + `docker build` — đo RSS thật ở 1.E rồi mới bàn chỉnh, đừng đoán. *(1.E-1 chưa trả lời được: E7/DinD chưa làm, image hiện chỉ chạy `sleep infinity` nên RSS không đại diện.)*
- **`images/sandbox-base/Dockerfile` KHÔNG có cổng nào ở PR — đã vá ở chặng này, ghi lại vì nó là một họ lỗi.** Job `images` chỉ chạy trên `main`, nên tới 1.E-1 file này là file duy nhất không ai gác lúc review. Chuỗi hậu quả cụ thể: PR nâng `OMP_VERSION`/`FASTFETCH_VERSION` mà quên digest ⇒ `sha256sum -c` đỏ ⇒ **`ci-ok` vẫn XANH ở PR** (job bị skip) ⇒ merge ⇒ main đỏ ⇒ **không có tag `sha-<short>` nào cho `dlp-sandbox-base`** ⇒ vì chart nay ghép `sandboxImage` từ `image.tag`, lần deploy kế tiếp trỏ vào một tag không bao giờ tồn tại ⇒ warm-pool ImagePullBackOff. Đã thêm job `sandbox-image` (build `push:false` + smoke 11 binary + PID 1 + Trivy CRITICAL) vào `needs` của `ci-ok`. **Bài học chung: "job chỉ chạy trên main" nghĩa là file đó không có review gate — mỗi lần file như thế bắt đầu có logic thật, phải thêm cổng PR-time.**
- **Cold-path khi image chưa side-load: `CreateSession` treo ~2 phút rồi mới lỗi.** `pool.waitReady` chờ tới `DefaultReadyTimeout` và `ImagePullBackOff` là trạng thái `Pending` chứ không terminal, nên không có đường thoát sớm. Không rò quota (manager dọn pod), nhưng UX là hai phút im lặng. Chưa vá — cần một nhánh nhận diện `ImagePullBackOff`/`ErrImagePull` là lỗi terminal.
- **Warm-pool không rollout theo image — MỚI, phát hiện 2026-08-10 ở 1.E-1.** Đổi `SANDBOX_IMAGE` rồi `helm upgrade` **không** thay pod đang ấm: warm-pool chỉ giữ đủ `POOL_TARGET`, nên pod dựng từ image cũ nằm lại `pool:free` vô thời hạn và người claim tiếp theo nhận đúng nó. Pod đó `Running`/`Ready` nên không tín hiệu nào nói có gì sai — với `pause` thì hậu quả là **không có shell để `tmux new-session` của G4 attach vào**, tức terminal chết mà orchestrator vẫn báo claim thành công. Hiện phải rút tay (`LREM pool:free 0 <pod>` → `DEL pod:<pod>` → `kubectl delete pod`, theo đúng thứ tự đó để không claim nào grab được pod đang bị rút). **Chưa task nào sở hữu.** Đường đúng ở P2/P3: warm-pool so `SANDBOX_IMAGE` hiện hành với `.spec.containers[0].image` của pod ấm và tự drain khi lệch — cùng họ với tầng 2c của B7 (dọn thứ không nhánh nào khác chạm tới).
- ~~**`orchestrator.env.sandboxImage` đang bị `--set` tường minh trên release lab**~~ ✅ **ĐÓNG 2026-08-10, ngay sau khi PR #30 merge.** CI trên `main` (run 31376793290, toàn bộ 12 job xanh — gồm cả job `sandbox-image` mới ở lần chạy đầu) đóng `sha-bb739a8` cho cả 5 image. Side-load cả 5 (`docker save` một tarball 383 MB cho 5 image nhờ dedupe layer chung → `scp` 20s → `ctr import`) rồi `helm upgrade --set image.tag=sha-bb739a8 --set orchestrator.env.sandboxImage=""` ⇒ revision 10 `deployed`, `sandboxImage` quay về **kế thừa** (`helm get values` cho `sandboxImage: ""`), `SANDBOX_IMAGE` trong deployment render đúng `…dlp-sandbox-base:sha-bb739a8`. Không còn hằng số thứ hai.
  > **Thứ tự bắt buộc, đừng đảo:** side-load 5 image **TRƯỚC**, `helm upgrade` **SAU**. Ngược lại là warm-pool `ImagePullBackOff` và cold-path `CreateSession` treo ~2 phút (xem mục cold-path ở trên).
  > **Tiện thể đóng luôn một lệch âm thầm:** orchestrator trên cluster tới lúc đó vẫn là bản `sha-d5da78b` — tức bản **còn default `pause`** trong `config.go`. Nay đã là bản có fail-fast, và việc nó khởi động được chính là bằng chứng chart luôn set `SANDBOX_IMAGE`.
  > **Gap warm-pool tái hiện LẦN THỨ BA:** sau `helm upgrade`, pod ấm vẫn chạy `:dev` — phải rút tay lần nữa (LREM trả 1 → DEL hash → delete pod), rồi replenish mới dựng pod trên `sha-bb739a8`. Ba lần ba lượt đổi image, không lần nào tự rollout.
