#!/usr/bin/env bash
#
# Stack quan sát: Prometheus + Grafana + Alertmanager + Loki + promtail (P3/3.D).
#
# VÌ SAO LÀ SCRIPT HOST, KHÔNG NHÉT VÀO CHART `platform`:
# stack quan sát phải sống LÂU HƠN release ứng dụng. `helm uninstall platform`
# mà kéo theo Prometheus nghĩa là đúng lúc gỡ ứng dụng để chẩn đoán là lúc mất
# hết số liệu để chẩn đoán. Cùng lý lẽ đã dùng cho Traefik (07) và local-path (05).
#
# VÌ SAO 10 CHỨ KHÔNG PHẢI 09: 3.B đã chiếm 09 (09-networkpolicy.sh). Plan
# §3.D còn ghi "09-observability.sh" vì nó được viết trước 3.B.
#
# VÌ SAO GHIM CẢ VERSION LẪN SHA256: `--version` giải quyết tính TÁI LẬP,
# digest giải quyết tính TOÀN VẸN. Cùng khuôn 07-ingress-controller.sh.
# Digest lấy từ chính index của repo và đã đối chiếu 2026-08-15:
#   curl -s https://prometheus-community.github.io/helm-charts/index.yaml
#   curl -s https://grafana.github.io/helm-charts/index.yaml
#
# Idempotent: chạy lại nhiều lần an toàn (`helm upgrade --install`).
#
# Dùng:  bash 10-observability.sh
#        GRAFANA_ADMIN_PASSWORD=... bash 10-observability.sh
#        SKIP_LOGS=1 bash 10-observability.sh      # bỏ Loki/promtail nếu chật RAM

set -euo pipefail
cd "$(dirname "$0")"

KPS_CHART_VERSION="${KPS_CHART_VERSION:-88.3.0}" # appVersion v0.93.0
KPS_CHART_SHA256="${KPS_CHART_SHA256:-5609de52e7af33792e6c6678b9443cacaec0cd81feacc956f6da0209a7463cba}"
LOKI_CHART_VERSION="${LOKI_CHART_VERSION:-7.3.0}"
LOKI_CHART_SHA256="${LOKI_CHART_SHA256:-04a339f712d770a1f599f05fc0a5a3cde18e43914e49ae6a49f7171be86bcc09}"
PROMTAIL_CHART_VERSION="${PROMTAIL_CHART_VERSION:-6.17.1}"
PROMTAIL_CHART_SHA256="${PROMTAIL_CHART_SHA256:-12115103a3b94932473fb3873aa670a68da9504e2f323c03790257088b479d9f}"

MON_NAMESPACE="${MON_NAMESPACE:-monitoring}"
SKIP_LOGS="${SKIP_LOGS:-0}"
# Mặc định KHÔNG ghim mật khẩu trong git. Không đặt biến ⇒ dùng mặc định của
# chart và script in cảnh báo + lệnh đọc mật khẩu đã sinh.
GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-}"

OBS_DIR="../observability"

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }

# ── AC-D5: ngân sách RAM. Đo TRƯỚC, in ra, đo lại ở cuối. ────────────────────
# Ô AC đòi "ghi số đo trước/sau"; để script tự đo thì con số không phụ thuộc
# việc người chạy có nhớ đo hay không.
step "RAM trước khi cài (AC-D5)"
free -m | awk 'NR<=2'
mem_before="$(free -m | awk '/^Mem:/ {print $7}')"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

pull_verify() { # $1=repo/chart  $2=version  $3=sha256  → in ra đường dẫn tgz
  local ref="$1" ver="$2" want="$3" name tgz
  name="${ref#*/}"
  helm pull "$ref" --version "$ver" --destination "$work" >/dev/null
  tgz="$work/${name}-${ver}.tgz"
  echo "${want}  ${tgz}" | sha256sum -c - >/dev/null \
    || {
      echo "CHECKSUM KHÔNG KHỚP cho ${ref} ${ver} — chart đã đổi kể từ lần ghim. DỪNG."
      exit 1
    }
  echo "$tgz"
}

step "Thêm repo Helm"
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null
helm repo add grafana https://grafana.github.io/helm-charts >/dev/null
helm repo update prometheus-community grafana >/dev/null

step "Tải chart + đối chiếu sha256"
kps_tgz="$(pull_verify prometheus-community/kube-prometheus-stack "$KPS_CHART_VERSION" "$KPS_CHART_SHA256")"
echo "  OK  kube-prometheus-stack ${KPS_CHART_VERSION}"
if [ "$SKIP_LOGS" != "1" ]; then
  loki_tgz="$(pull_verify grafana/loki "$LOKI_CHART_VERSION" "$LOKI_CHART_SHA256")"
  echo "  OK  loki ${LOKI_CHART_VERSION}"
  promtail_tgz="$(pull_verify grafana/promtail "$PROMTAIL_CHART_VERSION" "$PROMTAIL_CHART_SHA256")"
  echo "  OK  promtail ${PROMTAIL_CHART_VERSION}"
fi

# ── Dashboard: ConfigMap sinh TỪ FILE trong repo ────────────────────────────
# Cấu hình dashboard bằng tay trong UI Grafana là trạng thái ẩn: nó sống trong
# PVC, không ai review được, và bốc hơi khi dựng lại cụm.
step "Tạo namespace + ConfigMap dashboard"
kubectl create namespace "$MON_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$MON_NAMESPACE" create configmap dlp-dashboard \
  --from-file=dlp-platform.json="${OBS_DIR}/dashboard-dlp.json" \
  --dry-run=client -o yaml | kubectl apply -f -
# Nhãn này là thứ sidecar của Grafana tìm. Thiếu nó thì ConfigMap tồn tại,
# Grafana chạy, và dashboard đơn giản là KHÔNG xuất hiện — không có gì đỏ.
kubectl -n "$MON_NAMESPACE" label configmap dlp-dashboard grafana_dashboard=1 --overwrite

step "Cài kube-prometheus-stack"
kps_args=(
  helm upgrade --install kps "$kps_tgz"
  --namespace "$MON_NAMESPACE" --create-namespace
  -f "${OBS_DIR}/values-kube-prometheus-stack.yaml"
  --wait --timeout 10m
)
if [ -n "$GRAFANA_ADMIN_PASSWORD" ]; then
  kps_args+=(--set "grafana.adminPassword=${GRAFANA_ADMIN_PASSWORD}")
fi
"${kps_args[@]}"

if [ "$SKIP_LOGS" != "1" ]; then
  step "Cài Loki (SingleBinary) + promtail"
  helm upgrade --install loki "$loki_tgz" \
    --namespace "$MON_NAMESPACE" \
    -f "${OBS_DIR}/values-loki.yaml" \
    --wait --timeout 10m
  helm upgrade --install promtail "$promtail_tgz" \
    --namespace "$MON_NAMESPACE" \
    -f "${OBS_DIR}/values-promtail.yaml" \
    --wait --timeout 5m
else
  printf '\033[1;33mSKIP_LOGS=1 — bỏ Loki/promtail. Ô AC-D3 KHÔNG đóng được lượt này.\033[0m\n'
fi

step "Áp PodMonitor / ServiceMonitor / PrometheusRule"
kubectl apply -f "${OBS_DIR}/monitors.yaml"
kubectl apply -f "${OBS_DIR}/alerts.yaml"

# ── Khẳng định trên ĐỐI TƯỢNG SỐNG ──────────────────────────────────────────
# `helm get values` chỉ xác nhận "thứ tôi đã gõ", không xác nhận "thứ cụm đang
# có" — một `--set` sai khoá được Helm nhận trong im lặng (đã dính ở 2.G và 3.A).
# Nên mọi khẳng định dưới đây đọc từ đối tượng thật.
step "Khẳng định trên đối tượng sống"

for kind_name in podmonitor/dlp-gateway servicemonitor/dlp-orchestrator podmonitor/dlp-traefik prometheusrule/dlp-platform; do
  kubectl -n "$MON_NAMESPACE" get "$kind_name" >/dev/null 2>&1 \
    || {
      echo "THIẾU ${kind_name} — Prometheus sẽ không có đích để scrape."
      exit 1
    }
  echo "  OK  ${kind_name}"
done

# Dashboard đã được sidecar nạp chưa: kiểm NHÃN, vì đó là điều kiện thật.
if [ "$(kubectl -n "$MON_NAMESPACE" get configmap dlp-dashboard \
  -o jsonpath='{.metadata.labels.grafana_dashboard}')" != "1" ]; then
  echo "ConfigMap dlp-dashboard thiếu nhãn grafana_dashboard=1 — Grafana sẽ KHÔNG nạp nó, và không có gì báo."
  exit 1
fi
echo "  OK  configmap dlp-dashboard có nhãn grafana_dashboard=1"

step "RAM sau khi cài (AC-D5)"
free -m | awk 'NR<=2'
mem_after="$(free -m | awk '/^Mem:/ {print $7}')"
printf 'available: %s MB → %s MB  (chênh %s MB)\n' \
  "$mem_before" "$mem_after" "$((mem_before - mem_after))"

printf '\n\033[1;32mStack quan sát đã cài.\033[0m\n'
printf 'BƯỚC TIẾP THEO BẮT BUỘC nếu NetworkPolicy nền tảng đang bật:\n'
printf '  chiều scrape mặc định BỊ CHẶN. Bật rồi nâng cấp release platform:\n'
printf '    --set networkPolicy.platform.metricsScrape.enabled=true \\\n'
printf '    --set networkPolicy.platform.metricsScrape.namespace=%s\n' "$MON_NAMESPACE"
printf '  Không làm bước này thì target hiện ra nhưng up==0, và nó đọc y hệt "app chưa chạy".\n\n'
printf 'Kiểm nhanh (chạy TRƯỚC khi mở chiều scrape để có baseline, rồi chạy lại SAU):\n'
printf '  python3 ../observability/verify_observability.py --baseline\n'
printf '  python3 ../observability/verify_observability.py\n\n'
