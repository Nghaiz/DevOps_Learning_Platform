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

# ─────────────────────────────────────────────────────────────────────────────
# kiem_tarball — CỔNG CHẶN trước khi scp: mọi blob phải băm ra ĐÚNG tên của nó.
#
# Đóng một chế độ hỏng ĐÃ GẶP (2026-09-02). Tarball `docker save` sang tới VM có
# một blob tên `blobs/sha256/a0f82f…` mà nội dung băm ra `2fc66109…`. `ctr images
# import` nạp vào, băm lại, thấy lệch, KHÔNG lưu dưới digest được khai — rồi lúc
# unpack báo:
#
#     failed to get reader from content store: content digest sha256:…: not found
#
# ⛔ Thông báo đó đọc như THIẾU dữ liệu; thực chất là dữ liệu SAI TÊN. Và nó nổ ra
# trên VM, sau một lượt scp hàng chục MB — tức xa nhất có thể khỏi nguyên nhân.
# Cổng này kéo nó về máy dev, trước khi truyền.
#
# ⚠ NGUYÊN NHÂN GỐC CHƯA XÁC ĐỊNH, và cổng này CỐ Ý không đoán. Lượt điều tra
# ngay sau đó KHÔNG tái hiện được: một `docker save` tươi của đúng image ấy cho
# tarball có 17/17 blob khớp digest, scp sang VM giữ nguyên sha256, và `ctr import`
# chạy exit 0. Nghi phạm hợp lý nhất là ba thao tác docker chạy ĐỒNG THỜI trên cùng
# image lúc ấy (một lượt side-load smoke + một `docker pull` tay + lượt side-load
# đầy đủ), cộng một `taskkill` rơi vào đúng cửa sổ đó. Nhưng artefact đã bị xoá
# trước khi soi được, nên đó là giả thuyết, không phải kết luận.
#
# Vì lý do đó cổng kiểm ĐIỀU KIỆN HỎNG ("tarball này có blob sai digest không"),
# không kiểm một nguyên nhân phỏng đoán ("máy này có bật containerd store không").
# Kiểm nguyên nhân là kiểm một PROXY: chặn oan khi giả thuyết sai, bỏ lọt khi cùng
# triệu chứng đến từ đường khác.
#
# Kiểm MỌI blob, không chỉ blob lớn nhất: chọn "lớn nhất" là một phỏng đoán nữa về
# chỗ hỏng, và bản đầu của cổng này đã XANH trên một tarball thật chỉ vì nó bỏ qua
# 16 blob còn lại. Băm trọn một tar 300 MB mất vài giây — rẻ hơn nhiều so với
# truyền nó đi rồi hỏng.
kiem_tarball() {
  local tar="$1" ten="$2" thu_muc n that lech=0

  thu_muc="$(mktemp -d)"
  tar -xf "$tar" -C "$thu_muc" 'blobs/sha256' 2>/dev/null \
    || loi "${ten}: tarball không có thư mục blobs/sha256 — docker save hỏng"

  shopt -s nullglob
  local danh_sach=("$thu_muc"/blobs/sha256/*)
  shopt -u nullglob
  [[ ${#danh_sach[@]} -gt 0 ]] || { rm -rf "$thu_muc"; loi "${ten}: tarball không có blob nào"; }

  for f in "${danh_sach[@]}"; do
    n="$(basename "$f")"
    # Bỏ qua tên không phải digest (một số bản docker để lại file phụ ở đây).
    [[ "$n" =~ ^[0-9a-f]{64}$ ]] || continue
    that="$(sha256sum "$f" | cut -d' ' -f1)"
    if [[ "$that" != "$n" ]]; then
      echo "   blob LỆCH: ${n:0:16}… băm ra ${that:0:16}…" >&2
      lech=$((lech + 1))
    fi
  done
  rm -rf "$thu_muc"
  [[ $lech -eq 0 ]] && return 0

  cat >&2 <<HET

LỖI: ${ten} — tarball có ${lech} blob SAI DIGEST; ctr sẽ từ chối nó với thông báo
     "content digest …: not found" (đọc như thiếu dữ liệu, thực chất là sai tên).

Thử theo thứ tự này:

  1. Chạy LẠI script khi KHÔNG có thao tác docker nào khác đụng cùng image.
     Lần gặp trước không tái hiện được sau khi dọn các tiến trình song song.

  2. Nếu vẫn lệch: bỏ qua docker save, cho VM tự kéo (đã đo là chạy được):

       ssh ${VM_SSH} 'sudo ctr -n k8s.io images pull \\
         --user <github-user>:<token-có-read:packages> \\
         ${REGISTRY}/${ten}:${TAG}'

     ⚠ token nằm trong argv nên hiện ra ở \`ps\` của VM — chỉ dùng trên máy lab
     một người, và thu hồi token nếu VM có người khác dùng chung.

HET
  exit 1
}
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

  # ⛔ TRƯỚC scp, không sau: một tarball hỏng thì truyền nó đi là phí băng thông
  # trên đúng đường truyền đang chậm, rồi mới hỏng ở nơi khó đọc nhất.
  kiem_tarball "$tar" "$ten"

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
