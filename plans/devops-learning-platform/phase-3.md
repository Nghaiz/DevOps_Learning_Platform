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
7. **Observability** — Prometheus + Grafana dashboard (claim latency, WS active, pod pool, reap rate, error) + Loki log; alert cơ bản.
8. **Reaper hardening** — orphan sweep, grace period, chống rò tài nguyên khi gateway/orchestrator restart.
9. **Chi phí** — spot interruption handling, scale-to-zero, đo cost/session.

## File / dir ownership (sketch)

`infra/k8s/networkpolicy-*.yaml`, `infra/helm/platform/*` (autoscaler, quota, HPA), `infra/k6/**`, `infra/observability/**` (Prometheus/Grafana/Loki), `services/*/internal/*` (tune limit/backpressure), `secure-test-devops/` (kịch bản pentest tái dùng).

## Acceptance criteria (sketch — 10 luật là gate)

- [ ] **Self-pentest §6: 0 lỗi trên cả 10 luật** (bằng chứng từng luật — design §12).
- [ ] k6: ≥ vài trăm session đồng thời, claim p95 < 1s, reaper dọn 100% hết hạn, 0 pod rò.
- [ ] NetworkPolicy: mọi chiều lateral + metadata bị chặn (test script).
- [ ] Autoscaler scale up/down theo tải; scale-to-zero off-peak hoạt động.
- [ ] Dashboard Grafana hiển thị đủ metric; alert bắn khi vượt ngưỡng.
- [ ] Rate limit + body-size ở Ingress chặn đúng.

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
