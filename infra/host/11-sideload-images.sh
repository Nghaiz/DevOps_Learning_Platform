#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 11-sideload-images.sh — nạp image của ta vào containerd trên node (P3/3.H).
#
# VÌ SAO SCRIPT NÀY TỒN TẠI — nó trả một khoản nợ, không phải thêm tiện nghi.
#
# Cụm self-host chạy `imagePullPolicy: Never` (values-selfhost.yaml): registry
# ghcr là private, cụm không có imagePullSecrets, nên kubelet KHÔNG kéo được gì.
# Image phải có sẵn trên node trước khi pod chạy.
#
# Trước chặng 3.H, việc nạp đó là một chuỗi lệnh gõ tay và tag chỉ sống trong
# các `--set` của lệnh `helm upgrade`. Hệ quả ĐO ĐƯỢC (report 3.C + 3.F): cụm
# chạy `dlp-web:3f-quota429` và `dlp-orchestrator:3c3-9e35e97`, còn tag trong
# repo là một giá trị khác — nên bất kỳ `helm upgrade` nào quên `--set` sẽ lặng
# lẽ kéo hai service về bản cũ, làm SỐNG LẠI lỗi 500 mà 3.F vừa vá. Không có gì
# đỏ lên: `helm upgrade` thành công, `rollout status` xanh, pod `Running 1/1`.
#
# ⛔ NGUỒN SỰ THẬT LÀ `values-selfhost.yaml`, KHÔNG PHẢI THAM SỐ DÒNG LỆNH.
# Script cố ý KHÔNG nhận `--tag`. Nhận tag từ dòng lệnh là dựng lại đúng cái bẫy
# vừa gỡ: hai nguồn sự thật (file và ngón tay người gõ) trôi khỏi nhau, và cái
# trôi lệch không báo lỗi. Muốn đổi tag thì sửa MỘT dòng trong values rồi chạy
# lại script này.
#
# Dùng:
#   bash infra/host/11-sideload-images.sh                 # nạp cả 4 image
#   bash infra/host/11-sideload-images.sh dlp-web         # chỉ một image
#   VM_SSH=nghaiz@192.168.94.130 bash infra/host/11-sideload-images.sh
#
# Chạy TỪ MÁY DEV (nơi có docker + quyền pull ghcr), không phải trên VM.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VALUES="${REPO_ROOT}/infra/helm/platform/values-selfhost.yaml"
VM_SSH="${VM_SSH:-nghaiz@192.168.94.130}"
REGISTRY="${REGISTRY:-ghcr.io/nghaiz}"

# ⛔ `dlp-sandbox-base` PHẢI CÓ TRONG DANH SÁCH NÀY, và nó là cái dễ quên nhất.
# Nó không xuất hiện ở đâu trong `values-selfhost.yaml` như một image của
# deployment — orchestrator SUY RA `SANDBOX_IMAGE` từ chính tag đang chạy. Nên
# ghim tag mà không nạp image này thì mọi pod warm-pool kẹt `ErrImagePull`, tức
# không ai vào được terminal, trong khi cả 4 deployment đều `Running 1/1` và
# `helm upgrade` báo thành công. Đo được đúng ca này lúc dựng script (3.H).
MOI_IMAGE=(dlp-web dlp-terminal-gateway dlp-orchestrator dlp-migrator dlp-sandbox-base)

loi() {
  echo "LỖI: $*" >&2
  exit 1
}

[[ -f "$VALUES" ]] || loi "không thấy $VALUES"

# Đọc `image.tag` ở MỨC GỐC của values-selfhost.
#
# Dùng `yq` nếu có (đúng đắn), rơi về grep có neo cột nếu không. Neo `^image:`
# rồi lấy dòng `  tag:` NGAY SAU nó là cần thiết: file này còn các khối
# `web.image.tag`/`gateway.image.tag` thụt sâu hơn, và một grep trần sẽ tóm
# nhầm cái đầu tiên nó gặp — sai âm thầm, đúng loại lỗi script này sinh ra để diệt.
doc_tag() {
  if command -v yq >/dev/null 2>&1; then
    yq -r '.image.tag // ""' "$VALUES"
    return
  fi
  awk '
    /^image:[[:space:]]*$/ { trong = 1; next }
    trong && /^[^[:space:]]/ { trong = 0 }
    trong && $1 == "tag:" { gsub(/^[[:space:]]*tag:[[:space:]]*/, ""); gsub(/['"'"'"]/, ""); print; exit }
  ' "$VALUES"
}

TAG="$(doc_tag)"
[[ -n "$TAG" ]] || loi "không đọc được image.tag từ $VALUES — sửa hàm doc_tag hoặc cài yq"
[[ "$TAG" != "dev" ]] || loi "image.tag đang là 'dev' — đó là tag build tay ở máy dev, không phải tag đã publish. Ghim một tag sha-<short> vào $VALUES trước."

DANH_SACH=("${MOI_IMAGE[@]}")
if [[ $# -gt 0 ]]; then
  DANH_SACH=("$@")
fi

echo "── side-load image vào ${VM_SSH}"
echo "   tag  : ${TAG}   (đọc từ values-selfhost.yaml, KHÔNG từ dòng lệnh)"
echo "   image: ${DANH_SACH[*]}"
echo

command -v docker >/dev/null 2>&1 || loi "cần docker trên máy này để pull + save"
ssh -o ConnectTimeout=8 "$VM_SSH" true 2>/dev/null || loi "không ssh được tới $VM_SSH"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for ten in "${DANH_SACH[@]}"; do
  ref="${REGISTRY}/${ten}:${TAG}"
  echo "── ${ten}"

  # Đã có sẵn ở local thì khỏi pull — chạy lại script không nên tốn băng thông.
  if ! docker image inspect "$ref" >/dev/null 2>&1; then
    echo "   pull ${ref}"
    docker pull -q "$ref" >/dev/null || loi "pull ${ref} thất bại (đã 'docker login ghcr.io' chưa?)"
  else
    echo "   đã có ở local"
  fi

  tar="${TMP}/${ten}.tar"
  docker save -o "$tar" "$ref"
  echo "   scp $(du -h "$tar" | cut -f1)"
  scp -q "$tar" "${VM_SSH}:/tmp/${ten}.tar"

  # `-n k8s.io`: containerd của kubelet dùng namespace đó. Import vào namespace
  # mặc định thì image nằm trên node nhưng kubelet KHÔNG thấy, và pod kẹt ở
  # ErrImageNeverPull — triệu chứng đọc ra y hệt "quên side-load".
  ssh "$VM_SSH" "sudo ctr -n k8s.io images import /tmp/${ten}.tar >/dev/null && rm -f /tmp/${ten}.tar"
  echo "   ✓ import xong"
  rm -f "$tar"
done

echo
echo "── khẳng định trên NODE (không tin bước import báo thành công)"
thieu=0
for ten in "${DANH_SACH[@]}"; do
  ref="${REGISTRY}/${ten}:${TAG}"
  if ssh "$VM_SSH" "sudo ctr -n k8s.io images ls -q | grep -qx '${ref}'"; then
    echo "   ✓ ${ref}"
  else
    echo "   ✗ ${ref} — KHÔNG có trên node"
    thieu=1
  fi
done

[[ "$thieu" -eq 0 ]] || loi "có image chưa lên node — đừng chạy helm upgrade cho tới khi đủ"

echo
echo 'Xong. `helm upgrade` giờ chạy được mà KHÔNG cần --set image.tag nào.'
