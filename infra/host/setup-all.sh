#!/usr/bin/env bash
# setup-all.sh — Chạy toàn bộ 00→04 theo thứ tự. Dừng ngay khi có bước fail.
# Dùng chung cho CẢ VM local LẪN cloud VM — cùng một script, không rẽ nhánh.
#
#   bash setup-all.sh                 # đầy đủ
#   K8S_VERSION=v1.35 bash setup-all.sh
#   SKIP_VERIFY=1 bash setup-all.sh   # bỏ cổng P0.F (không khuyến khích)

set -euo pipefail
cd "$(dirname "$0")"

SKIP_VERIFY="${SKIP_VERIFY:-0}"
START="$(date +%s)"

banner() { printf '\n\033[1;35m%s\033[0m\n\033[1;35m%s\033[0m\n' "$1" "$(printf '─%.0s' $(seq 1 ${#1}))"; }

banner "BƯỚC 0 — Preflight (không sửa gì, chỉ kiểm tra)"
bash 00-preflight.sh

banner "BƯỚC 1 — Node prereqs (cần sudo)"
sudo -E K8S_VERSION="${K8S_VERSION:-v1.34}" bash 01-node-prereqs.sh

banner "BƯỚC 2 — kubeadm init + CNI (cần sudo)"
sudo -E bash 02-kubeadm-init.sh

banner "BƯỚC 3 — Cài Sysbox qua daemonset"
bash 03-sysbox-install.sh

# Chạy TRƯỚC cổng P0.F: bước 4 tạo pod để chứng minh Sysbox cách ly, và nếu token
# CNI đã cũ thì pod đó không lên được — cổng sẽ đỏ vì một lý do hoàn toàn khác
# với thứ nó định kiểm. Canary bị bỏ qua có thông báo (namespace dlp-sandbox do
# Helm tạo, chưa tồn tại ở thời điểm này) — chạy lại script sau `helm install`.
banner "BƯỚC 3.5 — Addon cluster (StorageClass + vá token CNI + canary)"
bash 05-cluster-addons.sh

if [ "$SKIP_VERIFY" = "1" ]; then
  printf '\n\033[33mSKIP_VERIFY=1 → bỏ qua cổng P0.F. Nhớ chạy 04-verify-sysbox.sh trước khi mở P1.\033[0m\n'
else
  banner "BƯỚC 4 — CỔNG P0.F: chứng minh Sysbox thật sự cách ly"
  bash 04-verify-sysbox.sh
fi

MIN=$(( ($(date +%s) - START) / 60 ))
printf '\n\033[1;32m╭─ HOST SẴN SÀNG ─────────────────────────────╮\033[0m\n'
printf '\033[1;32m│\033[0m  Tổng thời gian: %-3d phút                   \033[1;32m│\033[0m\n' "$MIN"
printf '\033[1;32m╰─────────────────────────────────────────────╯\033[0m\n\n'
kubectl get nodes -o custom-columns='NODE:.metadata.name,STATUS:.status.conditions[-1].type,K8S:.status.nodeInfo.kubeletVersion,RUNTIME:.status.nodeInfo.containerRuntimeVersion'
printf '\nkubeconfig: ~/.kube/config  (copy về Windows để chạy kubectl từ máy chính)\n\n'
