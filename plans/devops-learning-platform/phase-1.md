# Phase 1 — Sandbox Session Engine (MVP lõi)

**Mức chi tiết:** DETAILED · **Effort:** L · **Blocks:** P2, P3, P4 · **Blocked by:** P0
**⚠️ ĐÂY LÀ CRITICAL PATH.** 3 rủi ro high-score của toàn dự án tập trung ở đây: **Sysbox node setup**, **WS ⇄ pod-exec streaming (Go)**, **warm-pool race conditions**.

## Objective

Xây engine dùng chung cho cả 3 trụ cột: người dùng đã đăng nhập → bấm "Start" → nhận **1 sandbox pod Sysbox cô lập trong < 1s** (từ warm-pool) → mở terminal xterm.js trong trình duyệt nối vào PTY của pod qua WSS, với **per-session authz** (không ai vào được shell của người khác). Session có TTL + reaper dọn. Sandbox chạy image `images/sandbox-base` với terminal UX cao cấp.

**Định nghĩa "done" P1:** 1 user claim được pod < 1s, gõ lệnh trong terminal thật, session tự hết hạn và pod bị reap, và một user khác KHÔNG thể nối vào session đó.

## Kiến trúc luồng (P1)

```
[Start] tRPC session.create ─► orchestrator.CreateSession (gRPC)
                                  │  claim pod từ Redis pool:free (atomic)
                                  │  ghi session:{id} -> {userId, podName, ns, expiresAt} (TTL)
                                  │  replenish pool async
                                  ▼
        trả {sessionId, wsUrl, sandboxToken(aud=gateway)}
[Browser xterm.js] ── WSS /ws/session/{id} (token qua cookie/subprotocol) ─►
        terminal-gateway: verify token(aud=gateway) + authz(session.userId == token.sub)
                          ── client-go remotecommand exec vào pod (SPDY stream) ──► PTY
        resize (SIGWINCH) ⇄ WS control msg ; stdin/stdout/stderr ⇄ WS binary frames
Reaper (orchestrator): quét session:{id} hết TTL / idle → delete pod + Redis keys (idempotent)
```

## Task list

### 1.A Spike khử rủi ro (làm TRƯỚC — cổng vào phần còn lại)
1. **Spike WS⇄exec** (rủi ro #2): 1 Go binary tối thiểu nối `remotecommand.NewSPDYExecutor` tới 1 pod có sẵn, stream stdin/stdout qua 1 WS, xử lý resize. Không pool, không authz. Mục tiêu: chứng minh streaming + resize + đóng sạch hoạt động. Ghi lại gotcha (SPDY vs WebSocket exec, TTY flag).
2. **Spike claim atomic** (rủi ro #3): script Go bắn N goroutine cùng claim từ `pool:free` → chứng minh Redis atomic (Lua script hoặc `LMOVE`/`SETNX` + state) không double-claim.
3. Chỉ khi 2 spike xanh mới build phần 1.B–1.E. (HARD-GATE nội bộ P1.)

### 1.B Orchestrator — session lifecycle + warm-pool (Go, client-go)
4. Implement `CreateSession`: claim pod từ pool (atomic Redis), gán `session:{id}` với TTL (30–60' hard cap + idle), trả podName/namespace. Nếu pool rỗng → tạo pod on-demand (cold path) + log cảnh báo.
5. Implement `ClaimSession`/`GetSession`/`ReapSession` gRPC theo proto P0.
6. **Warm-pool manager**: goroutine giữ N pod `pool:free` (config `POOL_TARGET`), tạo pod Sysbox trước (image sandbox-base, `runtimeClassName: sysbox-runc`), replenish async khi claim. Pod pending gắn nhãn `pool=free`, `app=sandbox`.
7. **Reaper**: controller quét Redis (pub/sub keyspace expiry + sweep định kỳ) → xóa pod + key khi hết TTL/idle. **Idempotent** (xóa 2 lần không lỗi). Reap cả pod mồ côi (pod có mà không có session key).
8. Pod spec chuẩn (1.D security) apply cho cả warm-pool lẫn on-demand.
9. Persist audit session (created/claimed/reaped) vào Postgres qua sqlc (không phải state — chỉ audit).

### 1.C Terminal-gateway — WS ⇄ pod exec + per-session authz (Go)
10. Endpoint `WSS /ws/session/{id}`: **verify sandbox token** (JWT `aud=gateway`, ký bằng key riêng — luật 6), **per-session authz** (luật 10 & 1): tra Redis `session:{id}`, so `session.userId == token.sub`; sai/không khớp → 403 đóng WS. **id pod/session đoán được KHÔNG được là IDOR vào shell người khác.**
11. Nối pod bằng client-go `remotecommand` exec (TTY), stream stdin/stdout/stderr ⇄ WS binary frames; **resize** qua control message → `TerminalSizeQueue`.
12. **Token transport** (luật 8): nhận token qua **httpOnly cookie** hoặc **WS subprotocol header**, KHÔNG qua query string.
13. WS keepalive: ping/pong, idle-timeout → báo orchestrator cập nhật `session:{id}` lastActive (cho idle-reap). Đóng WS → không kill pod ngay (cho reconnect trong TTL).
14. **Rate/size limit** (luật 5): giới hạn kích thước frame, giới hạn số WS/user, backpressure khi client chậm.
15. Scale-ngang ready: gateway stateless, tra session→pod ở Redis (không giữ state local) → cho phép nhiều replica sau session-affinity ở Ingress.
16. `/metrics`: số WS active, exec errors, claim latency.

### 1.D Sandbox pod hardening (luật 10 — core, đầy đủ ở P3)
17. Pod spec: `runtimeClassName: sysbox-runc`, **KHÔNG privileged**, `securityContext`: `allowPrivilegeEscalation:false`, **drop ALL capabilities**, `seccompProfile: RuntimeDefault`, AppArmor annotation.
18. **KHÔNG mount `docker.sock`** (Sysbox cho docker-in-docker native, không cần host sock).
19. **Resource limits**: CPU/mem request+limit, **PID limit** (chặn fork-bomb), + `ResourceQuota`/namespace lab.
20. **NetworkPolicy default-deny** (khung ở P1, siết đủ ở P3): chặn lateral tới pod khác + **chặn cloud metadata `169.254.169.254`**.
21. Pod chạy trên **node pool lab có taint** (tách khỏi control/web); pod có toleration + nodeSelector.

### 1.E images/sandbox-base — terminal UX cao cấp (design §4b)
22. Dockerfile base (Ubuntu/Debian slim): cài `oh-my-posh`, `fastfetch`, `terminal-icons`, `eza`, `zoxide`, `fzf`, `bat`. Shell mặc định zsh (và bash sẵn).
23. Tùy chọn `pwsh` + `PSReadLine` + oh-my-posh (build arg bật/tắt để giữ image nhỏ khi không cần).
24. Nerd Font cấu hình sẵn cho oh-my-posh theme; cho user nạp **dotfiles riêng** (mount/injection an toàn, không cho ghi ngoài home).
25. Image tối ưu kích thước + layer cache; build trong CI, push registry; scan vuln (trivy) cơ bản.

### 1.F Frontend terminal (packages/terminal + apps/web)
26. `packages/terminal`: wrapper xterm.js + **WebGL addon** + truecolor 24-bit + **Nerd Font web font** + theme switch + addon copy/paste/search/weblinks; **resize đồng bộ PTY** (gửi cols/rows qua WS control).
27. `apps/web`: trang session — nút Start (gọi tRPC session.create), mở WSS tới gateway với token trong cookie, render terminal. Trạng thái loading/claim, lỗi, hết hạn.
28. Reconnect trong TTL: mất WS → thử nối lại cùng session.

## File / dir ownership

| Owner | Đường dẫn |
|---|---|
| Orchestrator | `services/orchestrator/internal/{pool,lifecycle,reaper,k8s}/**`, `.../gen/**` |
| Gateway | `services/terminal-gateway/internal/{ws,exec,authz}/**` |
| Contract (mở rộng) | `proto/orchestrator/v1/*.proto` (thêm field cho pool/tier), regen 2 đầu |
| Sandbox pod spec | `infra/k8s/pod-template-sandbox.yaml`, `infra/k8s/networkpolicy-deny.yaml`, `infra/k8s/resourcequota-lab.yaml` |
| Image | `images/sandbox-base/**` |
| FE terminal | `packages/terminal/**`, `apps/web/src/app/(session)/**` |
| Redis keys | quy ước tài liệu trong `services/orchestrator/internal/pool/keys.go` (SSOT key naming) |

**Tránh đụng file (parallel-safe):** orchestrator và gateway là 2 lane độc lập (chỉ chung `proto/` + Redis key contract — pin trước khi fan-out theo `rules/contract-first-integration.md`). `packages/terminal` (FE) độc lập lane thứ 3. Redis key naming là file chung → 1 owner khai báo trước.

## Dependencies

- **Blocks:** P2 (Lessons cần terminal + engine), P3 (hardening + load test), P4.
- **Blocked by:** P0 (proto contract, Sysbox proof, skeleton services, auth).
- **Nội bộ:** 1.A (spike) là HARD-GATE trước 1.B–1.F. 1.E (image) cần trước khi warm-pool tạo pod thật. Contract Redis-key + gRPC pin trước khi orchestrator∥gateway∥FE fan-out.

## Acceptance criteria

**Chức năng (design §12):**
- [ ] User bấm Start → claim pod từ warm-pool **< 1s** (đo p95).
- [ ] Terminal xterm.js nối PTY pod: gõ `ls`, `docker run hello-world`, `fastfetch` hiển thị đúng; resize cửa sổ → PTY cập nhật (cols/rows khớp).
- [ ] Glyph oh-my-posh + terminal-icons render đầy đủ (truecolor + Nerd Font).
- [ ] Chọn được shell bash/zsh; pwsh khả dụng khi image build bật.
- [ ] Session hết TTL → reaper xóa pod + Redis key trong ≤ 1 chu kỳ quét; pod mồ côi cũng bị dọn.
- [ ] Warm-pool tự replenish về `POOL_TARGET` sau khi claim.
- [ ] Pool rỗng → cold path tạo pod on-demand (chậm hơn nhưng không lỗi), có log cảnh báo.

**Bảo mật (luật 10 — TESTABLE, đây là phase sở hữu):**
- [ ] **Per-session WS authz:** user B mở `WSS /ws/session/{id-của-A}` → **403, đóng WS** (test: đoán/brute id không vào được shell người khác — kill IDOR luật 1 & 10).
- [ ] **Token luật 8:** token chỉ qua cookie/subprotocol; `grep` không có token trong query; WS mở bằng query-token → từ chối.
- [ ] **Luật 6:** gateway từ chối token thiếu/sai `aud=gateway` hoặc hết TTL.
- [ ] Pod: `kubectl get pod -o yaml` xác nhận **không privileged**, `capabilities.drop:[ALL]`, `seccompProfile:RuntimeDefault`, **không mount docker.sock**, có PID/CPU/mem limit.
- [ ] `runtimeClassName == sysbox-runc`; root-in-pod map ra UID ≠ 0 trên host.
- [ ] **NetworkPolicy:** từ trong pod `curl http://169.254.169.254/` **timeout/deny**; ping pod session khác **deny** (test).
- [ ] **Luật 5:** frame WS quá lớn → cắt/đóng; > N WS/user → từ chối.

**Rủi ro-khử:**
- [ ] Spike WS⇄exec (1.A) xanh + ghi gotcha trước khi build gateway thật.
- [ ] Test đồng thời: N goroutine claim → **0 double-claim** (rủi ro #3 đóng).

## Verify commands

```bash
# Warm-pool + claim latency (script test đồng thời)
go test ./services/orchestrator/internal/pool/... -run TestConcurrentClaim -race   # 0 double-claim
kubectl get pods -l pool=free                                                       # thấy N pod warm

# Per-session authz (IDOR test)
# user A tạo session -> lấy id; user B token thử nối:
wscat -c "wss://host/ws/session/$SID_A" -H "Cookie: session=$TOKEN_B"   # kỳ vọng 403/close

# Pod hardening
kubectl get pod $POD -o jsonpath='{.spec.containers[0].securityContext}'   # drop ALL, no priv
kubectl get pod $POD -o jsonpath='{.spec.runtimeClassName}'                 # sysbox-runc
kubectl exec $POD -- cat /proc/self/uid_map                                 # host uid != 0
kubectl exec $POD -- curl -m 3 http://169.254.169.254/ ; echo "exit=$?"     # deny/timeout
kubectl exec $POD -- sh -c 'ls /var/run/docker.sock' 2>&1                   # No such file

# Reaper
# đặt TTL ngắn, chờ, kiểm pod + key biến mất
kubectl get pod $POD ; redis-cli exists session:$SID    # cả hai => gone

# Terminal render (thủ công): mở /session, chạy fastfetch + eza --icons
```

## Risk Assessment (P1)

| Rủi ro | Likelihood | Impact | Score | Mitigation |
|---|---|---|---|---|
| **WS ⇄ pod-exec streaming (Go)** — SPDY exec, TTY resize, đóng stream, backpressure sai | 4 | 5 | **20** | Spike 1.A TRƯỚC; dùng client-go `remotecommand` (đường chính chủ); e2e 1 session ổn rồi mới scale; test resize + đóng sạch. |
| **Sysbox pod tạo động fail** (image, runtimeclass, node taint) | 4 | 5 | **20** | Dựa trên proof P0.F; warm-pool tạo trước để lỗi lộ sớm; log rõ; cold-path fallback không nuốt lỗi. |
| **Warm-pool race** — double-claim, replenish thừa/thiếu | 4 | 4 | **16** | Redis atomic (Lua/`LMOVE`); state machine free→claimed→active; test đua có `-race`; reaper idempotent. |
| Per-session authz sai → IDOR vào shell người khác | 3 | 5 | 15 | Authz kiểm `session.userId==token.sub` server-side; test brute id; token `aud=gateway`. |
| Reaper xóa nhầm pod đang active (idle-detect sai) | 3 | 4 | 12 | lastActive cập nhật từ WS ping; grace period; TTL cứng tách idle-timeout; idempotent. |
| Gateway không scale ngang (state local) | 2 | 4 | 8 | Gateway stateless, session→pod ở Redis; session-affinity ở Ingress (P3). |

**3 score ≥ 15 (WS-exec, Sysbox-dynamic, race)** → mitigation (spike 1.A + P0 proof + atomic claim test) BẮT BUỘC pass trước khi coi P1 done và mở P2.

## Timeline (P1)

| Task nhóm | Effort | Notes |
|---|---|---|
| 1.A Spike khử rủi ro | M | **Cổng vào** — làm trước |
| 1.B Orchestrator pool+lifecycle+reaper | L | Đường găng |
| 1.C Gateway WS⇄exec + authz | L | Đường găng (song song 1.B, chung proto/Redis contract) |
| 1.D Pod hardening core | M | Chồng vào 1.B |
| 1.E sandbox-base image | M | Cần trước warm-pool thật |
| 1.F FE terminal | M | Lane song song thứ 3 |
| **Total P1** | **L** | Critical path: 1.A → (1.B ∥ 1.C ∥ 1.F) với 1.D/1.E hỗ trợ |
