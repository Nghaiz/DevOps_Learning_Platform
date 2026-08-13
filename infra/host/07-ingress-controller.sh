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
# Ghim cổng — xem lý lẽ ở khối `helm upgrade` bên dưới. Dải NodePort mặc định
# của kubeadm là 30000–32767, nên KHÔNG đặt được 80/443 ở đây mà không sửa
# `--service-node-port-range` của apiserver; số cổng không ảnh hưởng tính đúng
# của cookie `Secure`, chỉ ảnh hưởng độ dài URL.
TRAEFIK_HTTP_NODEPORT="${TRAEFIK_HTTP_NODEPORT:-30080}"
TRAEFIK_HTTPS_NODEPORT="${TRAEFIK_HTTPS_NODEPORT:-30443}"

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
# service.type=NodePort với CỔNG GHIM — KHÔNG phải mặc định của chart
# (LoadBalancer), và cũng không còn là ClusterIP như bản đầu của script này.
#
#   • LoadBalancer trên kubeadm 1-node không có cloud provider ⇒ EXTERNAL-IP
#     `<pending>` VĨNH VIỄN, không lỗi, không log. Đúng kiểu im lặng mà
#     ingress.yaml của chart platform đã cảnh báo.
#   • ClusterIP (bản trước) chạy được, nhưng đường vào duy nhất là
#     `kubectl port-forward` — tức KHÔNG có entry point thật, và không máy nào
#     khác trong LAN vào được. Đó chính là nợ P2 §3.
#
# VÌ SAO TRƯỚC ĐÂY NodePort BỊ LOẠI, VÀ VÌ SAO GIỜ THÌ KHÔNG:
# lý lẽ cũ là origin trình duyệt sẽ thành `http://192.168.x.x:3xxxx`, mà cookie
# `dlp_sandbox` mang `Secure` VÔ ĐIỀU KIỆN (apps/web/src/server/auth/sandbox-cookie.ts)
# — trình duyệt bỏ qua Set-Cookie `Secure` trên HTTP với host khác `localhost`,
# TRONG IM LẶNG, rồi mọi handshake WS trả 401 mà không nói vì sao.
#
# Lý lẽ đó nhắm vào HTTP, không nhắm vào NodePort. `08-tls-entrypoint.sh` dựng
# TLS thật cho `dlp.<ip>.sslip.io`, và trên HTTPS thì `Secure` được chấp nhận ở
# BẤT KỲ cổng nào — số cổng chưa bao giờ là thứ quyết định. Nên cặp
# (NodePort ghim + TLS) mở được đúng ô mà (NodePort + HTTP) làm hỏng.
#
# Cổng GHIM chứ không để k8s tự cấp: cổng tự cấp đổi sau mỗi lần cài lại, mà
# origin nằm trong CORS_ALLOWED_ORIGINS, BETTER_AUTH_URL và trong SAN của chứng
# chỉ. Một origin trôi theo lần cài là ba chỗ phải sửa tay mỗi lần.
#
# ⛔ KHOÁ LÀ `service.spec.type`, KHÔNG PHẢI `service.type`. Chart traefik v41
# nhét type vào `service.spec` (khối "additional entries added to the Service
# spec"). Bản đầu của script này viết `--set service.type=ClusterIP` và điều đó
# KHÔNG BAO GIỜ có hiệu lực: helm nhận một key lạ mà không kêu một tiếng, chart
# giữ nguyên mặc định LoadBalancer, và trên kubeadm 1-node thì LoadBalancer nằm
# `<pending>` VĨNH VIỄN. Suốt thời gian đó `helm get values` vẫn hiển thị
# `service.type: ClusterIP` — tức chính lệnh dùng để kiểm tra lại KHẲNG ĐỊNH
# điều sai. Đó là lý do có bước "Khẳng định type" bên dưới: giá trị đã khai
# không phải bằng chứng, chỉ đối tượng SỐNG mới là.
#
# resources: CÓ request, CÓ trần RAM, KHÔNG có trần CPU. 1.G-4 đo trên đúng cụm
# này: trần CPU 150m làm gateway bị throttle 38.7% chu kỳ CFS và mất 123ms mỗi
# lượt attach, mà triệu chứng chỉ là "terminal lâu mở" — không log nào nói. Traefik
# nằm trên CÙNG đường đó. OOM thì ồn ào và chẩn được, throttle thì không, nên chặn
# RAM mà thả CPU là lựa chọn có chủ ý chứ không phải quên điền.
helm upgrade --install traefik "$tgz" \
  --namespace "$TRAEFIK_NAMESPACE" --create-namespace \
  --set service.spec.type=NodePort \
  --set "ports.web.nodePort=${TRAEFIK_HTTP_NODEPORT}" \
  --set "ports.websecure.nodePort=${TRAEFIK_HTTPS_NODEPORT}" \
  --set ingressRoute.dashboard.enabled=false \
  --set resources.requests.cpu=100m \
  --set resources.requests.memory=64Mi \
  --set resources.limits.memory=192Mi \
  --wait --timeout 5m

step "Kiểm lại"
kubectl -n "$TRAEFIK_NAMESPACE" get pods -l app.kubernetes.io/name=traefik
kubectl get ingressclass

step "Khẳng định type + cổng trên ĐỐI TƯỢNG SỐNG"
# Đọc từ Service thật, KHÔNG từ `helm get values`. Cả sự cố `service.type` ở
# trên tồn tại được là vì giá trị đã khai và đối tượng sống nói hai điều khác
# nhau, và chỉ có một trong hai định tuyến được gói tin.
live_type="$(kubectl -n "$TRAEFIK_NAMESPACE" get svc traefik -o jsonpath='{.spec.type}')"
if [ "$live_type" != "NodePort" ]; then
  echo "Service traefik có type=${live_type}, muốn NodePort."
  echo "LoadBalancer trên kubeadm 1-node = EXTERNAL-IP <pending> vĩnh viễn (không lỗi, không log)."
  echo "Kiểm khoá values: chart v41 dùng service.spec.type, KHÔNG phải service.type."
  exit 1
fi
for want in "$TRAEFIK_HTTP_NODEPORT" "$TRAEFIK_HTTPS_NODEPORT"; do
  kubectl -n "$TRAEFIK_NAMESPACE" get svc traefik -o jsonpath='{.spec.ports[*].nodePort}' \
    | tr ' ' '\n' | grep -qx "$want" \
    || { echo "Cổng ${want} không có trên Service traefik — origin sẽ trôi sau mỗi lần cài."; exit 1; }
done
echo "OK: type=NodePort, cổng ${TRAEFIK_HTTP_NODEPORT}/${TRAEFIK_HTTPS_NODEPORT} đúng như đã ghim."

printf '\n\033[1;32mIngress controller đã cài.\033[0m\n'
printf 'Bước tiếp theo — TLS + entry point thật:\n'
printf '  bash 08-tls-entrypoint.sh\n\n'
printf 'Script đó sinh CA nội bộ + chứng chỉ cho dlp.<ip>.sslip.io, tạo Secret TLS,\n'
printf 'và in ra lệnh helm bật Ingress kèm TLS.\n\n'
