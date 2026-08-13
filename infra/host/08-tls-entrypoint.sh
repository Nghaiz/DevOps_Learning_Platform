#!/usr/bin/env bash
# 08-tls-entrypoint.sh — CA nội bộ + chứng chỉ TLS cho entry point thật (nợ P2 §3).
#
# VÌ SAO CẦN: tới hết P2, đường vào hệ thống là
#   kubectl port-forward -n traefik svc/traefik 8080:80  →  http://localhost:8080
# Không phải vì tiện, mà vì BẮT BUỘC: cookie `dlp_sandbox` mang `Secure` VÔ ĐIỀU
# KIỆN (apps/web/src/server/auth/sandbox-cookie.ts), và trình duyệt chỉ chấp nhận
# Set-Cookie `Secure` trên HTTP khi host là `localhost`. Mọi host khác → cookie
# bị VỨT TRONG IM LẶNG, rồi handshake WS trả 401 mà không nói vì sao.
#
# Hệ quả: không máy nào khác trong LAN vào được, và "nền tảng học" chỉ chạy trên
# đúng cái máy đang mở port-forward. Đó là nợ P2 §3.
#
# CÁCH ĐÓNG: HTTPS thật. Trên HTTPS thì `Secure` được chấp nhận ở BẤT KỲ host và
# BẤT KỲ cổng nào, nên port-forward không còn là điều kiện.
#
# VÌ SAO openssl chứ không phải cert-manager: cert-manager là một operator + bộ
# CRD, và thứ nó thắng là TỰ GIA HẠN ở quy mô nhiều chứng chỉ. Ở đây có ĐÚNG MỘT
# chứng chỉ cho một cụm lab 1 node. Thêm một operator phải ghim version + sha256
# (kỷ luật của 05/07) để quản một chứng chỉ là đổi nhiều lấy ít. Khi P3 cần nhiều
# host hoặc gia hạn tự động thì cert-manager mới đáng.
#
# VÌ SAO sslip.io: Let's Encrypt không cấp được cho IP nội bộ (HTTP-01 phải với
# tới từ internet). Cần một TÊN vì SAN của chứng chỉ và vì `Host` header của
# Ingress. sslip.io là DNS công khai tự giải `dlp.192.168.94.130.sslip.io` ra
# chính `192.168.94.130` — nên KHÔNG máy nào phải sửa file hosts, kể cả máy khác
# trong LAN. (Đổi lại: cần mạng để giải DNS. Muốn offline hoàn toàn thì đặt
# DLP_HOST=dlp.lab và tự thêm dòng vào hosts của từng máy.)
#
# Chạy lại được nhiều lần: CA cũ được TÁI DÙNG nếu còn (xem CA_DIR), nên chạy
# lại không bắt mọi trình duyệt tin lại một CA mới.
#
#   bash 08-tls-entrypoint.sh

set -euo pipefail
cd "$(dirname "$0")"

# IP node — mặc định lấy từ route mặc định, không hardcode.
NODE_IP="${NODE_IP:-$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')}"
[ -n "$NODE_IP" ] || { echo "Không xác định được IP node. Đặt NODE_IP=<ip> rồi chạy lại."; exit 1; }

DLP_HOST="${DLP_HOST:-dlp.${NODE_IP}.sslip.io}"
HTTPS_NODEPORT="${TRAEFIK_HTTPS_NODEPORT:-30443}"
PLATFORM_NAMESPACE="${PLATFORM_NAMESPACE:-default}"
TLS_SECRET="${TLS_SECRET:-platform-tls}"
# CA sống NGOÀI mktemp: sinh CA mới mỗi lần chạy nghĩa là mỗi lần chạy lại script
# là một lần mọi trình duyệt phải import lại chứng chỉ gốc. Khoá CA là thứ duy
# nhất trong luồng này đáng giữ lại giữa các lần chạy.
CA_DIR="${CA_DIR:-$HOME/.dlp-ca}"

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }

step "Tham số"
printf '  host        : %s\n  node IP     : %s\n  cổng HTTPS  : %s\n  namespace   : %s\n' \
  "$DLP_HOST" "$NODE_IP" "$HTTPS_NODEPORT" "$PLATFORM_NAMESPACE"

step "CA nội bộ (${CA_DIR})"
mkdir -p "$CA_DIR"
chmod 700 "$CA_DIR"
if [ -f "$CA_DIR/ca.key" ] && [ -f "$CA_DIR/ca.crt" ]; then
  echo "CA đã có — TÁI DÙNG (trình duyệt đã tin nó thì không phải tin lại)."
else
  echo "Chưa có CA — sinh mới (hạn 10 năm; đây là CA của một lab, không phải của production)."
  openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
    -keyout "$CA_DIR/ca.key" -out "$CA_DIR/ca.crt" \
    -subj "/CN=DevOps Learning Platform Lab CA/O=DLP Lab" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"
  chmod 600 "$CA_DIR/ca.key"
fi

step "Chứng chỉ máy chủ cho ${DLP_HOST}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# SAN mang CẢ tên lẫn IP. Tên là thứ trình duyệt kiểm khi vào bằng URL sslip.io;
# IP có mặt cho lượt `curl https://<ip>` lúc chẩn đoán — thiếu nó thì một phép
# thử bằng IP sẽ đỏ vì SAN chứ không phải vì đường mạng, và đó là 20 phút đi sai
# hướng đúng lúc đang gấp.
openssl req -newkey rsa:2048 -nodes \
  -keyout "$work/tls.key" -out "$work/tls.csr" \
  -subj "/CN=${DLP_HOST}"
openssl x509 -req -in "$work/tls.csr" -sha256 -days 825 \
  -CA "$CA_DIR/ca.crt" -CAkey "$CA_DIR/ca.key" -CAcreateserial \
  -out "$work/tls.crt" \
  -extfile <(printf 'subjectAltName=DNS:%s,IP:%s\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' \
    "$DLP_HOST" "$NODE_IP")

step "Secret ${TLS_SECRET} trong namespace ${PLATFORM_NAMESPACE}"
# `create --dry-run | apply` chứ không `create`: script phải chạy lại được, và
# `kubectl create secret` lần hai là AlreadyExists → set -e giết cả script.
kubectl create secret tls "$TLS_SECRET" \
  --namespace "$PLATFORM_NAMESPACE" \
  --cert="$work/tls.crt" --key="$work/tls.key" \
  --dry-run=client -o yaml | kubectl apply -f -

step "Kiểm lại chứng chỉ"
openssl x509 -in "$work/tls.crt" -noout -subject -ext subjectAltName -dates

printf '\n\033[1;32mTLS đã sẵn sàng.\033[0m\n\n'
printf 'Bật Ingress + TLS (KHÔNG dùng --reuse-values — nó đánh rơi key mới):\n'
printf '  helm get values platform -o yaml > /tmp/live-values.yaml\n'
printf '  helm upgrade platform infra/helm/platform \\\n'
printf '    -f infra/helm/platform/values-selfhost.yaml -f /tmp/live-values.yaml \\\n'
printf '    --set ingress.enabled=true --set ingress.className=traefik \\\n'
printf '    --set ingress.host=%s \\\n' "$DLP_HOST"
printf '    --set ingress.tls.enabled=true --set ingress.tls.secretName=%s \\\n' "$TLS_SECRET"
printf '    --set web.env.corsAllowedOrigins=https://%s:%s \\\n' "$DLP_HOST" "$HTTPS_NODEPORT"
printf '    --set web.env.betterAuthUrl=https://%s:%s\n\n' "$DLP_HOST" "$HTTPS_NODEPORT"
printf 'Đường vào (mọi máy trong LAN, KHÔNG cần port-forward):\n'
printf '  \033[1mhttps://%s:%s\033[0m\n\n' "$DLP_HOST" "$HTTPS_NODEPORT"
printf 'Trình duyệt sẽ cảnh báo tới khi CA được tin. Lấy CA về:\n'
printf '  scp <user>@%s:%s/ca.crt .\n' "$NODE_IP" "$CA_DIR"
printf '  Windows: certutil -addstore -user Root ca.crt\n'
printf '  Linux  : sudo cp ca.crt /usr/local/share/ca-certificates/dlp-lab.crt && sudo update-ca-certificates\n'
printf '  curl   : curl --cacert ca.crt https://%s:%s/\n\n' "$DLP_HOST" "$HTTPS_NODEPORT"
