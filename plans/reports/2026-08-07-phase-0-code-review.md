# Code Review — Phase 0 (0.A / 0.B / 0.C / 0.E)

Scope: toàn bộ file chưa commit (89 file untracked + `.gitignore`). Không sửa file nào.
Bỏ qua theo yêu cầu: 0.D, 0.G, Helm task 27, `apps/web` chưa phải Next.js.

---

## Critical (phải sửa trước khi merge)

### C1. `docker-compose.yml:32-33` — Redis không mật khẩu, publish ra 0.0.0.0

```yaml
ports:
  - '${REDIS_PORT:-6379}:6379'
command: ['redis-server', '--appendonly', 'yes']
```

Không có `requirepass`, không bind loopback. `ports:` trong compose mặc định bind `0.0.0.0`.

Kịch bản hỏng cụ thể: host lab là `192.168.94.130` (VM Debian trong memory). Bất kỳ máy nào
cùng LAN chạy `redis-cli -h 192.168.94.130` là có toàn quyền `FLUSHALL`, và quan trọng hơn — ghi
đè `session:{id}:pod`. Theo `docs/redis-key-namespace.md`, key đó là SSOT ánh xạ session → pod.
Ghi đè được nó = terminal-gateway ở P1 sẽ nối user A vào pod của user B. Đây đúng là kịch bản
mà `wsroute.go` đang cẩn thận phòng ngừa ở tầng WS, nhưng lại để hở ở tầng dữ liệu.

Postgres cùng vấn đề (`:15-16`) + password mặc định `dlp_dev_only` qua `${...:-}` nên **không
bao giờ fail** khi thiếu env — chạy nhầm compose này trên server là có DB password công khai
trong git.

Sửa: `'127.0.0.1:${REDIS_PORT:-6379}:6379'`, `--requirepass`, và đổi
`${POSTGRES_PASSWORD:?POSTGRES_PASSWORD phải được đặt}` để thiếu env là dừng chứ không rơi về
default.

---

## Important (sửa trước khi sang P1)

### I1. `services/orchestrator/cmd/orchestrator/main.go:105` — `GracefulStop()` không có deadline

`cfg.ShutdownGrace` (mặc định 15s) chỉ được truyền cho HTTP (`main.go:81`). `grpcSrv.GracefulStop()`
ở dòng 105 **chặn vô thời hạn** cho tới khi mọi RPC đang bay kết thúc.

Kịch bản: P1 thêm streaming RPC hoặc một `CreateSession` gọi K8s API bị treo. SIGTERM → HTTP
shutdown xong sau 15s, nhưng `GracefulStop()` treo → process không thoát →
`terminationGracePeriodSeconds` hết → SIGKILL. Log "đã dừng sạch" không bao giờ in ra và ta
mất mọi cơ hội dọn dẹp (trả pod về pool, ghi audit).

Tên field là `ShutdownGrace` (chung) nhưng chỉ áp cho một nửa vòng đời — đó là cái bẫy.
Sửa: chạy `GracefulStop()` trong goroutine, `time.AfterFunc(cfg.ShutdownGrace, grpcSrv.Stop)`.

### I2. `main.go:59-60`, `httpx.go:46-50` — health vẫn báo SERVING trong lúc shutdown

`healthSrv` được đăng ký nhưng không bao giờ `SetServingStatus(..., NOT_SERVING)` trước khi
`GracefulStop()`. `/healthz` (httpx.go:46) cũng trả 200 cứng cho tới lúc listener đóng.

Kịch bản: rolling deploy. K8s gửi SIGTERM; endpoints controller cần vài trăm ms tới vài giây để
rút pod khỏi Service. Trong khoảng đó pod vẫn báo healthy → LB vẫn gửi kết nối mới → client nhận
RST/502. Đây là nguồn 502 kinh điển lúc deploy.

Sửa: ngay sau khi nhận tín hiệu (main.go:100), set `healthSrv.SetServingStatus("", NOT_SERVING)`
và lật một `atomic.Bool` mà `/healthz` đọc để trả 503, **rồi mới** sleep một nhịp và stop.

Phụ: `health.NewServer()` chỉ set service rỗng `""` = SERVING. Probe cấu hình
`grpc: {service: orchestrator.v1.SessionService}` sẽ nhận `NotFound` → probe đỏ.

### I3. `main.go:63` — gRPC reflection bật vô điều kiện

```go
reflection.Register(grpcSrv)  // comment: "Cần tắt ở prod (P3 hardening)"
```

Comment không phải là cơ chế. Image distroless build từ file này chính là thứ sẽ chạy trên host
lab. Reflection cho phép bất kỳ ai tới được cổng 9090 `grpcurl -plaintext ... list` để lấy toàn
bộ API surface. Cổng 9090 hiện đang mở (đã verify trong brief).

Sửa 3 dòng: `if envx.Bool("GRPC_REFLECTION", false) { reflection.Register(...) }`. Hoãn tới P3
là hoãn một thứ rẻ hơn cả cái comment giải thích vì sao hoãn.

### I4. `terminal-gateway` — `/metrics` nằm chung port với endpoint người dùng

`main.go:46-49` + `wsroute.Register(obs.Mux, ...)`: `/healthz`, `/metrics` và `/ws/session/{id}`
dùng **cùng một mux, cùng một port `:8082`**. Cổng WS là cổng phải mở ra ngoài cho trình duyệt.
Nghĩa là `/metrics` cũng mở ra ngoài, không authz.

Rò: `dlp_build_info{service,version}` lộ chính xác version đang chạy (map CVE), `go_*` +
`process_*` lộ số goroutine/FD/RSS → đếm được số session đang chạy và dò được thời điểm scale.
Orchestrator không dính vì :8081 là port nội bộ, nhưng gateway thì có.

Sửa: gateway dựng **hai** `http.Server` — một admin (:8082 nội bộ, `/healthz` + `/metrics`), một
public chỉ có `/ws`. `httpx.NewObservability` đã tách `Registry` và `Mux` nên chỉ cần thêm mux thứ hai.

### I5. `services/shared/httpx/httpx.go:66-69` — timeout 30s sẽ giết WebSocket ở P1

`NewServer` set `ReadTimeout: 30s` / `WriteTimeout: 30s`, và gateway dùng đúng constructor này
cho port sẽ mang WS. Sau `Hijack()`, deadline mà `net/http` đã đặt lên conn **vẫn còn hiệu lực**;
nếu thư viện WS không tự `SetReadDeadline`/`SetWriteDeadline` lại thì mọi phiên terminal đứt ở
giây thứ 30.

Chưa nổ ở P0 (route trả 401), nhưng đây là mìn đặt sẵn đúng chỗ P1 sẽ giẫm. Ngoài ra
`srv.Shutdown()` **không** đợi và **không** đóng hijacked conn → graceful shutdown của gateway sẽ
không drain được phiên terminal nào.

Sửa: tách `NewWSServer` (ReadTimeout/WriteTimeout = 0, giữ ReadHeaderTimeout) hoặc cho `NewServer`
nhận option; và ghi rõ trong doc rằng shutdown phải tự đếm hijacked conn.

### I6. `httpx.go:93-95` — Shutdown timeout không kèm `Close()`

```go
if err := srv.Shutdown(shutdownCtx); err != nil {
    return err
}
```

Khi hết `grace` mà vẫn còn kết nối, `Shutdown` trả `context.DeadlineExceeded` và **trả về ngay,
không đóng các kết nối còn lại**. Hàm return luôn, không gọi `srv.Close()`. Kết nối + goroutine
của chúng còn sống.

Ở orchestrator hậu quả bị che vì `run()` return → `os.Exit(1)`. Nhưng contract của hàm này là
"chạy tới khi ctx huỷ rồi shutdown mềm" — caller có quyền gọi lại/dùng lại. Sửa:
`defer srv.Close()` hoặc gọi `srv.Close()` ở nhánh lỗi.

(`context.WithoutCancel` ở dòng 91 thì **đúng** — ctx đã bị huỷ, cần parent không-huỷ để
`WithTimeout` có tác dụng. Không có bug ở đó.)

### I7. `apps/web/src/scripts/db-smoke.ts:45-48` — `finally` có thể treo process

```ts
} finally {
  await sql.end({ timeout: 5 });
  redis.disconnect();
}
```

Nếu `sql.end()` **reject** (Postgres bị kill giữa chừng, connection error lúc đóng) thì
`redis.disconnect()` không bao giờ chạy. Socket ioredis còn mở → event loop còn handle →
`process.exitCode = 1` được set nhưng process **không thoát**. Trong CI đó là job treo tới timeout,
không phải fail nhanh.

Sửa: `await Promise.allSettled([sql.end({timeout:5}), Promise.resolve(redis.disconnect())])`,
hoặc `try { await sql.end(...) } finally { redis.disconnect() }` lồng nhau.

### I8. `apps/web/src/server/redis/client.ts:4-11` — thiếu listener `error`

`new Redis(...)` kết nối ngay (không `lazyConnect`). `Redis` là `EventEmitter`; ioredis emit
`error` khi mất kết nối. **`EventEmitter` không có listener cho `'error'` sẽ ném uncaught
exception và giết process.**

Kịch bản P0: redis down → db-smoke chết bằng `Unhandled error event: connect ECONNREFUSED`, không
đi qua `main().catch()` nên không in `[smoke] FAIL`, thông báo lỗi vô nghĩa với người mới clone repo.
Kịch bản 0.D: một lần Redis restart → toàn bộ Next.js server process chết, không phải một request lỗi.

Sửa: `client.on('error', (e) => { /* log có cấu trúc */ })` ngay trong `createRedis`.

Phụ: `createDatabase()` tạo pool `max: 10` **mỗi lần gọi**. Ở 0.D nếu gọi trong request handler
là mỗi request một pool 10 connection → cạn `max_connections` của Postgres. Cần singleton
module-level trước khi 0.D chạm vào.

### I9. `turbo.json` — thiếu `globalDependencies`, cache xanh giả

`turbo.json` không khai báo `globalDependencies`. Turbo mặc định chỉ hash file **trong** package
+ lockfile + root `package.json`.

Kịch bản: sửa `tsconfig.base.json` (bật/tắt `strict`, đổi `target`) → `pnpm turbo run build test`
trả **FULL TURBO / cached**, báo xanh, mà không hề typecheck lại với config mới. Y hệt với
`eslint.config.mjs` root và `.prettierrc.json`. Ở 0.G, CI sẽ tin cái xanh đó.

Sửa: `"globalDependencies": ["tsconfig.base.json", "eslint.config.mjs", ".prettierrc.json", ".npmrc"]`.

Phụ: `build` của cả hai package là `tsc --noEmit` — trùng hệt `typecheck`, mà `outputs`
lại khai `dist/**`/`.next/**` (không bao giờ sinh ra). Task `build` hiện tại là no-op có tên gây hiểu nhầm.

### I10. `package.json:16` / `Makefile:proto-check` — drift gate mù với file mới và file chết

```
"proto:check": "buf generate && git diff --exit-code -- proto packages/shared-types/gen"
```

Hai lỗ thật:

1. `git diff` **không thấy file untracked**. Thêm `proto/orchestrator/v1/pool.proto` → `buf generate`
   sinh `pool_pb.ts` + `pool.pb.go` mới (untracked) → `git diff --exit-code` = 0 → gate **xanh** dù
   generated code chưa được commit. Đúng cái nó sinh ra để chặn.
2. `buf.gen.yaml` cố ý không dùng `clean: true` (lý do chính đáng: giữ `go.mod` viết tay). Hệ quả:
   **xoá/đổi tên** một message → file generated cũ **ở lại**, không bị sửa → `git diff` sạch → gate xanh,
   nhưng code chết vẫn export type không còn trong contract.

Sửa: `git status --porcelain -- proto packages/shared-types/gen` và fail nếu output khác rỗng
(bắt cả `??`). Cho (2): chuyển `go.mod` của module generated ra ngoài `proto/gen/go` (ví dụ
`proto/go.mod` với `out: proto/gen/go`) rồi bật được `clean: true`.

Ngoài ra `buf.yaml` khai `breaking: use: FILE` nhưng **không có lệnh nào chạy `buf breaking`**
với baseline. Contract SSOT mà không có breaking-check là contract chỉ có trên giấy.

### I11. `apps/web/src/server/db/schema.ts:51-73` — `sessions_audit` vừa là log vừa là state, và bị CASCADE xoá

Ba vấn đề chồng nhau trong một bảng:

1. **`onDelete: 'cascade'` trên audit trail.** Xoá user → toàn bộ lịch sử session của user đó
   biến mất. Audit trail mà biến mất theo đối tượng bị audit thì không phải audit trail. Nếu
   một learner bị ban vì abuse sandbox, bằng chứng bị xoá cùng lúc.
2. **Không có UNIQUE trên `session_id`.** Bộ cột (`status`, `claimed_at`, `expires_at`, `reaped_at`,
   `reap_reason`) có hình dạng "một dòng trạng thái cho mỗi session", nhưng không gì chặn ghi
   hai dòng. Hai `ReapSession` đồng thời (mà proto nói phải idempotent) → hai dòng audit mâu thuẫn.
   Nếu chủ ý là event-log nhiều dòng thì `status`/`expires_at` là **derived field** của Redis —
   vi phạm chính luật §4 mà comment ở dòng 45-49 viện dẫn.
3. **`tier` và `status` là `text` trần** trong khi `user_role` đã dùng `pgEnum` và proto có
   `SandboxTier`/`SessionStatus`. Không có ràng buộc DB → một typo `"runing"` ghi vào được và
   chỉ lộ ra khi query lọc theo status trả rỗng.

Cần chốt bảng này là **event log** (thì bỏ `status`/`expires_at`, thêm `event_type` + `at`,
`ON DELETE SET NULL`) hay **state row** (thì `UNIQUE(session_id)`) — hiện tại nó là cả hai và
không đúng cái nào.

### I12. `apps/web/src/server/db/schema.test.ts:42-48` — test tautology, tạo cảm giác an toàn giả

```ts
expect(columns).not.toContain('is_active');
expect(columns).not.toContain('current_status');
```

Test tên là "sessions_audit KHÔNG có cột trạng thái sống nào" nhưng chỉ kiểm **hai tên cột do
chính nó bịa ra**, không ai định thêm. Trong khi bảng **đang có** `status`, `pod_name`,
`namespace`, `expires_at` — chính xác là dữ liệu trạng thái sống nhân bản từ Redis.

Test này sẽ mãi xanh và sẽ khiến người đọc tin rằng luật no-derived-field đang được gác.
Nó tệ hơn không có test. Nếu muốn gác thật: assert **allowlist đầy đủ** các cột
(`expect(columns).toEqual([...])`) để mọi cột thêm vào đều phải đi qua review.

---

## Minor / Suggestion

### M1. `services/orchestrator/internal/config/config.go:25-31` — orchestrator bắt buộc env nó không dùng

`cfg.DatabaseURL` / `cfg.RedisURL` chỉ được đọc ở `cmd/dbsmoke/main.go:49,60`. Binary
`cmd/orchestrator` **không hề** nối DB/Redis nhưng vẫn từ chối khởi động nếu thiếu hai biến đó.
Deploy orchestrator vào K8s mà chưa gắn secret → CrashLoopBackOff với message gây hiểu nhầm
("bắt buộc nhưng chưa đặt" cho thứ nó không dùng). Ở P1 thì hợp lý; ở P0 nên để `dbsmoke` tự
`envx.Require` phần của nó.

Cùng nhóm: `SessionTTL` và `SandboxNamespace` cũng chưa được đọc bởi bất kỳ đâu.

### M2. `services/terminal-gateway/internal/wsroute/wsroute.go:19-22` — log INFO trên endpoint chưa authz

Mỗi request bị từ chối ghi một dòng INFO kèm `r.RemoteAddr`. Endpoint này public và unauthenticated.
Một vòng `curl` là đầy quota Loki (log-flood/DoS rẻ tiền), và IP là PII được ghi vô điều kiện.
Nên hạ xuống `Debug`, hoặc rate-limit/sample. Ở P1 khi có authz thật thì log fail-auth là đúng —
nhưng lúc đó cần rate limit.

### M3. Không có `.dockerignore`

Build context là root repo → gửi cả `node_modules/`, `.git/`, `plans/`, `secure-test-devops/`
cho daemon mỗi lần build. Ngoài chậm: `COPY services/orchestrator ./services/orchestrator` sẽ
copy luôn `services/orchestrator/.env` (nếu dev đã tạo) vào **layer của build stage**. Image cuối
distroless chỉ nhận binary nên không lộ, nhưng build cache thì có. Thêm `.dockerignore` với
`node_modules`, `.git`, `**/.env`, `plans`, `docs`.

### M4. Test đọc env thật, dễ đỏ theo máy

`services/orchestrator/internal/config/config_test.go:16` (`TestLoadAppliesDefaults`) assert
`GRPCAddr == ":9090"` nhưng không `t.Setenv("GRPC_ADDR", "")`. Dev nào export `GRPC_ADDR` hoặc
`HTTP_ADDR` trong shell là test đỏ vì lý do không liên quan. Tương tự
`terminal-gateway/internal/config/config_test.go:10-20` (`HTTP_ADDR`, `LOG_LEVEL`).
Test kiểm default phải chủ động xoá mọi biến nó assert.

### M5. `wsroute_test.go:26-36` — hai case trong loop pass vì lý do sai

```go
for _, id := range []string{"abc123", "", "../etc"} {
```

- `""` → path `/ws/session/` không khớp pattern `{id}` (Go mux yêu cầu segment không rỗng) → **404**.
- `"../etc"` → `ServeMux` clean path thành `/etc` → **301**.

Cả hai đều thoả assertion `code != 101 && code != 200` mà **chưa từng chạm handler**. Test trông
như đang gác path-traversal nhưng thực ra chỉ gác routing của stdlib. Nên assert cứng
`rec.Code == 401` cho id hợp lệ (đã có ở test kế) và assert riêng 404/301 cho hai case kia, kèm
comment nói rõ đó là hành vi của mux chứ không phải của authz.

### M6. `packages/shared-types` export `.ts` thô

`"exports": { ".": "./src/index.ts" }`. Ở 0.D, Next.js sẽ cần `transpilePackages` và bất kỳ
consumer non-TS nào cũng vỡ. Hoạt động được ở P0 chỉ vì mọi consumer đều là `tsx`/`vitest`.
Ghi vào README của package để 0.D không mất buổi debug.

### M7. `apps/web/package.json` — `--env-file=.env` chỉ ở `db:smoke`

`db:smoke` dùng `tsx --env-file=.env`, nhưng `db:generate`/`db:migrate`/`db:studio` thì không.
Ba script sau chỉ chạy nếu dev tự export env — không nhất quán, và `--env-file` (không phải
`--env-file-if-exists`) sẽ ném ENOENT nếu chưa có `.env`, thông báo lỗi khó hiểu với người mới clone.

### M8. `docker-compose.yml:4` — `restart: unless-stopped` cho stack dev

Postgres/Redis sẽ tự bật lại mỗi lần boot máy, giữ port mở vĩnh viễn (xem C1). Dev stack nên
là `restart: "no"`.

---

## Câu hỏi 3 — Rủi ro SSOT của redis key namespace

**Đánh giá: guard hiện tại là ảo, và tài liệu tự thừa nhận điều đó.**

`docs/redis-key-namespace.md:10-12` viết: "Sửa một bên mà quên bên kia thì test bên đó vẫn xanh".
Đúng vậy — và đó chính là định nghĩa của "không phải guard". Trong khi
`rediskeys/keys.go:5` lại nói "Hai bản dùng CÙNG bộ test vector", nghe như có cơ chế đối chiếu.
Không có. Hai file test là hai bản chép tay độc lập; cả hai suite đều xanh khi chúng lệch nhau.

Ba lỗ cụ thể ngay lúc này:
- Thêm key thứ tư ở Go mà quên TS: 0 test đỏ.
- Đổi `ID_PATTERN` một bên (ví dụ nới thành `{1,128}`): 0 test đỏ, và session id 100 ký tự sẽ
  được Go chấp nhận rồi bị TS từ chối — lỗi 500 chỉ với một số user.
- Vector hiện tại không phủ ký tự hợp lệ `-` và `_` (chỉ có `abc123`). Nếu một bên vô tình bỏ
  `-` khỏi regex, cả hai suite vẫn xanh, và mọi UUID-with-dash sẽ vỡ ở đúng một phía.

**Cách gác tốt hơn mà không cần codegen** (rẻ, ~30 phút):

Đưa vector ra một file dữ liệu duy nhất — `docs/redis-key-vectors.json`:

```json
{
  "pool_free": "pool:free",
  "valid": [
    { "id": "abc123", "session": "session:abc123", "pod": "session:abc123:pod" },
    { "id": "a-b_C9", "session": "session:a-b_C9",  "pod": "session:a-b_C9:pod" },
    { "id": "<64 ký tự>", "...": "..." }
  ],
  "invalid": ["", "a:b", "a b", "a/b", "<65 ký tự>", "á", "a\n"]
}
```

`redis-keys.test.ts` đọc bằng `readFileSync` + `JSON.parse`; `keys_test.go` đọc bằng
`os.ReadFile` + `encoding/json` (hoặc `//go:embed` với một symlink/copy trong CI). Cả hai suite
đọc **cùng một byte**. Lúc đó:
- Sửa một bản hiện thực → suite bên đó đỏ ngay, vector không cần đụng tới.
- Thêm key mới → sửa JSON → **cả hai** suite đỏ cho tới khi cả hai bản hiện thực bắt kịp.
- File JSON nằm cạnh `redis-key-namespace.md` nên "sửa doc" và "sửa vector" là một thao tác.

Thêm một chốt rẻ nữa: thêm `docs/redis-key-vectors.json` vào `turbo.json` → `globalDependencies`
để cache không che mất lần chạy lại (liên quan I9).

Đây là hướng đúng hơn codegen: như doc lập luận, đây là quy ước chuỗi chứ không phải shape đi
qua dây, nhét vào proto là bẻ cong contract. Nhưng "không codegen" ≠ "chép tay hai lần" —
SSOT ở đây là **dữ liệu test**, không phải mã.

---

## Câu hỏi 4 — Contract `session.proto`: thiếu gì cho P1

Shape hiện tại đủ cho happy-path create/claim/get/reap. Bốn thiếu sót có hậu quả thật:

### P-1. `ReapSessionRequest` không có `user_id` — thiếu object-level authz (proto:82-85)

`GetSessionRequest:73-74` có comment rất đúng: *"Bắt buộc: server kiểm object-level authz (luật 1)
chứ không tin client"*. `ClaimSessionRequest` cũng có `user_id`. **`ReapSessionRequest` thì không.**

Nghĩa là contract cho phép "biết `session_id` = xoá được session". `session_id` không phải secret
(nó nằm trong URL WebSocket `/ws/session/{id}`). Bất kỳ user nào enumerate được id là DoS được
lab của người khác.

Phản biện hợp lý: reaper là tiến trình nội bộ, không có user. Nếu vậy contract phải nói ra —
thêm `oneof actor { string user_id = 3; string system_reason = 4; }` hoặc tách hẳn
`SystemReapSession` vào một service nội bộ khác, chứ không để một RPC không-authz nằm chung
service với các RPC có authz. Hiện tại sự bất đối xứng này là im lặng.

### P-2. `CreateSession` không có idempotency key (proto:49-54)

gRPC retry (transparent retry của client, hoặc user bấm F5) → hai `CreateSession` → **hai pod**.
Với pod sandbox thì đó là tiền thật và là lỗ quota. Warm-pool càng làm nó dễ xảy ra vì create rẻ.

Thêm `string idempotency_key = 4;` (client sinh UUID, server dedupe qua Redis `SETNX`). Rẻ hơn
nhiều so với thêm sau khi apps/web đã gọi.

### P-3. Không có RPC gia hạn / heartbeat

`Session.expires_at` + `SESSION_TTL=1h`, nhưng không có `ExtendSession`/`Heartbeat`. Hệ quả: một
learner đang gõ lệnh ở phút thứ 59 sẽ bị reap giữa chừng. Hoặc bạn phải nhét việc gia hạn vào
đường WS (ngoài contract) — tức là seam Next↔Go bị rò ra một kênh thứ hai không được contract
mô tả, đúng thứ mà file này tồn tại để ngăn.

Cũng thiếu `ListSessions` (admin/ops cần "ai đang chạy gì") — nhưng cái này có thể để P2.

### P-4. Bẫy enum: `*_UNSPECIFIED = 0` ở một field bảo mật

`CreateSessionRequest.tier` không set → proto3 trả `SANDBOX_TIER_UNSPECIFIED`. Không có chỗ nào
trong proto nói server phải làm gì với nó.

Đây là field **chọn mức cô lập sandbox**. Nếu P1 hiện thực kiểu `if tier == UNSPECIFIED { tier = SYSBOX }`
thì một client quên set field sẽ âm thầm nhận tier yếu hơn ý định — fail-open trên trục bảo mật.
Comment ngay trong proto (dòng 13) đã nói "Tier1 = Sysbox (mặc định)", tức là ý định fail-open
đã có sẵn. Nên viết rõ thành ràng buộc: *"UNSPECIFIED phải bị TỪ CHỐI bằng InvalidArgument;
client luôn set tier tường minh"* — fail-closed, giống tinh thần `wsroute.go`.

Bẫy presence khác, nhẹ hơn nhưng nên ghi vào comment:
- `ttl_seconds = 3` (int32, "0 = mặc định server"): proto3 scalar không có presence, nên **không
  phân biệt được** "không gửi" với "gửi 0". Ổn vì đã document, nhưng giá trị **âm** cũng gửi được
  và contract không nói gì → phải reject `< 0` bằng InvalidArgument. Cân nhắc
  `google.protobuf.Duration` cho đúng kiểu.
- `Session.pod_name`/`namespace`/`expires_at` rỗng khi PENDING: đã document tốt. `expires_at` là
  message nên có presence thật — tốt.
- Thiếu `created_at` trên `Session` — `sessions_audit` có `created_at`, contract thì không.
- Không có `google.protobuf.FieldMask`/version trên `Session` → mọi update ở P1 là read-modify-write
  không có optimistic locking. Với claim "phải atomic" (proto:60-61) thì nên có `int64 revision`.

---

## Câu hỏi 5 — Chất lượng test

**Test tốt, thật sự gác được hành vi:**
- `envx_test.go:24-30`, `:42-47` — gác đúng luật "errors over silent fallbacks", giá trị rác phải
  thành error chứ không rơi về default. Đây là test có giá trị.
- `logging_test.go:38-52` — kiểm level filter và reject level lạ. Thật.
- `httpx_test.go:46-55` (`TestNewObservabilityIsCallableTwice`) — gác một lỗi thiết kế cụ thể
  (global registry) với lý do viết rõ trong comment. Mẫu mực.
- `session_service_test.go:65` (`var _ orchestratorv1.SessionServiceServer = ...`) — compile-time
  gate cho contract drift. Rẻ và hiệu quả.
- `schema.test.ts:29-40` — unique index test là thật (kiểm cấu trúc migration sẽ đóng băng).

**Test vô dụng / gây hiểu nhầm:**
- `schema.test.ts:42-48` — xem I12. Tautology, gác cái không ai vi phạm, bỏ qua cái đang vi phạm.
- `wsroute_test.go:26-36` — xem M5. Hai trong ba case pass mà không chạm handler.
- `httpx_test.go:57-66` (`TestNewServerSetsTimeouts`) — chỉ assert `!= 0`, không assert giá trị
  và **không kiểm `ReadTimeout`/`WriteTimeout`** — đúng hai field là mìn WebSocket (I5). Test
  đang gác nửa vấn đề và bỏ qua nửa nguy hiểm.

**Lỗ coverage ở đường quan trọng (xếp theo mức nghiêm trọng):**

1. **`httpx.ListenAndServe` — 0 test.** Đây là hàm phức tạp nhất trong `services/shared` (select
   hai chiều, goroutine, `WithoutCancel`, buffered channel) và là nơi bug shutdown sống. Test được
   dễ: server trên `:0`, cancel ctx, assert trả nil trong < grace; và case "handler ngủ lâu hơn
   grace" → assert trả `DeadlineExceeded` (test này sẽ **phát hiện I6**).
2. **`run()` của cả hai `main.go` — 0 test.** Logic `httpDone` ở `main.go:87,95,107` là logic đã
   từng có deadlock (theo brief) và vẫn không có gì gác nó. Tách `run()` nhận `ctx` + `cfg` làm
   tham số (thay vì tự `signal.NotifyContext` bên trong) là test được cả 3 nhánh select.
3. **`store.go` — 0 test.** `SmokeRedis` có 5 nhánh lỗi. `miniredis` (thuần Go, không cần Docker)
   test được toàn bộ, kể cả nhánh `TTL <= 0`. Postgres thì cần testcontainers — chấp nhận hoãn.
4. **`rediskeys` vector không phủ ký tự hợp lệ** `-`, `_`, chữ hoa, và độ dài biên 64 (chỉ test 65
   là invalid, không test 64 là valid). Xem phần câu hỏi 3.
5. **Không có test cho `envx.Bool` và `envx.Int` đường happy-path** — `Int` chỉ có test nhánh lỗi,
   `Bool` không có test nào. Nhỏ nhưng `Bool` sẽ được dùng cho feature flag ở P1/P3 (ví dụ chốt
   reflection ở I3).
6. **Không có test nào chạm migration SQL.** `schema.test.ts` kiểm object Drizzle trong bộ nhớ, không
   kiểm `0000_massive_rogue.sql` khớp với schema. Drift giữa schema.ts và file SQL đã commit là
   im lặng cho tới lúc `drizzle-kit migrate` chạy trên DB thật.

---

## Không có finding ở các mục sau (nói thẳng thay vì bịa)

- **Deadlock/goroutine leak trong `main.go`:** đã soi cả 3 nhánh select. `grpcErr` và `httpErr`
  đều buffered(1) nên goroutine không kẹt ở nhánh không được đọc. Cờ `httpDone` chặn đúng cái
  double-read đã từng deadlock. `stop()` của `signal.NotifyContext` **có** huỷ ctx (không chỉ
  unregister handler) nên comment ở dòng 103 chính xác. Không còn đường tương tự. Vấn đề còn lại
  là I1 (GracefulStop không deadline) — treo, nhưng không phải deadlock.
- **`context.WithoutCancel` ở `httpx.go:91`:** dùng đúng. Không có bug.
- **Rò connection trong `store.go`:** không có. Cả `NewPostgres` (`pool.Close()` ở dòng 24) lẫn
  `NewRedis` (`client.Close()` ở dòng 38) đều đóng trên nhánh lỗi giữa chừng. `cmd/dbsmoke` cũng
  `defer` đóng cả hai. Sạch.
- **Exit code của `db-smoke.ts`:** `process.exitCode = 1` là đúng (cho phép flush stdout). Vấn đề
  duy nhất là I7 — process có thể không bao giờ tới lúc exit.
- **Hardcoded secret trong source:** không có. Mọi credential đi qua env; `envx.Require` /
  `requireEnv` fail-fast. `.env.example` chỉ chứa giá trị dev khớp compose, không phải secret thật.
- **`.gitignore`:** đúng. `.env` + `.env.*` + `!.env.example` hoạt động chính xác (đã xác nhận:
  `git status` thấy `.env.example`, không thấy `.env`). Không thiếu pattern nào đáng kể.
- **Container chạy root:** không. Cả hai Dockerfile `USER 65532:65532` tường minh trên
  distroless `:nonroot`, và comment giải thích vì sao khai báo lại. Đúng chuẩn.
- **Mở endpoint khi chưa có authz:** không. `wsroute.go` fail-closed 401 với lý do viết rõ, và
  có test gác. Đây là phần làm tốt nhất của P0.
- **`pnpm-workspace.yaml allowBuilds`:** đã kiểm — `allowBuilds` là key **đúng** cho pnpm 11
  (thay thế `onlyBuiltDependencies`/`ignoredBuiltDependencies` đã bị bỏ). Không phải lỗi.
- **`.golangci.yml`, eslint config, tsconfig:** không có finding. `noUncheckedIndexedAccess` +
  `exactOptionalPropertyTypes` + `verbatimModuleSyntax` là cấu hình chặt hơn mặc định — tốt.
  `gosec` + `errorlint` + `bodyclose` là bộ đúng cho Go service.

---

## Score: 7.5/10

Chất lượng nền rất tốt cho P0: fail-closed ở đúng chỗ nguy hiểm (WS authz, config bắt buộc,
RPC Unimplemented thay vì mock), comment giải thích **vì sao** chứ không mô tả **cái gì**,
distroless nonroot, named volume, không có secret trong source.

Điểm trừ tập trung ở ba chỗ: (a) một lỗ bảo mật thật ở compose (C1) đủ để hijack session qua
LAN ở P1, (b) vòng đời shutdown mới hoàn thiện một nửa (gRPC không deadline, health không lật
trạng thái) và **không có test nào chạm vào**, (c) hai "guard" tự tuyên bố mà thực ra không gác
gì — twin test vector và `schema.test.ts:42-48`. Loại (c) nguy hiểm hơn không có guard, vì nó
mua sự tự tin bằng không có gì.
