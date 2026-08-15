#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 12-helm-deploy.sh — deploy chart platform lên VM lab TỪ chart TƯƠI của repo.
#
# VÌ SAO SCRIPT NÀY TỒN TẠI — nó đóng một cái bẫy, không phải thêm tiện nghi.
#
# Trước script này, deploy đi qua `~/dlp-deploy` trên VM: một BẢN CHÉP TAY của
# chart, đồng bộ lần cuối ở một commit CŨ (595e20b, 2026-08-14). `helm upgrade`
# từ đó dùng template ĐỜI CŨ, nên mọi thay đổi template sau lần chép (3.C/3.F/3.H)
# bị LẶNG LẼ gỡ đi — pod vẫn Running 1/1, helm vẫn "success", mà tính năng mới
# biến mất. Đúng lớp lỗi khó lần nhất. `~/dlp-deploy` KHÔNG phải git repo nên nó
# không tự cập nhật; nó chỉ già đi.
#
# ⛔ NGUỒN SỰ THẬT CỦA CHART LÀ REPO NÀY, KHÔNG PHẢI MỘT THƯ MỤC TRÊN VM.
# Script luôn `rsync` chart tươi từ repo lên một thư mục MỚI trên VM rồi upgrade
# từ đó. Không có bản chép nào sống qua hai lần deploy để mà già đi.
#
# BÍ MẬT (mật khẩu Postgres/Redis, betterAuthSecret) KHÔNG rời VM và KHÔNG vào
# git: script đọc chúng bằng `helm get values` NGAY TRÊN VM vào một overlay tạm,
# dùng cho upgrade, rồi xoá. Chúng không đi qua máy dev, không qua `--set` (tránh
# nằm lại trong shell history / log).
#
# Dùng:
#   bash infra/host/12-helm-deploy.sh                          # upgrade, giữ bí mật live
#   bash infra/host/12-helm-deploy.sh -f infra/helm/.../x.yaml # thêm overlay (đè cuối)
#   VM_SSH=nghaiz@192.168.94.130 bash infra/host/12-helm-deploy.sh
#
# Chạy TỪ MÁY DEV (nơi có repo). Không nhận secret trên dòng lệnh — cố ý.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHART_SRC="${REPO_ROOT}/infra/helm/platform"
VM_SSH="${VM_SSH:-nghaiz@192.168.94.130}"
RELEASE="${RELEASE:-platform}"
NAMESPACE="${NAMESPACE:-default}"
SELFHOST_VALUES="values-selfhost.yaml" # tên file bên trong chart

loi() { echo "LỖI: $*" >&2; exit 1; }

# Overlay bổ sung (đè SAU secret) — ví dụ ghim tag image tạm cho một lượt đo.
# Đường dẫn tương đối repo; script scp từng cái lên VM.
EXTRA_OVERLAYS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -f) shift; EXTRA_OVERLAYS+=("$1"); shift ;;
    *)  loi "tham số lạ: $1 (chỉ nhận -f <overlay>)" ;;
  esac
done

[[ -d "$CHART_SRC" ]] || loi "không thấy chart ở $CHART_SRC"
command -v tar >/dev/null 2>&1 || loi "cần tar trên máy dev"
ssh -o ConnectTimeout=8 "$VM_SSH" true 2>/dev/null || loi "không ssh được tới $VM_SSH"

# Thư mục MỚI mỗi lần — không dùng đường cố định để không có bản nào sống dai.
# tar-over-ssh thay vì rsync: Git Bash trên Windows KHÔNG có rsync, còn tar thì
# luôn có. `--delete` của rsync được thay bằng `rm -rf` thư mục đích trước khi
# giải nén — cùng hiệu quả "đích khớp nguồn, không sót file cũ".
REMOTE_DIR="/tmp/dlp-chart-fresh"
echo "── ship chart tươi → ${VM_SSH}:${REMOTE_DIR}/platform"
tar -C "$(dirname "$CHART_SRC")" -cf - "$(basename "$CHART_SRC")" \
  | ssh "$VM_SSH" "rm -rf '${REMOTE_DIR}' && mkdir -p '${REMOTE_DIR}' && tar -C '${REMOTE_DIR}' -xf -"

# Overlay secret đọc TỪ release đang chạy, GIỮ NGUYÊN trên VM.
echo "── trích secret live (helm get values) → overlay tạm trên VM"
ssh "$VM_SSH" "helm get values '${RELEASE}' -n '${NAMESPACE}' 2>/dev/null | sed '1d' > ${REMOTE_DIR}/live-values.yaml" \
  || loi "không đọc được values live — release ${RELEASE} đã cài chưa?"
ssh "$VM_SSH" "test -s ${REMOTE_DIR}/live-values.yaml" \
  || loi "overlay secret rỗng — dừng để KHÔNG regenerate mật khẩu (mọi RPC/DB sẽ đỏ)"

# Ship các overlay bổ sung.
REMOTE_EXTRA=()
for ov in "${EXTRA_OVERLAYS[@]:-}"; do
  [[ -n "$ov" ]] || continue
  [[ -f "${REPO_ROOT}/${ov}" || -f "$ov" ]] || loi "overlay không tồn tại: $ov"
  src="${ov}"; [[ -f "${REPO_ROOT}/${ov}" ]] && src="${REPO_ROOT}/${ov}"
  base="$(basename "$ov")"
  scp -q "$src" "${VM_SSH}:${REMOTE_DIR}/extra-${base}"
  REMOTE_EXTRA+=("-f ${REMOTE_DIR}/extra-${base}")
done

echo "── helm upgrade từ chart tươi (values-selfhost → secret live → overlay bổ sung)"
ssh "$VM_SSH" "helm upgrade '${RELEASE}' '${REMOTE_DIR}/platform' -n '${NAMESPACE}' \
    -f '${REMOTE_DIR}/platform/${SELFHOST_VALUES}' \
    -f '${REMOTE_DIR}/live-values.yaml' \
    ${REMOTE_EXTRA[*]:-} --wait --timeout 5m"

# Dọn bẫy: nếu ~/dlp-deploy còn tồn tại (bản chép tay cũ), thay bằng một tấm
# biển chỉ đường thay vì để nó tiếp tục là nguồn sự thật giả.
ssh "$VM_SSH" "if [ -d ~/dlp-deploy ]; then
  rm -rf ~/dlp-deploy;
  mkdir -p ~/dlp-deploy;
  printf 'ĐÃ BỎ. Deploy bằng infra/host/12-helm-deploy.sh (ship chart TƯƠI từ repo).\nBản chép tay ở đây từng LỆCH commit và làm helm upgrade gỡ mất tính năng.\n' > ~/dlp-deploy/README-DEPRECATED.txt;
fi"

echo
echo "Xong. Chart deploy TỪ repo, không từ bản chép cũ. ~/dlp-deploy đã bị vô hiệu hoá."
