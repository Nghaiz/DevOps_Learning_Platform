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

**S1 — Dependency + exec chạy được.** Thêm `k8s.io/client-go` (minor khớp cluster: **v0.34.x** cho K8s 1.34.10) + `k8s.io/api`, `k8s.io/apimachinery` vào `services/terminal-gateway/go.mod` (hiện có **0 dependency k8s**). Viết `cmd/spike-exec/main.go` exec `/bin/sh -c 'echo hello'` vào pod có sẵn trong `dlp-sandbox`. Chốt patch bằng `go list -m -versions`, không chép số từ blog.

**S2 — Ba transport, đo và so.** Cờ `-transport=ws|spdy|fallback`. **Plan cũ chốt SPDY là lỗi thời:** `kubectl` mặc định WebSocket từ K8s 1.31; ở **1.34** (cluster của ta là v1.34.10) RemoteCommand-over-WebSockets là **beta bật mặc định** (`v5.channel.k8s.io`) và lên Stable ở 1.35. **Chốt dùng `NewFallbackExecutor(wsExec, spdyExec, httpstream.IsUpgradeFailure)`** — đúng khuôn mẫu `kubectl exec`, WS là đường chính, SPDY là lưới an toàn. Ghi kết quả vào `plans/reports/`.

**S3 — Bridge thật, người gõ được.** WS `/spike/{pod}` nối stdin/stdout ⇄ binary frame, resize qua control. Kèm `-client` mode đặt terminal local vào raw mode + bắt `SIGWINCH` để **một con người gõ thử mà không cần lane FE**.

**S4 — Ghi gotcha + đóng gate.** Viết `plans/reports/2026-08-XX-spike-ws-exec.md` trả lời đủ: hành vi `TerminalSizeQueue.Next()` trả `nil` (= "hết queue, đừng hỏi nữa" — trả nhầm khi channel đóng là cách resize chết âm thầm giữa phiên); lỗi chính xác khi set `tty=true` kèm `stderr=true` (**PTY chỉ có một luồng ra, apiserver từ chối**); close code THẬT của `SetReadLimit` (`coder/websocket` tự đóng bằng `1009`, không phải mã ứng dụng — quyết định pin `4413` hay `1009` vào spec phụ thuộc kết quả đo này); cách lấy exit code (`exec.CodeExitError`); half-close stdin ở v5 so với v4; transport nào thắng.

**Thư viện WS: `github.com/coder/websocket`, KHÔNG `gorilla/websocket`.** Gorilla **panic khi hai goroutine cùng `WriteMessage`** — bridge terminal có đúng bài toán đó (goroutine đọc-pod ghi binary, goroutine điều khiển ghi control JSON, goroutine keepalive ghi ping); với gorilla cả ba phải qua một write-mutex tự viết, quên một chỗ là panic trong production. `coder/websocket` có `context.Context` trên mọi thao tác (khớp `httpx` sẵn có) và writer an toàn đa goroutine. Ràng buộc còn lại: **một reader tại một thời điểm** ⇒ kiến trúc một-goroutine-đọc là bắt buộc.

> **Tiêu chí xanh (tất cả phải đạt trước khi mở G1):** (1) `fallback` executor attach được vào pod Sysbox trong `dlp-sandbox`; (2) `vim` + `htop` vẽ đầy đủ, không rác ANSI; (3) kéo cửa sổ → `stty size` trong pod khớp trong < 1s; (4) `exit` → WS đóng sạch, tiến trình thoát 0, `-race` không báo, không goroutine leak; (5) xoá pod giữa phiên → bridge báo lỗi rõ, không treo.

### 1.A-2 — Spike claim atomic (rủi ro #3, score 16)

**A1 — Chốt state machine.** `pool:free` = **LIST** (D6). State: `free → claimed → active → reaping → gone`, sống ở hash `pod:{name}` (`state`, `sessionId`, `updatedAt`); `pool:free`/`pool:claimed` chỉ là index.

**A2 — Viết `claim.lua`** (`internal/pool/claim.lua`, nhúng `go:embed`, nạp `SCRIPT LOAD`/`EVALSHA`). Một script làm trọn: `LMOVE pool:free pool:claimed` → `HSET pod:{name}` → `HSET session:{id}` → `SET session:{id}:pod` → `EXPIRE` cả hai → trả `podName`. Pool rỗng → trả sentinel `nil` để Go rẽ cold-path, **không phải lỗi**. *Không dùng `LMOVE` trần: move thì atomic nhưng 4 lệnh ghi sau đó thì không — crash ở giữa để lại pod nằm trong `pool:claimed` mà không có session.*

**A3 — Test đua.** `N_POOL=50`, `N_G=200` goroutine claim đồng thời, `-race -count=20` (race chỉ hiện theo xác suất). **Xanh =** đúng 50 thành công, 150 trả "pool rỗng", **0 podName trùng**, `LLEN pool:free == 0`, `LLEN pool:claimed == 50`, không panic.

**A4 — Chạy trên Redis THẬT, không miniredis.** miniredis hỗ trợ Lua không đầy đủ (đặc biệt `LMOVE` + `redis.call` lồng nhau) ⇒ xanh trên miniredis mà đỏ trên Redis thật là guard không gác gì. Dùng Redis từ `docker-compose.yml`; `t.Skip` có log rõ khi `REDIS_URL` trống — **không giả vờ xanh**.

**A5 — Ghi gotcha.** `services/shared/rediskeys/README.md` hoặc `internal/pool/README.md`: `EVALSHA` sau khi Redis restart trả `NOSCRIPT` → phải fallback `EVAL`; giới hạn CROSSSLOT nếu sau này lên Cluster (D10).

## 1.B — Orchestrator: lifecycle + warm-pool + reaper

**B1 — `internal/k8s`: pod builder + client-go.** `rest.InClusterConfig()` với fallback kubeconfig cho dev. `BuildSandboxPod(name, sessionID)` sinh spec **tuân thủ đủ 8 CEL của VAP** — thiếu một field là admission từ chối, không phải runtime lỗi. *Effort: M.*

**B2 — Warm-pool manager.** Goroutine giữ `POOL_TARGET` pod `pool=free`, replenish async sau claim, backoff khi tạo pod fail. **`POOL_TARGET` mặc định 1 trên lab (D16)** — quota hiệu lực đo được là **4 pod**, và `trần session đồng thời = 4 − POOL_TARGET`. Đặt 3 thì chỉ phục vụ được **1** user rồi replenish bị quota chặn vĩnh viễn; đặt 1 thì phục vụ 3 user và pool vẫn luôn có sẵn 1 pod ấm để claim < 1s. Replenish khi chạm quota **không phải lỗi hệ thống** — log `WARN` + tăng `dlp_pool_replenish_quota_blocked_total`, không backoff vô hạn như lỗi API. Lỗi tạo pod khác phải log **nguyên văn message từ API server** (VAP reject có message rất rõ), không nuốt. *Effort: M.*

**B3 — `CreateSession` + dedupe idempotency.** `SET idem:{key} {sessionID} NX EX 600`; trúng key cũ → trả lại đúng session cũ, **không tạo pod thứ hai**. `SANDBOX_TIER_UNSPECIFIED` → `InvalidArgument` (fail-closed theo comment proto). Pool rỗng → cold path + log `WARN` có đo latency. *Effort: M.*

**B4 — `ClaimSession` / `GetSession`.** TTL bắt đầu đếm **lúc claim, không phải lúc create**. `GetSession` với `user_id` lệch trả **`NotFound`, KHÔNG phải `PermissionDenied`** — `PermissionDenied` xác nhận session tồn tại, biến chính RPC thành oracle dò id. *Effort: M.*

**B5 — `ExtendSession` hai đồng hồ + optimistic lock.** `expires_at = min(now + extend_seconds, created_at + HARD_CAP)`; `expected_revision != 0 && != current` → `FailedPrecondition`; mọi lần ghi `INCR` revision **trong cùng một Lua script** với việc ghi field — đọc-rồi-ghi bằng 2 lệnh Go là tự tạo lại đúng race mà revision sinh ra để chặn. *Effort: M.*

**B6 — `ReapSession` idempotent + authz theo `oneof actor`.** Nhánh `user_id` phải khớp `session.user_id`; nhánh `system_component` chỉ chấp nhận trên listener in-cluster (chặn ở interceptor theo peer addr, **không tin field**). Session đã reap → trả **OK** kèm session cuối, không lỗi. Xoá pod `GracePeriodSeconds: 0` + bỏ qua `IsNotFound`. *Effort: M.*

**B7 — Reaper hai tầng.** Tầng 1: subscribe `__keyevent@0__:expired`. Tầng 2: **sweep định kỳ bắt buộc có** (`REAP_INTERVAL=60s`) — keyspace notification là *best-effort*, mất event khi reaper offline là mất pod vĩnh viễn. Sweep dọn cả **pod mồ côi** (label `app=sandbox` mà `pod:{name}` không tồn tại) và **session ma** (`session:{id}` còn mà pod đã biến mất → chuyển `FAILED`). *Effort: M.*

**B8 — Audit Postgres (D9).** Ghi `created/claimed/extended/reaped/failed` vào `sessions_audit` (migration bằng **Drizzle**, query bằng pgx). **Chỉ audit, không phải state** — bảng này không được có cột nào trả lời "session X đang chạy ở pod nào" (`plan.md` §4 no-derived-fields). Lỗi ghi → log `ERROR` + counter, **RPC vẫn thành công**; audit không được chặn đường claim. *Effort: M.*

**B9 — `/metrics`.** `dlp_claim_duration_seconds` (histogram, để đo p95 < 1s), `dlp_pool_free_size`, `dlp_pool_replenish_failures_total`, `dlp_reaper_orphan_pods_total`, `dlp_cold_path_total`. *Effort: S.*

## 1.C — Terminal-gateway: WS ⇄ exec + per-session authz

**G1 — Khung handler + Origin + subprotocol.** Pipeline pre-upgrade: allowlist `Origin` (`GATEWAY_ALLOWED_ORIGINS` — đây là thứ đóng CSWSH, bắt buộc vì handshake WS không chịu CORS), kiểm client chào `dlp.terminal.v1`, rồi mới upgrade và echo lại đúng một subprotocol. **Request VẮNG header `Origin` thì CHO QUA** (contract §3a) — trình duyệt luôn gửi `Origin` nên CSWSH vẫn đóng kín, còn fail-closed ở đây sẽ chặn `wscat`/`websocat`/test e2e/probe vận hành, tức chặn chính bộ acceptance IDOR ở dưới. Bước này đọc là *"có `Origin` thì phải đúng"*, không phải *"phải có `Origin`"*. Unit test cả hai ca: vắng → qua, sai → 403. *Chạm: `internal/wsroute/`, `internal/ws/`. Effort: M.*

**G2 — Verify sandbox token (luật 6 + 8, D15).** Đọc token **chỉ từ cookie `dlp_sandbox`**; có unit test khẳng định query string bị **bỏ qua và bị từ chối**. Verify bằng **JWKS của Better Auth** lấy từ `GATEWAY_JWKS_URL` (1.B0.5): cache theo `kid`, **refetch khi gặp `kid` lạ** (rotation không cần redeploy), có TTL cache + single-flight để một trận `kid` lạ không thành DoS vào web. **Ép `alg == EdDSA` phía server** — tuyệt đối không đọc `alg` từ header token (đó là đường `alg=none`/confusion kinh điển). Rồi ép `aud == "gateway"`, `exp` chưa qua, `iss` khớp, `sub`/`sid` không rỗng. Sai → **401 trước upgrade**. *Chạm: `internal/authz/token.go`, `internal/authz/jwks.go`. Thư viện: `go-jose/go-jose/v4` hoặc `lestrrat-go/jwx/v3` (cả hai đỡ Ed25519 — chốt bằng `go list -m -versions`, không chép từ blog). Effort: M.*

**G3 — Per-session authz hai vế (luật 10 + 1).** Đọc Redis `session:{id}` bằng helper shared (D2, D7 — không nối chuỗi tay). **Vế 1** `token.sid == {id}` trong URL, **vế 2** `hash.userId == token.sub`, và `status ∈ {CLAIMED, RUNNING}`. Lệch bất kỳ vế nào → **403 trước upgrade**. Log `Warn` **có rate-limit/sampling** — endpoint public, log mỗi request là DoS vào quota log. *Effort: M.*

**G4 — Nối pod exec.** `NewFallbackExecutor` theo kết quả spike, exec vào `hash.podName`/`hash.namespace` với `TTY: true`, `Stdin/Stdout` bật, **`Stderr` tắt**. Lệnh là **hằng số phía server** `GATEWAY_EXEC_COMMAND`, mặc định **`tmux new-session -A -s dlp`** (D3) — tuyệt đối không lấy từ frame client. Với D17 (trần 1 WS) lệnh này luôn chạy ở tư thế client-duy-nhất, nên không có ca hai client tranh kích thước cửa sổ; status bar tmux đã tắt từ image (E4) nên `stty size` trong pod khớp **chính xác** `cols`/`rows` của frame `init`. **Predicate fallback không được nuốt lỗi authz:** RBAC 403 KHÔNG phải upgrade-failure; predicate quá rộng thì lỗi thiếu quyền `pods/exec` sẽ hiện ra dưới dạng "SPDY failed". *Effort: M.*

**G5 — Bơm dữ liệu hai chiều.** Binary frame đi thẳng, **không parse, không decode UTF-8**. Backpressure: buffer có trần, client chậm quá trần → đóng `4429` thay vì phình bộ nhớ. *Effort: M.*

**G6 — Resize + handshake `init`.** Đợi frame `init` mang `cols`/`rows` **trước khi dial exec** (timeout 3s → 80×24) để prompt oh-my-posh vẽ đúng bề rộng ngay lần đầu. Resize dồn dập phải **coalesce giữ giá trị cuối**, không đóng kết nối. *Effort: S.*

**G7 — Keepalive + `ExtendSession`.** Server ping mỗi 20s, không pong trong 10s → chết. **Chỉ traffic thật (stdin/stdout) mới gọi `ExtendSession`; ping/pong KHÔNG tính** — nếu tính, một tab bỏ quên giữ pod sống tới tận trần cứng. Gửi `expected_revision` đọc từ hash; `FailedPrecondition` → đọc lại, xác minh còn đúng chủ + còn sống, thử lại **đúng một lần**, vẫn lệch → đóng `4404` (không hồi sinh session đã reap). `hard_cap_reached` → đẩy control `expiring`. Auth: mTLS + `system_component` (D13). *Effort: S.*

**G8 — Rate/size limit (luật 5).** Read limit 32 KiB/frame; token-bucket 256 KiB/s (burst 512 KiB) → `4429`; control > 100/s → `4400`. Trần WS **trên mỗi session `GATEWAY_MAX_WS_PER_SESSION=1` (D17)** đếm bằng `session:{id}:ws`: `INCR` sau khi qua hết bước authz và **trước** upgrade, `DECR` trong `defer` của handler; vượt trần → **429 + `code: "SESSION_IN_USE"`**. Bộ đếm phải chịu được gateway chết giữa phiên — đặt **TTL trên `session:{id}:ws` bằng TTL của session** để một lần crash không khoá vĩnh viễn session của sinh viên ở trạng thái "đang mở ở tab khác". Trần theo user **suy ra** từ trần session/user của orchestrator — không nhân bản quota người dùng sang hai service. *Effort: S.*

**G9 — Stateless.** Không map session→pod trong RAM; tra Redis mỗi lần connect. State duy nhất được giữ là vòng đời của **chính kết nối đang mở**. *Effort: S.*

**G10 — Metrics.** `dlp_gateway_ws_active`, `..._ws_connections_total{result,reason}`, `..._exec_errors_total{kind}`, `..._ws_bytes_total{direction}`, `..._attach_duration_seconds` (101→`ready`), `..._extend_total{result}`. **Không label `session_id`/`user_id`** — nổ cardinality và là PII. *Đổi tên so với plan cũ: gateway đo **attach** latency; **claim** latency thuộc orchestrator.* *Effort: S.*

**G11 — Config + cổng env-drift.** Mỗi biến mới phải sửa **đồng thời 4 nơi** hoặc `make env-check` đỏ: code, `.env.example`, Helm (`values.yaml` + deployment), `.github/ci.env`. Biến mới của P1: `GATEWAY_JWKS_URL`, `GATEWAY_ALLOWED_ORIGINS`, `GATEWAY_EXEC_COMMAND`, `GATEWAY_MAX_WS_PER_SESSION`. Làm cùng lúc mỗi task thêm env, không dồn cuối. *Effort: S.*

**G12 — Sửa 4 file `apps/web`** (ownership giao lane này, xem bảng D): phát sandbox token + `Set-Cookie` trong `session.ts`; thêm `resHeaders` vào `TRPCContext`; thêm **`mintSandboxTokenFor`** vào `jwt.ts` — `signJWT({ payload: {sub, sid, aud:"gateway", iss, iat, exp}, overrideOptions: {jwt:{audience:"gateway"}} })`, **cùng khoá** với `mintAccessTokenFor`, không sinh khoá mới (D15); `headers.ts` chỉ sửa **nếu** DevTools thật sự báo CSP violation. *Effort: M.*

**G13 — Test IDOR e2e (acceptance BẮT BUỘC).** Chạy trong CI với Redis thật + apiserver giả. Phải có **cả hai** vế, vì chúng chết ở hai bước khác nhau và một test không che được test kia:
- **Vế e** (`token.sid == {id}`): token hợp lệ của user B, URL là session của A → 403.
- **Vế g** (`hash.userId == token.sub`): token **ký bằng khoá test** với `sid == sessionA` nhưng `sub == userB` → 403. BFF thật không bao giờ mint được token này, nên **bắt buộc phải forge trong test** — nếu bỏ, ai đó implement thiếu bước g và toàn bộ acceptance vẫn xanh (đúng loại tautology mà D-17′ phê phán). *Effort: S.*

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

> Hiện là **placeholder thuần** (`FROM ubuntu:26.04` + `CMD bash`, không cài gói nào).
>
> **Kiểm chứng 2026-08-09, ngược với cảnh báo trong comment Dockerfile:** `ubuntu:26.04` (Resolute Raccoon, 2026-04-23) là LTS hỗ trợ tới 2031-04 — giữ nguyên base. `eza`, `fastfetch`, `zoxide` **đều đã nằm trong universe của 26.04** ⇒ bỏ hẳn repo bên thứ ba mà plan cũ ngầm định. Thứ thật sự thiếu gói cho 26.04 là **`pwsh`** (Microsoft chưa publish, issue upstream còn mở).

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

> Hiện `packages/terminal` **chỉ có README**, chưa có code, chưa có `package.json`.
> Package đúng là **`@xterm/*` v6.0.0** (không phải `xterm` cũ), và **v6 đã BỎ canvas renderer** — chỉ còn DOM + WebGL.

**F1 — Dựng package.** Mirror `packages/ui`: `type: module`, `exports: "./src/index.ts"`, **alias TS6/TS7 y hệt** các package khác, `peerDependencies: { react: "^19.0.0" }`. **Bắt buộc có script `build`** (dù chỉ `tsc --noEmit`) vì `turbo.json` khai `typecheck.dependsOn: ["^build","build"]`. Ghim: `@xterm/xterm@6.0.0`, `addon-webgl@0.19.0`, `addon-fit@0.11.0`, `addon-search@0.16.0`, `addon-web-links@0.12.0`, `addon-clipboard@0.2.0`, `addon-unicode11@0.9.0`. *Effort: S.*

**F2 — Core wrapper.** Nạp addon theo thứ tự fit → unicode11 → webgl → search/web-links/clipboard. Vì v6 bỏ canvas renderer, **tự code fallback**: `webgl.onContextLoss` → `dispose()` addon → rơi về DOM renderer + `console.warn` (errors-over-silent-fallback, không nuốt). *Effort: M.*

**F3 — Font self-host.** Một Nerd Font (MesloLGS NF hoặc JetBrainsMono NF) dạng **woff2 subset** trong `src/assets/`, `@font-face` + `font-display: block`. CSP `font-src 'self'` ⇒ CDN bị chặn, self-host là bắt buộc chứ không phải lựa chọn. *Effort: S.*

**F4 — Đo kích thước & resize.** FitAddon chỉ đúng **sau khi font đã load** ⇒ `await document.fonts.ready` rồi mới `fit()`. `ResizeObserver` + debounce **~50ms theo contract §4** (bản trước ghi 100ms — lệch với SSOT; contract thắng). **Gửi `init` trước mọi stdin** (contract §3). *Effort: S.*

**F5 — Theme switch.** 2–3 theme `ITheme` truecolor, đổi runtime qua `term.options.theme`, persist bằng `localStorage` — không cookie (tránh phình header và bề mặt CSRF). *Effort: S.*

**F6 — React binding.** `'use client'`, `useRef` + `useEffect` mount/dispose; terminal là imperative nên **không** re-render theo state. **React 19.2 StrictMode dev chạy effect hai lần** ⇒ thiếu `dispose()` triệt để là 2 canvas WebGL + 2 WS. *Effort: M.*

**F7 — Trang session.** `app/(session)/session/page.tsx` (Server Component, kiểm auth) + `session-terminal.tsx` (`'use client'`) nạp bằng `next/dynamic` với **`ssr: false`** — xterm đụng `document` ngay lúc import module. *Effort: M.*

**F8 — tRPC client (chưa tồn tại).** `apps/web` hiện chỉ có `@trpc/server`. Thêm `@trpc/client` (+ TanStack Query nếu cần cache) và `src/lib/trpc.ts` trỏ `/api/trpc`. Plan cũ giả định sẵn có. *Effort: S.*

**F9 — Máy trạng thái UI.** `idle → creating → claiming → connecting → ready → (reconnecting) → expired | error`. Đếm ngược tới `expiresAt` (lấy từ `ready`, không cần gọi thêm), cảnh báo khi nhận `expiring`, nút "Gia hạn". **Thấy `1006` mà chưa từng nhận `ready`** → gọi tRPC `session.get` để biết lý do thật (contract §7). *Effort: M.*

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
**1.E-1 (E1–E5, E10) phải merge + push image lên ghcr TRƯỚC** khi warm-pool tạo pod thật; trước đó orchestrator chỉ test với `pause` image. Values Helm hiện trỏ tag `dev` (build tay) → phải chuyển sang tag `sha-<short>` do CI đóng.

---

## Acceptance criteria

### Gate 1.A (HARD-GATE — không mở 1.B/1.C khi chưa xanh)
- [ ] Spike WS: `fallback` executor attach được vào pod Sysbox; report ghi rõ transport thắng + subprotocol thương lượng.
- [ ] Spike WS: `vim` + `htop` vẽ đầy đủ, không rác ANSI; kéo cửa sổ → `stty size` khớp < 1s; `exit` đóng sạch, `-race` không báo; xoá pod giữa phiên → báo lỗi rõ, không treo.
- [ ] Spike WS: report trả lời đủ 6 câu gotcha ở S4, **gồm close code thật của read-limit**.
- [ ] Spike claim: `-race -count=20` xanh 20/20; đúng 50 thành công / 150 "pool rỗng" / **0 podName trùng**; `LLEN pool:free==0`, `pool:claimed==50`.
- [ ] Spike claim chạy trên **Redis thật**; skip có log rõ khi `REDIS_URL` trống.
- [ ] Redis restart giữa chừng → `EVALSHA` gặp `NOSCRIPT` tự fallback `EVAL`, không mất claim.

### Prerequisite 1.B0

> **Đã thực thi 2026-08-09** — báo cáo đầy đủ kèm số đo: [`reports/2026-08-09-p1-b0-prerequisites.md`](reports/2026-08-09-p1-b0-prerequisites.md).
> Ba thứ plan không lường trước, chỉ lộ khi chạm cluster thật: **không có StorageClass nào** (PVC sẽ Pending vĩnh viễn ⇒ phải thêm `local-path-provisioner`), `registry.k8s.io/kubectl` là **distroless không có `/bin/sh`** (buộc thiết kế lại canary), và `helm upgrade --reuse-values` **không nạp default mới của chart** (phải dùng `--reset-then-reuse-values`).

- [ ] **Calico (đo từ lúc CÀI CRON, không phải từ lần restart gần nhất):** cron `rollout restart ds/calico-node` đã chạy liên tục **> 25h**, log cron có **≥ 2** lần restart thành công, và tạo pod mới trong `dlp-sandbox` thành công tại **T+25h** *và* **T+37h**. *Bản trước viết "> 25h kể từ lần deploy Calico gần nhất" — điều kiện đó **bất khả thi** một khi cron hoạt động, vì cron giữ "lần deploy gần nhất" luôn ≤ 12h. AC cũ tự vô hiệu hoá đúng lúc bản vá bắt đầu chạy.* ⏳ **ĐANG CHỜ** — cron cài 2026-08-09 ~14:35 (+07) ⇒ sớm nhất đóng được 2026-08-10 ~15:35 và 2026-08-11 ~03:35. Canary 30 phút/lần tự tích luỹ bằng chứng: `kubectl -n dlp-sandbox get jobs -l app.kubernetes.io/component=cni-canary`.
- [x] Cron vá chạy được và **token thật sự được ghi mới** — không chỉ "job Complete": `exp` 1786340207 → 1786347833 (= `now` + 24h) sau một lần chạy.
- [x] Canary tạo-pod chạy trong cron, và **đã thấy nó đỏ có chủ ý**: ép `runtimeClassName: khong-ton-tai` → Job `Failed`/`DeadlineExceeded`, event ghi nguyên văn lý do. Canary chưa từng đỏ là canary chưa biết có kêu hay không.
- [x] `redis-cli CONFIG GET notify-keyspace-events` trả chuỗi chứa `E` và `x` — trả `xE`; `appendonly` = `yes`.
- [x] Pod orchestrator `Running` với `REDIS_URL`/`DATABASE_URL` trỏ service in-cluster (qua `secretKeyRef`, không phải `env.value` — hai URL chứa mật khẩu). PVC Postgres 4Gi + Redis 1Gi đều `Bound`.
- [ ] Web và gateway **cùng origin**: từ trang web, `document.cookie` scope `/ws` được gửi kèm trong handshake (kiểm bằng DevTools Network). ⏳ **CHỜ G1 + G12** — chưa ai mint cookie `dlp_sandbox` và chưa có upgrade thật. Phần B0 nợ được là **topology**, và topology đã chứng minh: handshake WS thật qua Caddy → **101** + `Sec-WebSocket-Accept` đúng + echo `dlp.terminal.v1`; `/` → 200 (web), `/ws/session/{id}` → 401 (gateway trả, không phải 502 của proxy).
- [x] **JWKS tới được từ gateway (1.B0.5):** `curl -s $GATEWAY_JWKS_URL | jq '.keys[0]'` trả `kty:"OKP"`, `crv:"Ed25519"`, `alg:"EdDSA"`, `kid` không rỗng — gọi **từ trong cluster**, đúng URL `http://platform-web:3000/api/auth/jwks` mà gateway đang cấu hình. Khẳng định của D15 được xác nhận bằng số đo, không phải bằng suy luận từ `node_modules`.

### Chức năng
- [ ] 5 RPC trả kết quả thật, không còn `Unimplemented`.
- [ ] Claim từ warm-pool **p95 < 1s** (`dlp_claim_duration_seconds`, ≥ 50 mẫu).
- [ ] Từ `ready` tới prompt đầu tiên: **p95 < 500ms** (`dlp_gateway_attach_duration_seconds`).
- [ ] Prompt đầu tiên vẽ **đúng bề rộng** cửa sổ (không gãy dòng) — chứng minh `init`-trước-dial hoạt động.
- [ ] `CreateSession` 2 lần cùng `idempotency_key` → **cùng `session.id`**, số pod tăng đúng **1**.
- [ ] `GetSession` với `user_id` sai → **`NotFound`** (không phải `PermissionDenied`).
- [ ] `ExtendSession` với `expected_revision` cũ → `FailedPrecondition`; mỗi lần ghi `revision` tăng đúng 1.
- [ ] Gia hạn liên tục quá `HARD_CAP` → `expires_at` đứng yên, `hard_cap_reached=true`, FE nhận `expiring`.
- [ ] Có traffic → `ExtendSession` được gọi; **chỉ ping/pong → `expires_at` KHÔNG đổi**, WS đóng `4408` sau idle-window.
- [ ] `ReapSession` gọi 2 lần → cả hai OK; gọi với `user_id` người khác → từ chối, pod **vẫn sống**.
- [ ] Sau claim, `pool:free` tự về `POOL_TARGET` trong ≤ 30s — **đo với `POOL_TARGET=1` và tới 3 session đồng thời** (trần = quota_hiệu_lực 4 − POOL_TARGET 1, xem D16). Session thứ 4 → pool rỗng → cold path thành công + `dlp_cold_path_total` tăng.
- [ ] **Chạm quota có tín hiệu riêng, không giả dạng lỗi:** ép tạo pod thứ 5 → `dlp_pool_replenish_quota_blocked_total` tăng, log `WARN` (KHÔNG phải `ERROR`), và orchestrator **không** backoff vô hạn.
- [ ] Xoá `session:{id}` khỏi Redis → sweep dọn pod mồ côi ≤ 1 chu kỳ. Xoá pod (key còn) → session chuyển `FAILED`.
- [ ] Tắt Postgres → `CreateSession` **vẫn thành công**, chỉ log `ERROR` audit.
- [ ] `sessions_audit` không có cột nào trả lời được "session X đang ở pod nào".
- [ ] **Reconnect thật (D3):** ngắt mạng 5s → vào lại thấy **đúng màn hình cũ**, scrollback còn, tiến trình đang chạy không chết. `tmux ls` trong pod chỉ có **1** session.
- [ ] **Trần 1 WS không giết reconnect (D17):** đóng WS → `session:{id}:ws` về **0** trong ≤ 1s → mở lại **thành công** (không dính 429). Và: kill gateway giữa phiên (SIGKILL, không kịp `DECR`) → session vẫn mở lại được sau khi TTL của `session:{id}:ws` hết, **không khoá vĩnh viễn**.
- [ ] Đóng WS → pod **không** bị xoá ngay; nối lại cùng `{id}` trong TTL vào đúng pod cũ.
- [ ] 2 replica gateway sau round-robin LB: mở/đóng 20 WS xen kẽ (**tuần tự, không chồng lấn** — trần là 1 WS/session), 0 lỗi.

### Terminal UX
- [ ] 10 binary có mặt trong image: `zsh tmux git jq fzf zoxide fastfetch eza bat oh-my-posh`.
- [ ] `zsh -lic 'echo $COLORTERM'` → `truecolor`; `locale` báo UTF-8.
- [ ] `eza --icons -la` in glyph thật (byte đa-byte, kiểm bằng `| xxd`), không phải `?`.
- [ ] **DinD offline (D4):** `docker info` trả cả client lẫn server; `docker build` một image `FROM scratch` rồi `docker run` nó — thành công **không cần mạng**.
- [ ] Dotfiles: file trong allowlist được copy; **symlink và `../` bị từ chối**, không ghi được ngoài `$HOME`.
- [ ] Mở `/session`: DevTools Console **0 CSP violation**; gõ tiếng Việt / ký tự đa-byte không vỡ khi output cắt qua nhiều frame.
- [ ] Tắt hardware acceleration → terminal vẫn chạy (fallback DOM renderer) + có `console.warn`.
- [ ] StrictMode dev: mount/unmount 3 lần → chỉ còn **1** WebSocket sống.
- [ ] `trivy image --severity CRITICAL --exit-code 1` pass **cục bộ trước khi merge**.

### Bảo mật (luật 5, 6, 8, 10 — P1 là phase sở hữu luật 10)
> **Hai vế authz chết ở hai bước khác nhau — phải kiểm RIÊNG.** Bước **e** (`token.sid == {id}`) chạy trước bước **g** (`hash.userId == token.sub`). Mọi ca "user B mở session của A" đều dừng ở **e** và **không bao giờ chạm g**. Nếu chỉ kiểm những ca đó, một implement thiếu hẳn bước g vẫn cho acceptance xanh toàn bộ — đúng loại tautology mà D-17′ phê phán. Ca cho bước g bắt buộc phải **forge token bằng khoá test**.

- [ ] **IDOR — vế e:** user B, token hợp lệ của chính B, mở `/ws/session/{id-của-A}` → **403, không upgrade, apiserver không nhận request nào**.
- [ ] **IDOR — vế g (BẮT BUỘC, forge token):** token ký bằng khoá test với `sid == sessionA` nhưng `sub == userB` → **403**. Đây là ca DUY NHẤT chứng minh bước g tồn tại. BFF thật không mint được nó.
- [ ] Token của A + `sid` session A nhưng URL là session A' (A cũng sở hữu) → **403** (chặn dùng lại token chéo session; vẫn là vế e).
- [ ] **`{id}` đoán bừa → 403 (KHÔNG phải 404).** Token chỉ mang đúng một `sid`, nên mọi `{id}` lạ đều chết ở bước e. *Bản trước ghi 404 — sai với thứ tự handshake đã pin.* Tính chất này là **tốt**: "id không tồn tại" và "id của người khác" trả cùng một mã, ở cùng một bước, cùng một đường code ⇒ không có kênh phụ để liệt kê session. Không được "sửa" thứ tự cho 404 dễ gặp hơn.
- [ ] **404 chỉ khi session của CHÍNH MÌNH biến mất:** `token.sid == {id}` nhưng `session:{id}` không còn trong Redis (đã reap / TTL hết) → **404**. Đây là ca duy nhất bước f tới được.
- [ ] Session `EXPIRED`/`REAPED` (key còn, status sai) → **409**, không dial exec.
- [ ] **Luật 6:** token `aud=orchestrator` (loại BFF đang mint cho gRPC) → **401** — `aud` là thứ DUY NHẤT tách hai loại token, thiếu check này là token gọi orchestrator mở được shell; ký sai key → 401; `exp` qua → 401; thiếu `sid` → 401.
- [ ] **Luật 6 — alg confusion (D15):** token với `alg: "none"` → 401; token `alg: "HS256"` ký bằng chính public key Ed25519 làm secret → **401**. Gateway phải ép `alg=EdDSA` phía server, không đọc `alg` từ header token.
- [ ] **JWKS rotation (D15):** xoay khoá Better Auth (đổi `kid`) → gateway **tự refetch** và verify token mới **không cần restart**; token cũ (kid cũ, chưa hết hạn) vẫn verify được nếu JWKS còn công bố kid đó.
- [ ] **Luật 8:** WS mở bằng query-token → **401**; `grep -rn "URL.Query()"` = 0 ở đường đọc token; log gateway sau một phiên đầy đủ `grep -cE 'eyJ[A-Za-z0-9_-]{10,}'` = **0**; cookie có đủ `HttpOnly; Secure; SameSite=Strict; Path=/ws`.
- [ ] **CSWSH:** handshake với `Origin: https://evil.example` → **403**.
- [ ] **Origin vắng thì cho qua (contract §3a):** handshake **không có** header `Origin`, cookie hợp lệ → **101**. Đây là quyết định, không phải lỗ hổng: trình duyệt luôn gửi `Origin` nên CSWSH vẫn đóng, còn fail-closed sẽ chặn chính các lệnh `wscat` ở §Verify commands.
- [ ] **Luật 5:** frame vượt read-limit → đóng đúng close code đã pin sau spike; bơm 5 MiB/s → `4429` và RSS gateway không tăng quá 2× baseline; **WS thứ 2 trên cùng session (trần 1, D17) → 429 + `code:"SESSION_IN_USE"`**; bão 200 resize/s → coalesce, **không** đóng, và `stty size` trong pod khớp **chính xác** giá trị cuối (không lệch 1 — status bar tmux đã tắt ở E4).
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
kubectl auth can-i create pods --subresource=exec -n dlp-sandbox \
  --as=system:serviceaccount:dlp-platform:dlp-platform-gateway      # yes
kubectl auth can-i create pods -n dlp-sandbox \
  --as=system:serviceaccount:dlp-platform:dlp-platform-gateway      # no

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
| **R1 — WS ⇄ pod-exec streaming** (transport, resize, đóng stream, backpressure) | 4 | 5 | **20** | Spike 1.A-1 HARD-GATE; `NewFallbackExecutor` theo khuôn `kubectl` thay vì tự chế; 5 tiêu chí xanh đo được; `-race` + goleak. |
| **R2 — Warm-pool race, double-claim** | 4 | 4 | **16** | Lua một-lượt-atomic, không chuỗi lệnh Go; test đua `-race -count=20` trên **Redis thật**; HARD-GATE trước 1.B. |
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
| **R13 — Gateway không có credential gọi `ExtendSession`** | 3 | 3 | 9 | D13 mTLS + `system_component`; chốt trước G7. |
| R14 — WebGL không khả dụng (v6 đã bỏ canvas renderer) | 3 | 3 | 9 | `onContextLoss` → fallback DOM + `console.warn`; test thủ công với hardware accel tắt. |
| R15 — `pwsh` `.deb` vỡ dependency trên 26.04 | 3 | 3 | 9 | Ghim version + sha256, smoke `pwsh -v` trong Dockerfile; vỡ thì `INCLUDE_PWSH=0`, ghi nợ, **không chặn P1**. |
| R16 — Image phình ⇒ pull chậm ⇒ hỏng mục tiêu claim < 1s | 3 | 3 | 9 | Ngưỡng size trong AC; pre-pull lên node lab; tách biến thể chỉ khi đo được (D12). |
| R17 — FE hiểu nhầm `1006` là "gateway chết" | 4 | 2 | 8 | Contract §7 + F9 probe tRPC `session.get`. |
| R18 — Dotfiles bị lợi dụng ghi ngoài `$HOME` | 2 | 4 | 8 | Allowlist + từ chối symlink/`..` + cap size; ca test symlink trong AC. |
| R19 — Reaper xoá nhầm pod đang active | 3 | 4 | 12 | `lastActiveAt` cập nhật từ traffic thật (không phải ping); grace period; TTL cứng tách idle-timeout; idempotent. |
| **R23 — `idem:{key}` không scope theo user** ⇒ user B trùng `idempotency_key` của A thì nhận lại **session của A**, rò `sessionId` và biến vế authz `g` thành lớp duy nhất chặn B vào shell của A | 3 | 5 | **15** | *Đã đóng ở 1.B0.3 (2026-08-09, do review đối kháng phát hiện):* key đổi thành `idem:{userId}:{key}`, hai đoạn validate riêng, có test "hai user cùng key ra hai key khác nhau" — ca duy nhất chứng minh scope tồn tại. Thêm regex khớp validator vào zod của BFF để từ chối ở biên gần client nhất. |
| **R24 — JWKS đi qua HTTP trần trong namespace platform, không có NetworkPolicy** ⇒ ai chiếm được Service `-web` phục vụ JWKS giả, gateway "refetch khi gặp `kid` lạ" (D15) nạp khoá đó và verify token giả → shell của mọi session | 2 | 5 | **10** | Chưa khai thác được từ ngoài (cần đứng trong namespace platform). Chart hiện chỉ có NetworkPolicy cho `dlp-sandbox`, **không** cho `dlp-platform`. Đóng ở **P3**: NetworkPolicy cho namespace platform, hoặc pin JWKS/mTLS giữa gateway ↔ web. Ghi ở đây để nó không biến mất — đây là điểm tin cậy DUY NHẤT của luật 6 và luật 10. |

**Tám mục ≥ 15 (R0, R1, R2, R3, R4, R5, R20, R22)** phải có mitigation **chạy xanh** trước khi task phụ thuộc bắt đầu.

---

## Timeline (P1)

| Nhóm | Effort | Phụ thuộc |
|---|---|---|
| 1.B0.1 Calico | **S** | 🔴 Chặn TẤT CẢ |
| 1.B0.2 Redis+PG in-cluster · 1.B0.3 contract · 1.B0.4 origin · 1.B0.5 JWKS | **M** | Song song nhau; B0.3 chặn spike claim, B0.4 chặn lane FE, **B0.5 chặn G2** |
| 1.A-1 spike WS⇄exec | **M** | HARD-GATE, chặn 1.C |
| 1.A-2 spike claim atomic | **M** | HARD-GATE, chặn 1.B. Song song 1.A-1 |
| 1.B orchestrator (B1–B9) | **L** | Đường găng |
| 1.C gateway (G1–G13) | **L** | Đường găng, song song 1.B |
| 1.D bốn khoảng trống | **S**×4 | D-17′/D-21′/D-22′ song song hoàn toàn; **D-19′ phụ thuộc 1.B0.1** (restart kubelet, xem R22) |
| 1.E image | **M** | E1–E5 phải xong **sớm nhất** (warm-pool chờ image) |
| 1.F FE | **M–L** | Chặn bởi WS contract + B0.4 + G12 |
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

### Còn để ngỏ (không chặn cook, ghi lại để P2/P3 không quên)

- **D2 (gateway đọc Redis):** lý do "tránh round-trip gRPC" yếu — G7 đã bắt gateway phải có gRPC client + mTLS, và mở WS là 1 lần/kết nối. Cái giá thật là biến field hash `session:{id}` thành contract liên-service mà proto không mô tả (chính lý do phải đẻ ra 1.B0.3). `GetSession` còn gộp 404/403 thành một, tốt hơn cho chống oracle. **Giữ nguyên D2 ở P1**, xem lại ở P2 nếu drift field xảy ra thật.
- **`SESSION_TTL` chưa được pin trong D11** — ba nguồn nói ba số (`redis-key-namespace.md` 1h, verify cmd 600s, D11 im lặng). Chốt lúc làm B3.
- **Migration Postgres chưa tự động hoá** (phát hiện lúc làm 1.B0.2). Hiện phải chạy tay `pnpm --filter @devops-platform/web db:migrate` qua `kubectl port-forward` sau mỗi lần dựng lại DB in-cluster. Chưa có Job/initContainer trong chart — nằm ngoài phạm vi B0 có chủ ý, nhưng phải xử lý **trước khi** ai đó dựng lại cluster từ đầu rồi ngạc nhiên vì `/api/auth/jwks` trả 500.
- **LimitRange 1Gi cho pod DinD** có thể chật với dockerd + `docker build` — đo RSS thật ở 1.E rồi mới bàn chỉnh, đừng đoán.
