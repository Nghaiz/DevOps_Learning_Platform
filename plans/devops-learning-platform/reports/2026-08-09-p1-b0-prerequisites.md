# P1 · 1.B0 — Prerequisite chặn cứng: báo cáo thực thi

**Ngày:** 2026-08-09 · **Nhánh:** `feat/p1-b0-prereqs` · **Cluster:** `debian-sandbox` (192.168.94.130, K8s v1.34.10, 1-node)
**Phạm vi:** trọn 5 task 1.B0.1 → 1.B0.5 của [`phase-1.md`](../phase-1.md). Không đụng 1.A/1.B/1.C.

---

## Tóm tắt

Cả 5 task đã hiện thực và **triển khai thật lên cluster lab**, không dừng ở manifest. 20/22 acceptance của mục Prerequisite đóng được bằng số đo. Hai ô còn lại là **ô phụ thuộc thời gian** (>25h) và **ô cần G1/G12** — ghi nợ tường minh ở dưới, không đánh dấu xanh.

Ba thứ **plan không lường trước**, lộ ra khi chạm cluster thật:

| Phát hiện | Ảnh hưởng | Xử lý |
|---|---|---|
| Cluster **không có StorageClass nào** (`kubectl get sc` → rỗng) | PVC của Postgres/Redis sẽ Pending vĩnh viễn ⇒ 1.B0.2 không thể hoàn thành như plan mô tả | Thêm `local-path-provisioner v0.0.37` vào `05-cluster-addons.sh`; `datastore.storageClassName` trỏ **tường minh** `local-path` |
| `registry.k8s.io/kubectl` là **distroless — không có `/bin/sh`** | Thiết kế canary bản đầu (script nhiều bước qua `kubectl apply`) chết ngay dòng đầu | Thiết kế lại: **pod của chính CronJob LÀ canary**. Bỏ luôn SA/Role/RoleBinding/ConfigMap/`trap` — đơn giản hơn và mạnh hơn |
| `helm upgrade --reuse-values` **không nạp default mới của chart** | `UPGRADE FAILED: nil pointer evaluating interface {}.enabled` khi thêm khối `ingress` mới | Dùng `--reset-then-reuse-values` (helm ≥3.14). Giữ template **không** nil-guard: fail to hơn là im lặng tắt ingress/datastore |

---

## Bằng chứng theo từng acceptance

### 1.B0.1 — Calico CNI token

| AC | Kết quả |
|---|---|
| CronJob `rollout restart ds/calico-node` mỗi 12h | `dlp-calico-token-refresh` · `0 */12 * * *` · đã tạo trong `kube-system` |
| Job chạy được và **token thật sự được ghi mới** | trước: `exp=1786340207` → sau: `exp=1786347833` (= `now 1786261447` + 24h). Đây là số đo, không phải suy luận từ "job Complete" |
| Canary tạo-pod chạy trong cron | `dlp-cni-canary` · `*/30 * * * *` · ns `dlp-sandbox` · run tay → `Complete`, `succeeded=1` |
| **Canary đã đỏ ít nhất một lần có chủ ý** | ép `runtimeClassName: khong-ton-tai` → Job `Failed` / `DeadlineExceeded`, event ghi nguyên văn `pods "canary-red-" is forbidden: pod rejected: RuntimeClass "khong-ton-tai" not found`. Đã dọn sạch |
| Cron chạy > 25h, log có ≥ 2 lần restart, tạo pod OK tại T+25h *và* T+37h | ⏳ **NỢ** — bất khả thi trong một phiên. Xem §Nợ |

RBAC của job vá: `Role` chỉ `get,patch` trên `resourceNames: [calico-node]`. Không có `list`/`watch` (chúng không tôn trọng `resourceNames` nên sẽ nới quyền ra toàn `kube-system`).

### 1.B0.2 — Redis + Postgres in-cluster

| AC | Kết quả |
|---|---|
| `CONFIG GET notify-keyspace-events` chứa `E` và `x` | trả `xE` ✔ |
| `appendonly` | `yes` ✔ |
| Pod orchestrator Running với `REDIS_URL`/`DATABASE_URL` trỏ service in-cluster | 5/5 pod Running: web, orchestrator, gateway, postgres, redis. Hai URL tới qua `secretKeyRef` → `platform-datastore` |
| Lưu trữ bền | PVC `platform-postgres` (4Gi) + `platform-redis` (1Gi) đều `Bound`, StorageClass `local-path`, gắn `helm.sh/resource-policy: keep` |

`DATABASE_URL`/`REDIS_URL` **chứa mật khẩu** nên được ghép sẵn trong Secret chứ không phải `env.value` trên Deployment: `kubectl get deploy -o yaml` là quyền phổ thông, và mật khẩu Redis đọc được nghĩa là ghi đè được `session:{id}:pod` — SSOT ánh xạ session→pod, tức là đường nối user A vào shell của user B.

Mật khẩu qua `urlquery` trước khi nhúng vào URL: `openssl rand -base64` sinh ra `+` và `/`, và một `@` lọt vào sẽ cắt URL ở sai chỗ.

**Migration:** đã `drizzle-kit migrate` lên Postgres in-cluster (qua `kubectl port-forward` + tunnel SSH) — cần thiết vì Better Auth lưu khoá JWKS trong bảng `jwks`. **Chưa tự động hoá** — xem §Nợ.

### 1.B0.3 — Contract Redis + chuyển `rediskeys`

Sửa `docs/redis-key-vectors.json` **trước** để hai suite đỏ đúng chỗ thiếu, rồi mới bắt kịp hai bên.

- 4 key mới pin trong vector + doc + cả hai bản hiện thực: `pool:claimed`, `pod:{name}`, `idem:{key}`, `session:{id}:ws`.
- 9 field của hash `session:{id}` pin lần đầu (`sessionFields`), test so cả **thứ tự** — đây là contract liên-service vô hình mà proto không mô tả (orchestrator ghi, gateway đọc cho authz vế `g`).
- Package chuyển `services/orchestrator/internal/rediskeys` → `services/shared/rediskeys`; đường dẫn vector trong test từ 4 cấp `..` xuống 3 (D7). `cmd/dbsmoke` + 4 tài liệu cập nhật theo.
- Giới hạn CROSSSLOT ghi vào doc (D10) kèm lý do **không** thêm hash tag `{dlp}` ở v0.
- Vector invalid bổ sung 2 ca mới: `a:ws` (bẻ namespace nhắm bộ đếm WS) và `a{dlp}b` (`idempotency_key` tới từ client — không cho client tự chọn slot).

`go test ./services/shared/rediskeys` xanh; `redis-keys.test.ts` xanh trong 12/12 task turbo.

### 1.B0.4 — Gộp origin

| AC | Kết quả |
|---|---|
| Dev: `/` và `/ws/*` cùng một origin | Caddy `:8080` → `/` trả **200** (web), `/ws/session/abc` trả **401** (gateway trả, không phải 502 của Caddy) |
| WS upgrade đi qua được proxy | handshake thật → **101 Switching Protocols**, `Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=` đúng, subprotocol `dlp.terminal.v1` echo lại, stub log đúng path |
| Prod: Ingress route `/ws/*` cùng origin | template có, `helm template` render đúng thứ tự `/ws` trước `/`. **Tắt mặc định** — cluster lab chưa có ingress controller (Traefik ở P3) |
| DevTools: cookie scope `/ws` gửi kèm handshake | ⏳ **NỢ** — cần G12 (mint cookie) + G1 (upgrade thật). Xem §Nợ |

`extra_hosts: host.docker.internal:host-gateway` là bắt buộc trên Docker Engine Linux; vô hại trên Desktop. Proxy nằm sau `profiles: ['proxy']` nên `docker compose up -d` mặc định không dựng một cổng 8080 trả 502 làm người mới tưởng hạ tầng hỏng.

### 1.B0.5 — Đường JWKS

| AC | Kết quả |
|---|---|
| `curl $GATEWAY_JWKS_URL \| jq '.keys[0]'` trả `kty:"OKP"`, `crv:"Ed25519"`, `kid` khác rỗng | `{"alg":"EdDSA","crv":"Ed25519","x":"STHO6r…","kty":"OKP","kid":"hwAHbjVfA7QDDziWJBsWaZN1dHTNug2c"}`, HTTP 200 — gọi **từ trong cluster**, đúng URL `http://platform-web:3000/api/auth/jwks` mà gateway đang cấu hình |
| Biến có ở cả 4 nơi | `internal/config/config.go` · `services/terminal-gateway/.env.example` · Helm (`values.yaml` + `gateway-deployment.yaml`) · `.github/ci.env`. `node scripts/env-check.mjs` → OK, 39 biến, 4 scope |

Khẳng định của D15 được xác nhận bằng số đo: khoá là **EdDSA/Ed25519 của chính Better Auth**, không sinh khoá mới, không có khoá nào phải xoay vòng bằng tay.

---

## Cổng đã chạy

```
go build/vet/test  4 module            xanh (rediskeys 0.402s, gateway config 0.395s)
node scripts/env-check.mjs             OK — 39 biến, 4 scope
pnpm turbo run lint typecheck test     12/12 successful
helm lint (values-selfhost)            0 chart failed
helm upgrade --reset-then-reuse-values REVISION 5, STATUS deployed
```

---

## Nợ tường minh (KHÔNG đánh dấu xanh)

1. **AC Calico >25h.** Cron cài lúc 2026-08-09 ~14:35 (+07). Đóng ô này cần: đọc log cron thấy **≥2** lần restart thành công, và tạo pod mới trong `dlp-sandbox` thành công tại **T+25h** *và* **T+37h** — tức sớm nhất 2026-08-10 ~15:35 và 2026-08-11 ~03:35. Canary tự chạy mỗi 30 phút nên bằng chứng sẽ tự tích luỹ; chỉ cần đọc `kubectl -n dlp-sandbox get jobs -l app.kubernetes.io/component=cni-canary`.
2. **AC DevTools cookie `/ws`.** Không đóng được ở B0: chưa có ai mint cookie `dlp_sandbox` (G12) và chưa có upgrade thật (G1). Thứ B0 nợ được là **topology**, và topology đã chứng minh bằng 101 + subprotocol qua proxy. Ô này thuộc về lúc nghiệm thu 1.C.
3. **Migration Postgres chưa tự động.** Hiện phải chạy tay `drizzle-kit migrate` qua port-forward sau mỗi lần dựng lại DB. Chưa có Job/initContainer trong chart — cố ý nằm ngoài phạm vi B0, nhưng phải xử lý trước khi ai đó dựng lại cluster từ đầu và ngạc nhiên vì `/api/auth/jwks` 500.
4. **`SESSION_TTL` vẫn chưa được pin** (D11 im lặng, `redis-key-namespace.md` nói 1h, verify command nói 600s). Plan đã hẹn chốt lúc làm B3 — chưa tới.
5. **Mật khẩu datastore nằm trong release secret của Helm.** Giống hệt `betterAuthSecret` hiện tại; đường prod là `datastore.existingSecret`. Chấp nhận được cho lab, không chấp nhận được cho P3.

---

## Gotcha đáng nhớ (đã ghi vào comment tại chỗ)

- `helm upgrade --reuse-values` **bỏ qua default mới của chart**. Thêm khối values mới + `--reuse-values` = nil pointer. Dùng `--reset-then-reuse-values`.
- `registry.k8s.io/kubectl` distroless: `args` cho ENTRYPOINT `kubectl` là tất cả những gì chạy được — không `command: ["/bin/sh","-c"]`.
- `defaultMode` trong ConfigMap volume phải là octal **YAML 1.1** (`0555`), không phải `0o555` của YAML 1.2 (parser k8s là `sigs.k8s.io/yaml` trên `yaml.v2`).
- Deployment ôm PVC `ReadWriteOnce` **bắt buộc** `strategy: Recreate`; RollingUpdate mặc định sẽ kẹt Pending vĩnh viễn ở đúng lúc `helm upgrade`.
- `imagePullPolicy: Never` của self-host chỉ đúng cho image **của ta** (import tay vào containerd). Postgres/Redis đến từ Docker Hub nên `datastore.imagePullPolicy` phải đè thành `IfNotPresent`, nếu không là `ImagePullBackOff` vĩnh viễn với thông báo không nói lý do thật.
- Pod Sysbox + `registry.k8s.io/pause` chạy được và Ready trong ~7s — canary không cần image đặc biệt nào.

---

## Vòng review đối kháng — 14 phát hiện, đã vá 14

`t1k-code-reviewer` chạy sau khi mọi cổng đã xanh và sau khi đã deploy thật. Nó vẫn tìm ra **hai lỗi CHẶN nằm đúng ở đường mà lần verify thủ công không đi qua** — đây là lý do bước review tồn tại.

### Chặn

| # | Vấn đề | Vì sao verify thủ công không bắt được |
|---|---|---|
| 1 | **CI `helm lint` sẽ đỏ.** `.github/ci.yml` lặp qua 3 bộ values và chỉ truyền `--set web.env.betterAuthSecret`. `values-selfhost.yaml` giờ bật `datastore.enabled` ⇒ hai `required` mật khẩu bắn ⇒ exit 1. | Lần verify chạy `helm upgrade` **có** `--set` mật khẩu. Đường CI không có. Đúng bài học đã ghi: *cổng CI phải thử trên đường CI, không phải trên đường tay.* Đã thêm hai `--set` vào cả `helm lint` lẫn `helm template` + một bước mới render **nhánh ingress bật** (chưa bộ values nào bật ⇒ chưa từng qua `kubeconform`). Đã chạy lại **đúng lệnh của ci.yml**: 3/3 lint OK. |
| 2 | **`golangci-lint` sẽ đỏ.** Import `shared/rediskeys` chèn giữa hai import `internal/*` ⇒ `gofmt` fail. | `go build`/`vet`/`test` không kiểm định dạng. Đã sửa thứ tự. *(Ghi chú: `gofmt -l` trên Windows còn báo 2 file **không** thuộc thay đổi này — thuần CRLF do `core.autocrlf=true`; CI checkout LF nên xanh.)* |

### Cao — một lỗ bảo mật thật, đóng ngay vì đây là task pin contract

**`idem:{key}` không scope theo user.** Proto quy định trúng key cũ thì "trả lại đúng session cũ". Namespace toàn cục ⇒ user B gửi trùng `idempotency_key` của A **nhận lại session của A**: B biết `sessionId` của A (chính thứ mô hình chống IDOR bảo vệ), BFF mint cho B token `sub=B, sid=sessionA` đi qua được bước **e** và **f**, chỉ chết ở bước **g** — vế `g` từ phòng thủ chiều sâu thành lớp **duy nhất**. Kèm DoS chéo.

Đóng ngay thay vì ghi nợ vì **1.B0.3 chính là task pin contract này**; để sau nghĩa là đổi contract lần hai. `Idem(userID, key)` → `idem:{userId}:{key}`, hai đoạn validate riêng, thêm test *"hai user cùng key ra hai key khác nhau"* — **ca duy nhất chứng minh scope tồn tại** (mọi ca cũ vẫn xanh với hiện thực toàn cục). Thêm regex khớp validator vào zod của BFF để từ chối ở biên gần client nhất. Ghi thành **R23** trong bảng rủi ro.

### Các mục còn lại đã vá

| # | Vấn đề | Vá |
|---|---|---|
| 4 | Redis **dev** thiếu `--notify-keyspace-events` dù 1.B0.2 liệt kê `docker-compose.yml` trong "Chạm" ⇒ reaper "chạy đúng" trên cluster, im lặng vô dụng trên máy dev | Thêm `Ex`; đã đo lại: dev trả `xE` |
| 5 | `postgres.enabled`/`redis.enabled` không gate Secret ⇒ cấu hình "managed PG + Redis in-cluster" làm `helm upgrade` fail vì đòi mật khẩu cho component đã tắt | Gate từng component trong Secret + hai deployment. Đã render thử nhánh `postgres.enabled=false`: không sinh key/Deployment/PVC nào của Postgres, `DATABASE_URL` lấy từ values |
| 6 | Comment mô tả **ngược** cơ chế xoay mật khẩu Postgres; lệnh trong README sinh mật khẩu mới **mỗi lần upgrade** ⇒ checksum rollout mọi consumer với URL sai ⇒ 28P01 toàn hệ thống trong khi helm báo thành công | Sửa comment; thêm mục "⛔ Xoay mật khẩu" vào README + cảnh báo trong `values-secrets.example.yaml`. Lần deploy lại vừa rồi **cố ý không** truyền lại `--set`, và JWKS vẫn trả đúng `kid` cũ ⇒ DB nguyên vẹn |
| 7 | "BƯỚC 3.5" hứa bảo vệ cổng P0.F nhưng chỉ `kubectl apply` CronJob — lần chạy đầu có thể 12h sau | Ép chạy job ngay + `wait Complete` + `rollout status`. Đã chạy lại script: bootstrap job Complete, calico rolled out |
| 8 | Canary tranh quota: 4 pod sandbox = đúng 2000m/2048Mi ⇒ canary không được admit lúc đông nhất ⇒ **báo động giả**, và đỏ-vì-quota trùng tín hiệu đỏ-vì-CNI-chết | Quota `requests` → `2100m/2112Mi` (4 pod + phần canary). Trần đồng thời vẫn 4, công thức D16 không đổi. Đã đo trên cluster |
| 9 | Plan hứa `make env-check` gác đủ "4 nơi" — thực tế chỉ gác 3 cho service Go (`ci.env` chỉ ràng với `requireEnv()` của TS) | Đính chính thẳng vào plan thay vì để lane gateway tin một lời hứa sai |
| 10 | zod `idempotencyKey: z.string().min(1)` cho qua `a:ws`, chuỗi 500 ký tự | Regex khớp validator |
| 11 | `# PROXY_HOST=0.0.0.0` được ghi sẵn — bật lên là giết cookie `Secure` trong im lặng (chỉ `localhost` là secure context trên HTTP) | Cảnh báo tại chỗ |
| 12 | JWKS đi HTTP trần trong namespace platform, chart **không** có NetworkPolicy cho `dlp-platform` ⇒ điểm tin cậy duy nhất của luật 6/10 | Ghi thành **R24**, đóng ở P3 |
| 13 | `kubectl apply -f <URL GitHub>` không verify checksum, dù E3 của chính plan này cấm `curl \| bash` vì đúng lý do đó | Tải → `sha256sum -c` → apply. Hash ghim trong script |
| 14 | `values-secrets.example.yaml` thiếu mật khẩu datastore ⇒ người theo tài liệu vẫn gặp `required` | Bổ sung kèm cảnh báo "đặt một lần rồi giữ nguyên" |
| thấp | Ingress không guard `web/gateway.enabled`; checksum không guard `existingSecret`; `REDIS_URL` thiếu `/0`; Redis không có `maxmemory` ⇒ OOMKill mất mọi session | Đã vá cả bốn. `maxmemory` + **`noeviction`** (không bao giờ `allkeys-lru`: evict một `session:{id}` là mất session trong im lặng). Đo lại: `maxmemory-policy = noeviction` |

**Cổng chạy lại sau khi vá:** `gofmt` sạch · Go 4 module build/vet/test xanh · `env-check` OK · turbo **12/12** (`--force`) · 3/3 `helm lint` bằng **đúng lệnh của ci.yml** · nhánh ingress + nhánh `postgres.enabled=false` render đúng · release **REVISION 6** deployed, 5/5 pod Running, JWKS vẫn trả đúng `kid` cũ.

Hai mục reviewer nêu mà **không** sửa: `urlquery` mã hoá dấu cách thành `+` (cách sinh được document là `openssl rand -hex`, không có dấu cách — đã ghi chú tại chỗ thay vì đổi cách escape), và validator cho phép chữ hoa/`_` là tập cha của RFC1123 label (orchestrator tự kiểm soát tên pod nên không vỡ; comment đã nói đúng chiều).

## Bước kế tiếp theo plan

Thứ tự bắt buộc của `phase-1.md` giờ mở ra: **1.A-1** (spike WS ⇄ pod-exec) và **1.A-2** (spike claim atomic) chạy song song được, cả hai là HARD-GATE. **D-19′** (kubelet `podPidsLimit`) đã hết bị chặn về mặt cấu hình — nhưng theo R22 phải chạy `rollout restart ds/calico-node` và kiểm token còn hạn ngay trước khi restart kubelet, và không làm lúc đang demo.
