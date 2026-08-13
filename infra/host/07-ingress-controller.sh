#!/usr/bin/env bash
# 07-ingress-controller.sh — Traefik, controller cho Ingress GỘP ORIGIN của nền tảng.
#
# VÌ SAO CẦN: `infra/helm/platform/templates/ingress.yaml` đã tồn tại từ 1.B0.4 và
# gộp `/` (web) với `/ws` (gateway) về MỘT origin — điều kiện sống của thiết kế
# token (cookie `dlp_sandbox` host-only + SameSite=Strict). Nhưng cụm lab kubeadm
# KHÔNG có controller nào, nên `ingress.enabled=true` chỉ tạo ra một object Ingress
# không định tuyến gì cả, không báo lỗi. Script này lấp đúng khoảng đó.
#
# VÌ SAO KHÔNG NHÉT VÀO CHART `platform`: cùng lý do với 05-cluster-addons.sh —
# controller là hạ tầng cluster, sống lâu hơn vòng đời release ứng dụng.
# `helm uninstall platform` không được phép gỡ ingress controller của cluster.
#
# VÌ SAO TRAEFIK chứ không phải ingress-nginx: phase-3 §5 và §6 đã chốt Traefik
# (session-affinity cho WS, middleware rate-limit + body-size ở biên). Cài nginx
# hôm nay nghĩa là thay controller hai lần và viết lại phần đó của P3.
#
# Chạy lại được nhiều lần (`helm upgrade --install`).
#
#   bash 07-ingress-controller.sh

set -euo pipefail
cd "$(dirname "$0")"

# Ghim chart + đối chiếu sha256. `--version` giải quyết tính tái lập; digest giải
# quyết tính toàn vẹn — chart này dựng ClusterRole đọc được Secret toàn cluster.
# Cùng kỷ luật với LOCAL_PATH_SHA256 ở 05-cluster-addons.sh.
#
# digest lấy từ chính index của repo:
#   curl -s https://traefik.github.io/charts/index.yaml | grep -B12 'traefik-<ver>.tgz'
TRAEFIK_CHART_VERSION="${TRAEFIK_CHART_VERSION:-41.2.0}"   # appVersion v3.7.10
TRAEFIK_CHART_SHA256="${TRAEFIK_CHART_SHA256:-b1c5e2194b8e2c63b3db39676924b46e63bec207174673e38d4ad54d66743e68}"
TRAEFIK_NAMESPACE="${TRAEFIK_NAMESPACE:-traefik}"

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }

step "Tải chart traefik ${TRAEFIK_CHART_VERSION} và đối chiếu sha256"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
helm repo add traefik https://traefik.github.io/charts >/dev/null
helm repo update traefik >/dev/null
helm pull traefik/traefik --version "$TRAEFIK_CHART_VERSION" --destination "$work"
tgz="$work/traefik-${TRAEFIK_CHART_VERSION}.tgz"
echo "${TRAEFIK_CHART_SHA256}  ${tgz}" | sha256sum -c - \
  || { echo "CHECKSUM KHÔNG KHỚP — chart đã đổi kể từ lần ghim. DỪNG."; exit 1; }

step "Cài/nâng cấp Traefik trong namespace ${TRAEFIK_NAMESPACE}"
# service.type=ClusterIP — KHÔNG phải mặc định của chart (LoadBalancer).
#
#   • LoadBalancer trên kubeadm 1-node không có cloud provider ⇒ EXTERNAL-IP
#     `<pending>` VĨNH VIỄN, không lỗi, không log. Đúng kiểu im lặng mà
#     ingress.yaml của chart platform đã cảnh báo.
#   • NodePort thì chạy, nhưng origin trình duyệt thành `http://192.168.x.x:3xxxx`
#     và cookie `dlp_sandbox` mang `Secure` VÔ ĐIỀU KIỆN
#     (apps/web/src/server/auth/sandbox-cookie.ts) — trình duyệt bỏ qua Set-Cookie
#     `Secure` trên HTTP với host không phải localhost, TRONG IM LẶNG, rồi mọi
#     handshake WS trả 401 mà không nói vì sao. Chính file cookie đó đã ghi bẫy này.
#
# Nên tới khi P3 dựng entrypoint thật + TLS, đường vào là:
#   kubectl port-forward -n traefik svc/traefik 8080:80
# rồi mở http://localhost:8080 — localhost là secure context nên cookie `Secure`
# được chấp nhận, và BETTER_AUTH_URL/CORS_ALLOWED_ORIGINS hiện tại không phải đổi.
#
# resources: CÓ request, CÓ trần RAM, KHÔNG có trần CPU. 1.G-4 đo trên đúng cụm
# này: trần CPU 150m làm gateway bị throttle 38.7% chu kỳ CFS và mất 123ms mỗi
# lượt attach, mà triệu chứng chỉ là "terminal lâu mở" — không log nào nói. Traefik
# nằm trên CÙNG đường đó. OOM thì ồn ào và chẩn được, throttle thì không, nên chặn
# RAM mà thả CPU là lựa chọn có chủ ý chứ không phải quên điền.
helm upgrade --install traefik "$tgz" \
  --namespace "$TRAEFIK_NAMESPACE" --create-namespace \
  --set service.type=ClusterIP \
  --set ingressRoute.dashboard.enabled=false \
  --set resources.requests.cpu=100m \
  --set resources.requests.memory=64Mi \
  --set resources.limits.memory=192Mi \
  --wait --timeout 5m

step "Kiểm lại"
kubectl -n "$TRAEFIK_NAMESPACE" get pods -l app.kubernetes.io/name=traefik
kubectl get ingressclass

printf '\n\033[1;32mIngress controller đã cài.\033[0m\n'
printf 'Bật Ingress của nền tảng (KHÔNG dùng --reuse-values — nó đánh rơi key mới):\n'
printf '  helm get values platform -o yaml > /tmp/live-values.yaml\n'
printf '  helm upgrade platform infra/helm/platform \\\n'
printf '    -f infra/helm/platform/values-selfhost.yaml -f /tmp/live-values.yaml \\\n'
printf '    --set ingress.enabled=true --set ingress.className=traefik\n\n'
printf 'Mở từ máy dev:\n'
printf '  kubectl port-forward -n %s svc/traefik 8080:80   # rồi http://localhost:8080\n\n' "$TRAEFIK_NAMESPACE"
