#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 14-deploy-rollback.sh — deploy có ĐƯỜNG LÙI TỰ ĐỘNG.
#
# VÌ SAO SCRIPT NÀY TỒN TẠI
#
# `12-helm-deploy.sh` deploy được và `13-smoke.sh` phát hiện được hỏng, nhưng
# giữa hai cái đó không có gì nối lại: smoke đỏ thì cụm nằm đỏ tới khi có người
# gõ tay đường lùi. Với một lượt deploy chạy lúc không ai thức, khoảng trống đó
# là chênh lệch giữa "hỏng năm phút" và "hỏng tới sáng".
#
# Script này ghi lại tag ĐANG CHẠY THẬT, deploy, chấm bằng smoke, và tự trả về
# tag cũ khi smoke đỏ.
#
# ⛔ TAG CŨ ĐỌC TỪ DEPLOYMENT ĐANG CHẠY, KHÔNG ĐỌC TỪ CHART.
# Chart là thứ ta SẮP áp và thường đã bị sửa trước khi script này chạy (đó là
# mục đích của lượt deploy). Đọc tag lùi từ đó là ghi lại chính giá trị mới rồi
# gọi nó là "bản cũ" — đường lùi khi ấy lùi về đúng thứ vừa làm hỏng, và nó im
# lặng vì mọi lệnh đều thành công.
#
# ⛔ SMOKE THOÁT 2 KHÔNG PHẢI SMOKE ĐỎ.
# `13-smoke.sh` phân biệt 1 (có vế đỏ) với 2 (không đo được — môi trường). Lùi vì
# mã 2 là lùi một bản deploy có thể hoàn toàn lành, chỉ vì SSH rớt. Mã 2 ⇒ DỪNG,
# giữ nguyên hiện trạng, để người đọc quyết. "Không biết" không phải "hỏng".
#
# ⚠ THỨ SCRIPT NÀY KHÔNG LÙI ĐƯỢC: migration DB.
# `platform-migrate` là hook helm chạy tiến; trả tag về không hoàn tác schema.
# Có migration mới trong lượt deploy ⇒ đường lùi chỉ đúng nếu migration đó
# tương thích ngược. Script dừng và hỏi khi phát hiện tag migrator đổi.
#
# Dùng:
#   bash infra/host/14-deploy-rollback.sh                 # deploy + smoke + tự lùi
#   DRY_RUN=1 bash infra/host/14-deploy-rollback.sh       # chỉ in kế hoạch
#   NO_ROLLBACK=1 bash infra/host/14-deploy-rollback.sh   # deploy, smoke, KHÔNG lùi
#
# Thoát: 0 = deploy xanh · 1 = đã lùi · 2 = không đo được, giữ nguyên · 3 = lùi HỎNG
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

GOC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VM_SSH="${VM_SSH:-nghaiz@192.168.94.130}"
NAMESPACE="${NAMESPACE:-default}"
RELEASE="${RELEASE:-platform}"
VALUES="${VALUES:-$GOC/infra/helm/platform/values-selfhost.yaml}"
DRY_RUN="${DRY_RUN:-0}"
NO_ROLLBACK="${NO_ROLLBACK:-0}"

STAMP="$(date +%Y%m%d-%H%M%S)"
LUU="$GOC/plans/devops-learning-platform/reports/harness/deploy-$STAMP"

loi()  { printf '\033[31mLỖI\033[0m %s\n' "$*" >&2; exit 3; }
buoc() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
noi()  { printf '     %s\n' "$*"; }
vm()   { ssh -o BatchMode=yes -o ConnectTimeout=10 "$VM_SSH" "$@"; }

# ── 1. Chụp hiện trạng THẬT ──────────────────────────────────────────────────
# Nguồn là `kubectl get deploy`, không phải chart. Xem chú thích đầu file.
buoc "chụp tag đang chạy trên cụm (nguồn: deployment, KHÔNG phải chart)"
mkdir -p "$LUU"
TRUOC="$LUU/tags-truoc.txt"

if ! vm "kubectl get deploy -n '$NAMESPACE' -o custom-columns=NAME:.metadata.name,IMAGE:.spec.template.spec.containers[*].image --no-headers" > "$TRUOC" 2>/dev/null; then
  loi "không đọc được deployment từ cụm — dừng TRƯỚC khi đụng gì. Không có ảnh chụp thì không có đường lùi."
fi
[[ -s "$TRUOC" ]] || loi "kubectl trả rỗng — đừng đọc thành 'cụm trống'."

# SANDBOX_IMAGE nằm trong env của orchestrator, không nằm trong .spec.containers[].image
SANDBOX_TRUOC="$(vm "kubectl get deploy ${RELEASE}-orchestrator -n '$NAMESPACE' -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name==\"SANDBOX_IMAGE\")].value}'" 2>/dev/null)"
[[ -n "$SANDBOX_TRUOC" ]] || loi "không đọc được SANDBOX_IMAGE — đường lùi sẽ không hoàn chỉnh."
echo "SANDBOX_IMAGE=$SANDBOX_TRUOC" >> "$TRUOC"

cat "$TRUOC" | sed 's/^/     /'
noi "đã lưu: $TRUOC"

# ── 2. Cảnh báo migration không lùi được ─────────────────────────────────────
MIG_TRUOC="$(grep -oE 'dlp-migrator:[^ ]+' "$TRUOC" | head -1 | cut -d: -f2)"
MIG_SAU="$(awk '/^  migrator:/{trong=1} trong && /^  [a-z]/ && !/^  migrator:/{exit} trong && $1=="tag:"{gsub(/['"'"'"]/,"");print $2;exit}' "$VALUES")"
if [[ -n "$MIG_TRUOC" && -n "$MIG_SAU" && "$MIG_TRUOC" != "$MIG_SAU" ]]; then
  buoc "⚠ TAG MIGRATOR ĐỔI: $MIG_TRUOC → $MIG_SAU"
  noi "Đường lùi của script này KHÔNG hoàn tác schema. Nó chỉ đúng nếu migration"
  noi "mới tương thích ngược với binary cũ. Chưa xác nhận điều đó thì đừng chạy tự động."
  [[ "${MIGRATION_OK:-0}" == "1" ]] || loi "đặt MIGRATION_OK=1 để xác nhận đã cân nhắc, hoặc deploy tay."
fi

if [[ "$DRY_RUN" == "1" ]]; then
  buoc "DRY_RUN — dừng ở đây"
  noi "chart sẽ áp: $VALUES"
  exit 0
fi

# ── 3. Deploy ────────────────────────────────────────────────────────────────
buoc "deploy (12-helm-deploy.sh)"
if ! bash "$GOC/infra/host/12-helm-deploy.sh"; then
  buoc "deploy THẤT BẠI ngay ở helm — chưa cần lùi tag, nhưng cụm có thể đang dở"
  vm "kubectl get pods -n '$NAMESPACE'" | sed 's/^/     /'
  exit 1
fi

# ── 4. Chấm ──────────────────────────────────────────────────────────────────
buoc "smoke (13-smoke.sh)"
VM_SSH="$VM_SSH" bash "$GOC/infra/host/13-smoke.sh" 2>&1 | tee "$LUU/smoke.log"
MA=${PIPESTATUS[0]}

case "$MA" in
  0) buoc "smoke XANH — deploy giữ nguyên"
     vm "kubectl get deploy -n '$NAMESPACE' -o custom-columns=NAME:.metadata.name,IMAGE:.spec.template.spec.containers[*].image --no-headers" > "$LUU/tags-sau.txt"
     cat "$LUU/tags-sau.txt" | sed 's/^/     /'
     exit 0 ;;
  2) buoc "smoke KHÔNG ĐO ĐƯỢC (mã 2) — GIỮ NGUYÊN, không lùi"
     noi "Mã 2 nghĩa là môi trường, không phải sản phẩm. Lùi ở đây là lùi một bản"
     noi "có thể hoàn toàn lành. Cần người đọc $LUU/smoke.log rồi quyết."
     exit 2 ;;
esac

# ── 5. Lùi ───────────────────────────────────────────────────────────────────
if [[ "$NO_ROLLBACK" == "1" ]]; then
  buoc "smoke ĐỎ — NO_ROLLBACK=1 nên giữ nguyên trạng thái hỏng để chẩn đoán"
  exit 1
fi

buoc "smoke ĐỎ — lùi về tag đã chụp ở bước 1"
if ! helm --kube-context "${KUBE_CONTEXT:-}" version >/dev/null 2>&1; then
  : # helm chạy trên VM qua 12-helm-deploy.sh; ở đây dùng kubectl set image cho nhanh và ít phụ thuộc
fi

LOI_LUI=0
while read -r ten anh; do
  [[ "$ten" == SANDBOX_IMAGE=* ]] && continue
  [[ -z "${anh:-}" ]] && continue
  # container name = phần sau '<release>-'
  ctn="${ten#${RELEASE}-}"
  noi "lùi $ten → $anh"
  vm "kubectl set image deploy/$ten $ctn=$anh -n '$NAMESPACE'" >/dev/null 2>&1 || LOI_LUI=1
done < <(grep -vE '^SANDBOX_IMAGE=' "$TRUOC" | grep -E 'ghcr\.io|docker\.io|:')

noi "lùi SANDBOX_IMAGE → $SANDBOX_TRUOC"
vm "kubectl set env deploy/${RELEASE}-orchestrator -n '$NAMESPACE' SANDBOX_IMAGE='$SANDBOX_TRUOC'" >/dev/null 2>&1 || LOI_LUI=1

buoc "chờ pod ổn định sau khi lùi"
for d in web orchestrator gateway; do
  vm "kubectl rollout status deploy/${RELEASE}-${d} -n '$NAMESPACE' --timeout=180s" >/dev/null 2>&1 \
    && noi "  $d Ready" || { noi "  $d KHÔNG Ready"; LOI_LUI=1; }
done

buoc "chấm lại sau khi lùi"
VM_SSH="$VM_SSH" bash "$GOC/infra/host/13-smoke.sh" 2>&1 | tee "$LUU/smoke-sau-lui.log"
MA_LUI=${PIPESTATUS[0]}

if [[ "$LOI_LUI" == "1" || "$MA_LUI" != "0" ]]; then
  buoc "⛔ LÙI KHÔNG SẠCH — cụm cần người"
  noi "trước:  $TRUOC"
  noi "smoke:  $LUU/smoke.log"
  noi "sau lùi:$LUU/smoke-sau-lui.log"
  exit 3
fi

buoc "đã lùi, cụm xanh trở lại"
noi "nguyên nhân nằm trong $LUU/smoke.log — đọc trước khi thử lại"
exit 1
