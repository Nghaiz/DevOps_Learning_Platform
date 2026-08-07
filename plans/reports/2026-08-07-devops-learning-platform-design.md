# DevOps Learning Platform — Bản thiết kế nền móng (System Design)

**Ngày:** 2026-08-07 · **Loại:** NCKH · **Trạng thái:** Đã duyệt (brainstorm → design)
**Nguồn tham chiếu kiến trúc + bài học bảo mật:** pentest `devops.toiyeuptit.com` (folder `secure-test-devops/`)

---

## 1. Problem statement & yêu cầu

Xây nền tảng học–thực hành DevOps tự host, chịu tải cao (hàng trăm+ user đồng thời), gồm 3 trụ cột dùng chung 1 engine:

- **① Lessons** (kiểu KillerCoda): bài markdown từng bước + terminal nhúng vào container thật. **← MVP đầu tiên.**
- **② Labs/Playground** (kiểu KodeKloud): môi trường thật (K8s/Docker/Linux) + chấm điểm task.
- **③ Games** (kiểu k8sgames): game tương tác trên trình duyệt, phần lớn frontend-only (0 backend) + CTF tái dùng engine ②.

**Ràng buộc:** KHÔNG Java/Spring Boot. Ưu tiên best-of-breed từng thành phần (polyglot Go + Next.js OK). Terminal cao cấp custom được (oh-my-posh, fastfetch, terminal-icons, PSReadLine). Deploy được cả k3s self-host lẫn cloud.

## 2. Kết quả research (đã verify)

Cả KillerCoda/KodeKloud/Katacoda hội tụ 1 blueprint: **1 sandbox ephemeral cô lập / session + xterm.js ⇄ WebSocket ⇄ PTY trong sandbox + engine chấm task.** Nền tảng đã pentest (K8s + Sysbox pod/session + xterm.js → `/ws/pod-logs` root shell) **chính là pattern KodeKloud-class chuẩn**; điểm yếu của họ là cấu hình bảo mật, không phải pattern.

- KillerCoda: per-session container trong namespace cô lập + NetworkPolicy + autoscale. "Firecracker" **chưa xác nhận** (tin đồn).
- KodeKloud: Sysbox (`sysbox-runc`) pod/session trên EKS + warm-pool (khớp với phát hiện pentest — 2 nguồn độc lập trùng khớp).
- SadServers: Firecracker microVM/scenario (đầu isolation mạnh nhất).

## 3. Kiến trúc tổng thể

```
Browser (Next.js + xterm.js)
   │ WSS (terminal stream, per-session token)
   ▼
Ingress (Traefik, WS session-affinity)
   ├─► apps/web (Next.js: UI + BFF tRPC + Better Auth) ─► PostgreSQL, Redis
   ├─► services/orchestrator (Go, client-go) ──► K8s API (create/claim/reap pod)
   └─► services/terminal-gateway (Go) ── WS ⇄ pod exec ── validation scripts
                                          Lab Pod (Sysbox) · taint spot node · quota · NetworkPolicy deny-all
```

## 4. Tech stack (best-of-breed, polyglot)

Nguyên tắc: **Go cho hạ tầng nặng** (K8s client-go + streaming nhiều WS long-lived); **TS/Next.js cho lớp sản phẩm** (velocity + type-safety end-to-end).

| Layer | Chọn | Lý do |
|---|---|---|
| Monorepo | Turborepo + pnpm (TS) ⊕ Go workspace | 1 repo, build song song, cache |
| Frontend | Next.js 15 (App Router, RSC) + TS | SSR/ISR nội dung, streaming UI |
| Terminal client | xterm.js + WebGL addon + Nerd Font + truecolor + theme | glyph powerline/icon (§4b) |
| BFF/API sản phẩm | Next.js route handlers + tRPC | type-safe với FE; content/user/progress/scoring |
| Auth | **Better Auth** (TS) | JWT có `aud` riêng từng service, OAuth Google/Microsoft, 2FA, RBAC |
| Lab Orchestrator | **Go + client-go** (gRPC nội bộ) | client-go chính chủ; pool/reaper/lifecycle |
| Terminal Gateway | **Go** (WS ⇄ pod-exec SPDY) | goroutine cho hàng nghìn WS — đúng chỗ Go thắng Node |
| Contract | Protobuf/gRPC + OpenAPI, codegen TS+Go | contract-first Next↔Go |
| DB | PostgreSQL — Drizzle (TS) + pgx/sqlc (Go) | bỏ Mongo ⇒ diệt NoSQLi |
| Cache/State | Redis | warm-pool, session→pod, TTL, pub/sub reaper |
| Content | Katacoda/Killercoda md + index.json parser (TS) | kế thừa kho nội dung OSS |
| Sandbox | K8s + **Sysbox** (tier1) · **gVisor/Kata** (tier2) | §5 |
| Đóng gói | **Helm** (k3s self-host + cloud node pool) | chạy cả hai |
| Observability | Prometheus + Grafana + Loki | đo tải, debug session |

### 4b. Terminal UX cao cấp
- **Client (xterm.js):** WebGL + truecolor 24-bit + Nerd Font web font + theme switch + copy/paste/search/link addon + resize đồng bộ PTY.
- **Sandbox image (`images/sandbox-base`):** oh-my-posh + fastfetch + terminal-icons + eza + zoxide + fzf + bat; shell mặc định zsh/bash; **cho chọn pwsh + PSReadLine + oh-my-posh**; cho user nạp dotfiles riêng.

## 5. Cô lập sandbox (vấn đề #1)

Root-trong-container KHÔNG được = root-trên-host. Pod K8s thường không cho điều đó.

| Cách | An toàn root không tin cậy | Overhead | Docker/kind bên trong | Phức tạp |
|---|---|---|---|---|
| Pod thường/privileged | ✗ Nguy hiểm | ~0 | Có (privileged) | Thấp |
| **Sysbox** ⭐ tier1 | ✓ Tốt (user-ns remap, unprivileged) | Rất thấp | Có, native | Trung bình |
| gVisor tier2 | ✓✓ Mạnh (user-space kernel) | Vừa | Hạn chế | Trung bình |
| Kata/Firecracker tier2 | ✓✓✓ Mạnh nhất (VM+KVM) | Cao | Có | Cao |

**Khuyến nghị:** Tier1 = K8s+Sysbox cho hầu hết lab; Tier2 = gVisor RuntimeClass (nhẹ) / Kata (mạnh) cho lab CTF "phá hộp". Sysbox cần cài runtime lên node ⇒ self-managed node pool (k3s hoặc node pool tự quản), không dùng GKE Autopilot.

## 6. Baseline bảo mật — 10 luật rút từ pentest (yêu cầu BẮT BUỘC)

| Lỗi target | Luật của ta |
|---|---|
| IDOR `PATCH /users/{id}` | Object-level authz mọi resource, server-side |
| CORS reflect mọi origin+cred | Allowlist origin chính xác, không reflect, không `Allow-Credentials:*` |
| NoSQL injection `$ne` | Postgres + validate/cast input Zod (diệt gốc) |
| `size=1000000` dump user | Pagination cap cứng (max 100) server-side |
| Payload 10MB → 502 | Body-size limit + rate limit gateway |
| JWT dùng chéo subdomain | JWT có `aud`, key ký riêng, TTL ngắn + refresh rotation |
| Refresh nhận access token | Refresh token riêng, xoay vòng, revocation list |
| Token trong URL | Token chỉ trong cookie httpOnly/POST body |
| Thiếu security headers | HSTS/CSP/X-Frame-Options/X-Content-Type-Options (helmet) |
| Root escape + lộ docker.sock | Sysbox + drop caps + seccomp/AppArmor + NetworkPolicy deny-all + KHÔNG mount docker.sock + chặn metadata 169.254.169.254 + authz per-session trên WS (id pod đoán được = IDOR vào shell người khác) |

## 7. Chịu tải cao

1. **Pre-warmed pool** — giữ N sandbox sẵn, claim sub-second, replenish async.
2. **TTL + reaper** — tuổi thọ cứng 30–60' + idle timeout, controller dọn hết hạn.
3. **Resource quota** — CPU/mem/PID/pod + ResourceQuota/namespace (chặn fork-bomb).
4. **Autoscaling** — Karpenter/cluster-autoscaler, node pool riêng có taint cho lab.
5. **Chi phí** — spot cho lab node, scale-to-zero off-peak, cap session/user; đẩy tối đa sang game frontend-only (0 backend).
6. **WS layer** — session-affinity, tune LB idle-timeout, WS ping, map session→pod ở Redis, scale ngang gateway.

## 8. Cấu trúc repo

```
apps/web/                  Next.js (UI + BFF tRPC + Better Auth)
services/orchestrator/     Go — client-go, warm-pool, reaper, lifecycle
services/terminal-gateway/ Go — WS ⇄ pod exec, per-session authz
packages/shared-types/     TS DTO + Zod
packages/scenario/         TS parser Katacoda md+index.json
packages/ui/               shadcn components
packages/terminal/         xterm.js wrapper (WebGL, Nerd Font, themes)
proto/                     protobuf gRPC (codegen TS+Go)
images/sandbox-base/       Dockerfile: oh-my-posh, fastfetch, eza, pwsh+PSReadLine
infra/helm · infra/k8s/    Sysbox RuntimeClass, gVisor, NetworkPolicy, quotas
```

## 9. Mã nguồn mở tái dùng (đã verify license, 2026-08-07)

| Project | License | Vai trò |
|---|---|---|
| xterm.js | MIT | terminal emulator |
| ttyd | MIT | PTY bridge (nếu chọn) |
| Sysbox (nestybox) | Apache-2.0 | sandbox tier1 |
| gVisor | Apache-2.0 | sandbox tier2 nhẹ |
| Kata Containers | Apache-2.0 | sandbox tier2 mạnh |
| vcluster / kind / k3s | Apache-2.0 | K8s trong lab / cụm nhẹ |
| Play-with-Docker | MIT | tham khảo Go session mgmt |
| killercoda scenario-examples / grafana killercoda | — | kho nội dung + format |
| k8sgames | Apache-2.0 | mẫu game frontend-only |

**Tránh:** gotty (bỏ hoang 2024-08 → dùng ttyd); giả định iximiuz Labs/SadServers là OSS self-host (không phải, chỉ tham khảo format).

## 10. Lộ trình

- **P0 Nền móng** (2–3 tuần): monorepo, Postgres+Redis, Next.js + Better Auth, skeleton Go services, CI/CD, k3s + Sysbox 1 node, proto contract.
- **P1 Sandbox Engine (MVP lõi):** orchestrator create/claim/reap pod Sysbox, terminal-gateway WS ⇄ pod PTY, per-session authz, warm-pool nhỏ, sandbox-base image (§4b).
- **P2 Lessons:** parser Katacoda md+index.json, UI split-pane (nội dung|terminal), step nav, validation script.
- **P3 Hardening & tải:** 10 luật §6, k6 load test, reaper, autoscaling, NetworkPolicy, observability.
- **P4 Labs (②):** chấm điểm task, K8s trong pod (kind/vcluster).
- **Song song Games (③):** nhánh frontend-only kiểu k8sgames.

## 11. Rủi ro & giả định

- Sysbox trên managed K8s cần node tự quản (không Autopilot) — đã chốt Helm cho cả hai.
- KillerCoda substrate chưa công bố chính thức; ta dùng pattern Sysbox (2 nguồn corroborate).
- Terminal-gateway Go phải chịu hàng nghìn WS — cần load test sớm ở P3.
- Polyglot ⇒ contract-first (proto/OpenAPI) là bắt buộc để Next↔Go không lệch shape.

## 12. Metrics thành công

- Session claim < 1s (warm-pool); reaper dọn 100% session hết hạn.
- 0 lỗi trong 10 luật bảo mật §6 khi self-pentest lại.
- Chịu ≥ vài trăm session đồng thời trong k6 load test.
- Terminal render đầy đủ glyph oh-my-posh/icons; chọn được bash/zsh/pwsh.
