#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# soak-run.sh — launcher cho soak.mjs (P12/12.D).
#
# Dựng port-forward tới /metrics của orchestrator (8081) và TỪNG pod gateway
# (8083 — metrics gateway KHÔNG đi qua Service, phải nhắm pod), rồi chạy soak.
#
# ⚠ Chạy từ máy NGOÀI VM (Windows), cùng lý do 12.B: đo từ trong hệ đang đo thì
# SNAT/rate-limit làm hỏng phép đo. Cần NODE_EXTRA_CA_CERTS trỏ tới CA lab để WS
# qua ingress verify được TLS.
#
# Dùng:
#   NODE_EXTRA_CA_CERTS=/path/lab-ca.crt WS_TLS_STRICT=1 \
#     bash infra/k6/soak-run.sh --n 10 --hours 2
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NS="${NS:-default}"
loi() { echo "✖ $*" >&2; exit 1; }

command -v kubectl >/dev/null || loi "không có kubectl"
[ -f "$HERE/.users.json" ] || loi "thiếu $HERE/.users.json — chạy provision-users.sh trước"

# ── Port-forward orchestrator /metrics ──────────────────────────────────────
kubectl port-forward -n "$NS" svc/platform-orchestrator 18081:8081 >/tmp/soak-pf-orch.log 2>&1 &
PF_ORCH=$!

# ── Port-forward TỪNG pod gateway trên 8083 ─────────────────────────────────
# Metrics gateway trên 8083 theo pod, không qua Service (suyRaMetricsURL đổi
# :8082→:8083). Đọc cả hai replica: leak chỉ hiện trên replica giữ socket.
mapfile -t GW_PODS < <(kubectl get pods -n "$NS" -o name 2>/dev/null | grep gateway | sed 's|pod/||')
[ "${#GW_PODS[@]}" -ge 1 ] || loi "không thấy pod gateway"
GW_URLS=()
PF_GW_PIDS=()
port=18083
for pod in "${GW_PODS[@]}"; do
  kubectl port-forward -n "$NS" "pod/$pod" "${port}:8083" >"/tmp/soak-pf-gw-${port}.log" 2>&1 &
  PF_GW_PIDS+=($!)
  GW_URLS+=("http://localhost:${port}/metrics")
  port=$((port + 10))
done

cleanup() {
  kill "$PF_ORCH" "${PF_GW_PIDS[@]}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 5
# Cổng chống-đo-mù: nếu /metrics không trả gì thì DỪNG, đừng chạy 2h rồi mới biết
# mọi mẫu là null (đúng lớp "phép đo tự nói dối").
curl -sf --max-time 5 http://localhost:18081/metrics | grep -q '^go_goroutines' \
  || loi "orchestrator /metrics không đọc được qua port-forward — soak sẽ toàn null, dừng"
echo "  orch /metrics OK; gateway metrics: ${GW_URLS[*]}"

export ORCH_METRICS="http://localhost:18081/metrics"
export GW_METRICS="$(IFS=,; echo "${GW_URLS[*]}")"
export BASE_URL="${BASE_URL:-https://dlp.192.168.94.130.sslip.io:30443}"

echo "── soak bắt đầu (Ctrl-C để dừng sạch: lấy mẫu cuối + dọn phiên)"
node "$HERE/soak.mjs" "$@"
