# Phase 3 — Hardening & tải (SKETCH)

**Mức chi tiết:** SKETCH · **Effort:** M · **Blocks:** production go-live · **Blocked by:** P1 (engine), P2 (feature để pentest)
> Sketch — chi tiết hóa thành detailed plan riêng khi bắt đầu P3. Đây là cổng gate trước production.

## Objective

Đưa 10 luật bảo mật (design §6) từ "đã implement" lên "đã self-pentest 0 lỗi", chứng minh chịu ≥ vài trăm session đồng thời (k6), và hoàn thiện autoscaling + observability để vận hành thật.

## Task list (sketch)

1. **Self-pentest 10 luật §6** — chạy lại kịch bản pentest của competitor (folder `secure-test-devops/`) trên hệ ta: IDOR, CORS reflect, NoSQLi (n/a — Postgres), pagination dump, payload/body-size, JWT cross-aud, refresh reuse, token-in-URL, security headers, sandbox escape + WS IDOR + metadata. Mục tiêu **0 lỗi**.
2. **k6 load test** — ramp tới vài trăm session đồng thời: claim latency p95 < 1s, WS ổn định, reaper theo kịp, không rò pod. Điều chỉnh `POOL_TARGET`, LB idle-timeout, gateway replica.
3. **NetworkPolicy đầy đủ** — default-deny hoàn chỉnh: chặn lateral pod↔pod, chặn `169.254.169.254`, chỉ mở egress cần thiết (DNS, registry qua proxy). Test từng chiều.
4. **Autoscaling** — **`cluster-autoscaler` (cloud-agnostic, đã chốt — không Karpenter/không khóa AWS)** trên node pool lab tainted (spot); scale-to-zero off-peak; cap session/user; ResourceQuota/namespace. Helm + IaC trung lập nhà cung cấp, chạy được AWS/GCP/Azure/bare-metal.
5. **WS scale layer** — session-affinity ở Traefik, WS ping/idle tune, gateway scale ngang (đã stateless từ P1), session→pod ở Redis.
6. **Rate limit + body-size ở Ingress** (luật 5 đầy đủ) — Traefik middleware, không chỉ ở Next.
   - **Ghi nhận từ U2 (2026-08-09, Next 16 proxy.ts chạy Node runtime):** server Next TỰ ĐẶT `x-forwarded-for` = IP socket peer khi client không gửi header, nhưng client gửi sẵn XFF thì đi qua NGUYÊN VẸN (đo thật bằng curl). Vậy XFF vẫn giả mạo được nếu Traefik không strip/ghi đè ở biên. Khi làm task này: cấu hình Traefik ghi đè XFF từ socket thật, RỒI mới bật `RATE_LIMIT_TRUST_PROXY=1` cho web — logic `clientKey()` trong `apps/web/src/proxy.ts` giữ nguyên, không cần sửa code.
7. **Observability** — Prometheus + Grafana dashboard (claim latency, WS active, pod pool, reap rate, error) + Loki log; alert cơ bản.
8. **Reaper hardening** — orphan sweep, grace period, chống rò tài nguyên khi gateway/orchestrator restart.
9. **Chi phí** — spot interruption handling, scale-to-zero, đo cost/session.

## File / dir ownership (sketch)

`infra/k8s/networkpolicy-*.yaml`, `infra/helm/platform/*` (autoscaler, quota, HPA), `infra/k6/**`, `infra/observability/**` (Prometheus/Grafana/Loki), `services/*/internal/*` (tune limit/backpressure), `secure-test-devops/` (kịch bản pentest tái dùng).

## Acceptance criteria (sketch — 10 luật là gate)

- [x] **Self-pentest §6: 0 lỗi trên cả 10 luật** (bằng chứng từng luật — design §12).
      → 3.E, 10/10 luật + **10/10 đối chứng dương ĐỎ**, 0 lỗ hổng.
- [~] k6: ~~≥ vài trăm session đồng thời~~, claim p95 < 1s, reaper dọn 100% hết hạn, 0 pod rò.
      **KHÔNG tick trọn, và đây là chỗ phải nói thẳng.** §1 của bản detailed đã hạ
      mục tiêu này về "trần thật của VM" (chốt với chủ dự án 2026-08-14) vì lab là
      **1 node / 8 vCPU / 11.6Gi**. Đo được: **N = 21 phiên đồng thời**, chặn bởi
      ResourceQuota chứ không bởi phần cứng. "Vài trăm" chưa từng được đo, và
      không đo được trên hạ tầng này. Reaper dọn 100% + 0 pod rò: **đã đóng**
      (3.C/3.F, `reaper-verify.sh` 14/14). Ngưỡng "p95 < 1s" **cố ý không gác** —
      sketch đặt nó cho "vài trăm session" trên hạ tầng khác; số ghi lại là
      p95 **9.0s** cho `session.create` đi cold path.
- [x] NetworkPolicy: mọi chiều lateral + metadata bị chặn (test script).
      → 3.B, `netpol-verify.sh` **22/22** hai vế; lỗ thật nằm ở namespace NỀN TẢNG chứ không ở sandbox.
- [ ] Autoscaler scale up/down theo tải; scale-to-zero off-peak hoạt động.
      **KHÔNG đóng, và không đóng được ở đây.** Manifest cloud-agnostic đã ship và
      qua render + `kubeconform -strict` + `--dry-run=server` (3.G), nhưng hành vi
      scale KHÔNG chứng minh được: `cluster.x-k8s.io` và `metrics.k8s.io` đều RỖNG
      trên lab, không tầng nào cấp được node. §1 đã chốt trước là **không** khẳng
      định đã scale thật. Ô này chỉ đóng được trên một cụm có node group.
- [x] Dashboard Grafana hiển thị đủ metric; alert bắn khi vượt ngưỡng.
      → 3.D, 6/6 metric có dữ liệu, alert **firing** thật.
- [x] Rate limit + body-size ở Ingress chặn đúng.
      → 3.A, kể cả ca `Transfer-Encoding: chunked` mà lớp Next thủng.

## Verify commands (sketch)

```bash
k6 run infra/k6/session-load.js --vus 300 --duration 10m
bash secure-test-devops/run-all.sh --target https://staging   # 0 lỗi
kubectl exec $POD -- curl -m3 169.254.169.254 ; echo $?        # deny
```

## Risk Assessment (P3)

| Rủi ro | Likelihood | Impact | Score | Mitigation |
|---|---|---|---|---|
| Gateway Go không chịu nổi hàng nghìn WS (design §11) | 3 | 5 | 15 | Load test sớm; profile goroutine/mem; scale ngang + affinity. |
| Self-pentest lộ lỗ hổng còn sót | 3 | 4 | 12 | Chạy đủ 10 kịch bản; fix trước go-live; không skip luật nào. |
| Spot node bị thu hồi giữa session | 3 | 3 | 9 | Interruption handler; TTL ngắn; user restart được. |

**Score 15 (WS scale)** → load test bắt buộc pass trước production.

## Timeline (P3)

| Task | Effort | Notes |
|---|---|---|
| Self-pentest 10 luật | M | Gate |
| k6 load + tune | M | Gate |
| NetworkPolicy + autoscale + observability | M | |
| **Total P3** | **M** | Chồng lấn cuối P1/P2; gate trước production |
