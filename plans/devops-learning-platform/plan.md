# Kế hoạch triển khai — DevOps Learning Platform

**Ngày:** 2026-08-07 · **Loại:** NCKH · **Trạng thái:** Design đã duyệt → chuyển thành plan hành động
**Nguồn thiết kế (SSOT):** `plans/reports/2026-08-07-devops-learning-platform-design.md`
**Blueprint hình ảnh (tham khảo):** `plans/reports/blueprint.html`

> Plan này KHÔNG brainstorm lại. Stack đã chốt (design §4). Mọi quyết định kỹ thuật lấy từ design doc; nếu có mục thực sự chưa chốt → liệt kê ở cuối ("Cần hỏi user"), không tự quyết.

---

## 1. Mục tiêu (Goals)

Xây nền tảng học–thực hành DevOps tự host, chịu tải **hàng trăm+ session đồng thời**, 3 trụ cột dùng chung **1 sandbox engine**:

- **① Lessons** (KillerCoda-style) — **MVP đầu tiên** (P2).
- **② Labs/Playground** (KodeKloud-style) — P4.
- **③ Games** (k8sgames-style, frontend-only + CTF tái dùng engine) — P4 song song.

**Định nghĩa "done" của toàn dự án (design §12):**
1. Session claim < 1s nhờ warm-pool; reaper dọn 100% session hết hạn.
2. 0 lỗi trên **10 luật bảo mật** (design §6) khi self-pentest lại.
3. Chịu ≥ vài trăm session đồng thời trong k6 load test (P3).
4. Terminal render đầy đủ glyph oh-my-posh/icons; chọn được bash/zsh/pwsh.

## 2. Kiến trúc tóm tắt (Architecture recap)

```
Browser (Next.js 15 RSC + xterm.js WebGL)
   │ tRPC (HTTPS)            │ WSS (terminal stream, per-session token)
   ▼                         ▼
Ingress (Traefik — WS session-affinity, body-size + rate limit)
   ├─► apps/web (Next.js: UI + BFF tRPC + Better Auth) ─► PostgreSQL (Drizzle), Redis
   ├─► services/orchestrator (Go + client-go, gRPC nội bộ) ──► K8s API: create/claim/reap pod
   │        └─ warm-pool manager · TTL+reaper · session lifecycle
   └─► services/terminal-gateway (Go) ── WS ⇄ pod exec (SPDY) ── per-session authz
                                          Lab Pod (Sysbox tier1 / gVisor|Kata tier2)
                                          · taint spot node · quota · NetworkPolicy deny-all
```

**Nguyên tắc phân vai:** Go cho hạ tầng nặng (client-go + hàng nghìn WS long-lived); TS/Next.js cho lớp sản phẩm (velocity + type-safety end-to-end). **Seam giữa Next.js ↔ Go là contract-first** (protobuf/gRPC + OpenAPI, codegen cả TS lẫn Go) — BẮT BUỘC theo `rules/contract-first-integration.md`.

### Cấu trúc monorepo (design §8 — SSOT, không đổi)

```
apps/web/                  Next.js (UI + BFF tRPC + Better Auth)
services/orchestrator/     Go — client-go, warm-pool, reaper, lifecycle, gRPC server
services/terminal-gateway/ Go — WS ⇄ pod exec, per-session authz
packages/shared-types/     TS DTO + Zod (+ generated types từ proto/OpenAPI)
packages/scenario/         TS parser Katacoda md + index.json
packages/ui/               shadcn/ui components
packages/terminal/         xterm.js wrapper (WebGL, Nerd Font, themes)
proto/                     protobuf gRPC (codegen TS + Go) — contract SSOT
images/sandbox-base/       Dockerfile: oh-my-posh, fastfetch, eza, pwsh+PSReadLine...
infra/helm/ · infra/k8s/   Helm charts + Sysbox RuntimeClass, gVisor, NetworkPolicy, quotas
```

## 3. Chỉ mục phase (Phase index)

| Phase | Tên | Mức chi tiết | Kết quả chính | File |
|---|---|---|---|---|
| **P0** | Nền móng | DETAILED | Monorepo build được, Postgres+Redis, Next.js+Better Auth login, skeleton 2 Go service, CI/CD, **kubeadm 1-node (K8s v1.34) + Sysbox**, proto contract v0 | `phase-0.md` |
| **P1** | Sandbox Session Engine (MVP lõi) | DETAILED | create/claim/reap pod Sysbox, terminal-gateway WS⇄PTY, per-session authz, warm-pool nhỏ, sandbox-base image | `phase-1.md` |
| **P2** | Lessons pillar | DETAILED | parser Katacoda, UI split-pane (nội dung\|terminal), step nav, validation script | `phase-2.md` |
| **P3** | Hardening & tải | SKETCH | 10 luật §6 self-pentest, k6 load test, autoscaling, NetworkPolicy, observability | `phase-3.md` |
| **P4** | Labs ② + Games ③ | SKETCH | chấm điểm task, kind/vcluster trong pod; nhánh game frontend-only | `phase-4.md` |

**Critical path:** P0 → **P1 (shared engine)** → P2. P3 hardening chạy chồng lấn cuối P1/P2. P4 sau khi engine ổn.

## 4. Mối quan tâm xuyên suốt (Cross-cutting concerns)

Áp dụng cho MỌI phase, không lặp lại chi tiết trong từng file:

- **Contract-first (BẮT BUỘC):** mọi shape dữ liệu Next↔Go định nghĩa trong `proto/` (gRPC nội bộ) hoặc OpenAPI (nếu REST), codegen ra cả TS (`packages/shared-types`) và Go trước khi code hai đầu. Không đầu nào tự chế shape. Casing, enum, envelope lỗi, null/optional pin trong proto. (`rules/contract-first-integration.md`)
- **10 luật bảo mật (design §6):** là acceptance criteria có thể test, không phải khuyến nghị. Phân bổ theo phase ở bảng §5 dưới. Rule 1–9 chủ yếu ở apps/web (P0/P2); rule 10 (sandbox) ở P1/P3.
- **SSOT & no-derived-fields:** không lưu giá trị suy ra được; session→pod map chỉ ở Redis (không nhân bản sang Postgres).
- **Errors over silent fallbacks:** provider vắng mặt (gVisor/Kata chưa cài) → warn + skip có log, không nuốt lỗi.
- **Secrets:** JWT signing keys, DB creds, OAuth secrets qua env/Secret, không hardcode; `.env.example` cho mỗi service.
- **Test pass gate:** mỗi phase chỉ "done" khi test của phase xanh + verify command chạy được.
- **Observability từ sớm:** structured logging (JSON) mọi service từ P0; Prometheus metrics endpoint từ P1.

### Phân bổ 10 luật bảo mật theo phase

| # | Luật (§6) | Phase sở hữu | Phase kiểm lại |
|---|---|---|---|
| 1 | Object-level authz mọi resource (server-side ownerId/role) | P0 (tRPC middleware) + P2 (progress) | P3 self-pentest |
| 2 | CORS allowlist origin, không reflect, không `Allow-Credentials:*` | P0 | P3 |
| 3 | Zod validate/cast mọi input, reject field lạ + Postgres | P0 (tRPC input schema) | P2, P3 |
| 4 | Pagination cap cứng max 100 server-side | P0 (shared list contract) | P3 |
| 5 | Body-size limit + rate limit ở gateway | P0 (Traefik/middleware) | P1 (WS gateway), P3 |
| 6 | JWT có `aud` per-service, key ký riêng, TTL ngắn + refresh rotation | P0 (Better Auth cfg) | P1 (gateway verify aud), P3 |
| 7 | Refresh token riêng access token, rotation + revocation list | P0 | P3 |
| 8 | Token chỉ trong httpOnly cookie / POST body, không URL/query | P0 | P1 (WS token qua cookie/subprotocol, không query) |
| 9 | Security headers (helmet): HSTS/CSP/X-Frame/X-Content-Type/Referrer/Permissions | P0 | P3 |
| 10 | Sandbox hardening (unprivileged Sysbox, drop ALL caps, seccomp+AppArmor, NetworkPolicy deny-all + chặn metadata, không docker.sock, quota, **per-session WS authz**) | **P1** (core) | P3 (đầy đủ + self-pentest) |

## 5. Rủi ro tổng thể (Risk Assessment — toàn dự án)

| Rủi ro | Likelihood (1-5) | Impact (1-5) | Score | Mitigation |
|---|---|---|---|---|
| **Sysbox node setup** phức tạp/không lên được trên node pool tự quản | 4 | 5 | **20** | **Cập nhật 2026-08-07 — Debian 13 Trixie + kubeadm + containerd 2.3.x** (thay "k3s + Ubuntu"); bằng chứng đọc từ mã nguồn `sysbox-deploy-k8s.sh`, xem design §5b. P0 dựng kubeadm 1-node **ghim K8s v1.34** (Sysbox chỉ hỗ trợ v1.32–v1.35) + daemonset `sysbox-install.yaml` sớm nhất; bộ script `infra/host/` chạy chung cho VM local lẫn cloud, **cùng distro ⇒ dev ≡ prod**; cổng `04-verify-sysbox.sh` 8/8 mới mở P1. Xem P0/P1 risk table. |
| **WS ⇄ pod-exec streaming (Go)** — SPDY stream, resize, backpressure sai | 4 | 5 | **20** | Spike WS↔exec tối thiểu ở đầu P1 trước khi build warm-pool; dùng client-go `remotecommand`; e2e test 1 session trước khi scale. |
| **Warm-pool race conditions** — 2 request claim cùng 1 pod | 4 | 4 | **16** | Redis atomic claim (Lua/`SETNX`+state machine); test đồng thời N goroutine claim; reaper idempotent. |
| Contract drift Next↔Go (polyglot) | 3 | 4 | 12 | Contract-first codegen gate trong CI; integration check sau fan-out. |
| Chi phí cloud vượt kế hoạch (nhiều pod nặng) | 3 | 3 | 9 | Spot node pool + scale-to-zero off-peak + cap session/user; đẩy game sang frontend-only. |
| Nội dung Katacoda parse lệch format | 2 | 3 | 6 | Test parser trên kho scenario-examples thật (P2). |

**Rule >= 15 = high risk** → 3 rủi ro đầu (Sysbox, WS-exec, warm-pool race) BẮT BUỘC có mitigation chạy trước khi phase phụ thuộc bắt đầu. Cả 3 tập trung ở **P1 — critical path**.

## 6. Timeline tổng thể

| Phase | Effort | Ghi chú / blocker |
|---|---|---|
| P0 Nền móng | L (2–3 tuần) | Không blocker; blocks tất cả. Sysbox node + proto contract là đường găng nội bộ. |
| P1 Engine (MVP lõi) | L | Blocked by P0. **Critical path.** 3 rủi ro high tập trung ở đây. |
| P2 Lessons | M | Blocked by P1 (cần engine + WS terminal). |
| P3 Hardening & tải | M | Chồng lấn cuối P1/P2; self-pentest cần feature P2 xong. |
| P4 Labs + Games | L | Blocked by P1 (engine). Games ③ nhánh song song ít phụ thuộc. |
| **Total** | ~XL | **Critical path: P0 → P1 → P2** (→ P3 gate trước production). |

## 7. Quyết định đã chốt (post-validation 2026-08-07)

- **Cloud target / autoscaler (P3): CLOUD-AGNOSTIC — dùng `cluster-autoscaler`** (không Karpenter, không khóa AWS). P3 giữ đa nền tảng: chạy được trên AWS/GCP/Azure self-managed node pool lẫn bare-metal/kubeadm self-host. Chọn cloud cụ thể hoãn tới khi triển khai P3; Helm chart + IaC phải trung lập nhà cung cấp. Khớp với lựa chọn "thiết kế cho cả hai" của user.

_Không còn mục nào genuinely unresolved — mọi quyết định stack/design đã khóa._
