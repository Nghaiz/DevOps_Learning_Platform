#!/usr/bin/env bash
# 1.G-6 R4 — đo cửa sổ web-500 trên một `helm install` SẠCH.
#
# Đại lượng:
#   t0 = pod web đạt condition Ready (đọc `lastTransitionTime`, KHÔNG bấm đồng hồ tay)
#   t1 = lượt `GET /api/auth/jwks` ĐẦU TIÊN trả 200
#   cửa sổ = t1 - t0
#
# ⛔ Đối chứng dương BẮT BUỘC: phải quan sát được ÍT NHẤT một lượt KHÔNG-200 trước
# lượt 200. Nếu poll đầu tiên đã 200 thì phép đo không phân biệt "cửa sổ ngắn" với
# "bắt đầu đo quá muộn nên bỏ lỡ cả cửa sổ" — và con số 0s đọc ra sẽ sai theo
# hướng trấn an. Vì thế poller khởi động TRƯỚC `helm install`.
#
# ⛔ KHÔNG đụng tới release `platform` đang chạy. Mọi thứ nằm trong namespace nháp
# và bị xoá ở cuối (kể cả PVC — chúng mang `helm.sh/resource-policy: keep` nên
# `helm uninstall` để lại).
set -uo pipefail

NS=dlp-scratch
REL=dlp-scratch
NODE=192.168.94.130
TAG=${TAG:-sha-a6f6768}
REPO_ROOT=$(git rev-parse --show-toplevel)
OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLL_LOG="$OUT_DIR/poll-jwks.tsv"

now_ms() { date +%s%3N; }

# ⛔ HAI ĐỒNG HỒ, KHÔNG PHẢI MỘT — bẫy đã cắn ở lượt chạy đầu 2026-08-13.
#
# `t0` là `Ready.lastTransitionTime`, do apiserver ghi bằng đồng hồ **VM**.
# `t1` là lượt 200 đầu tiên, do poller này bấm bằng đồng hồ **Windows**. Trừ
# thẳng hai mốc đó ra **-46.7s** — một cửa sổ ÂM. Đọc vội thì tưởng bộ đo hỏng;
# thực ra VM đang chạy nhanh hơn Windows gần đúng một phút.
#
# Đo lệch bằng cách kẹp lượt SSH giữa hai lần đọc đồng hồ local rồi lấy trung
# điểm (RTT dưới 0.5s ⇒ sai số dưới một phần tư giây). KHÔNG giả định 0: một
# phép đo "cửa sổ" mà hai đầu nằm trên hai đồng hồ khác nhau thì con số đọc ra
# không có nghĩa gì, kể cả khi nó DƯƠNG và trông hợp lý.
measure_skew_ms() {
  local w1 vm w2
  w1=$(date -u +%s%3N)
  vm=$(ssh -o BatchMode=yes -o ConnectTimeout=8 "nghaiz@$NODE" 'date -u +%s%3N' 2>/dev/null)
  w2=$(date -u +%s%3N)
  [ -z "$vm" ] && { echo ''; return; }
  echo $(( vm - (w1 + w2) / 2 ))
}

echo "=== 0. tiền đề: release 'platform' phải KHÔNG bị đụng ==="
kubectl get ns "$NS" >/dev/null 2>&1 && {
  echo "⛔ namespace $NS đã tồn tại — dọn trước khi đo"; exit 1; }
helm list -A --output json | grep -q '"name":"platform"' || {
  echo "⛔ không thấy release 'platform' — dừng, cảnh không như mô tả"; exit 1; }
echo "ok: $NS chưa tồn tại, 'platform' vẫn ở đó"

kubectl create ns "$NS" >/dev/null

# --- poller nền: chạy TRƯỚC helm install ---
: >"$POLL_LOG"
printf 'epoch_ms\tma\tghi_chu\n' >>"$POLL_LOG"
(
  port=''
  deadline=$(( $(date +%s) + 900 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if [ -z "$port" ]; then
      port=$(kubectl get svc -n "$NS" "$REL-web" -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null)
      if [ -z "$port" ]; then
        printf '%s\t-\tchua-co-service\n' "$(now_ms)" >>"$POLL_LOG"
        sleep 1
        continue
      fi
      printf '%s\t-\tnodePort=%s\n' "$(now_ms)" "$port" >>"$POLL_LOG"
    fi
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 \
      "http://$NODE:$port/api/auth/jwks" 2>/dev/null)
    [ -z "$code" ] && code=000
    printf '%s\t%s\t\n' "$(now_ms)" "$code" >>"$POLL_LOG"
    [ "$code" = "200" ] && break
    sleep 0.5
  done
) &
POLLER=$!
echo "poller pid=$POLLER, log=$POLL_LOG"

echo
echo "=== 1. helm install SẠCH (tag $TAG) ==="
# Cảnh tối thiểu: đường jwks không đi qua orchestrator/gateway, nên tắt cả hai.
# `sandbox.enabled=false` né đụng Namespace `dlp-sandbox` của release 'platform';
# đổi TÊN PriorityClass thay vì tắt nó — tắt sẽ bỏ priority khỏi pod nháp và làm
# nhiễu đúng cái mốc Ready đang đo.
helm install "$REL" "$REPO_ROOT/infra/helm/platform" -n "$NS" \
  -f "$REPO_ROOT/infra/helm/platform/values-selfhost.yaml" \
  --set image.tag="$TAG" \
  --set orchestrator.enabled=false \
  --set gateway.enabled=false \
  --set sandbox.enabled=false \
  --set platform.priorityClassName=dlp-scratch-critical \
  --set web.env.betterAuthSecret="$(openssl rand -hex 32)" \
  --set datastore.postgres.password="$(openssl rand -hex 24)" \
  --set datastore.redis.password="$(openssl rand -hex 24)" \
  --timeout 10m 2>&1 | tail -15
HELM_RC=${PIPESTATUS[0]}
echo "helm install exit=$HELM_RC"

echo
echo "=== 2. chờ poller thấy 200 (hoặc hết hạn) ==="
wait "$POLLER" 2>/dev/null

echo
echo "=== 3. t0 = pod web Ready ==="
READY_ISO=$(kubectl get pod -n "$NS" -l app.kubernetes.io/component=web \
  -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].lastTransitionTime}' 2>/dev/null)
echo "Ready lastTransitionTime = ${READY_ISO:-<khong doc duoc>}"

echo
echo "=== 4. kết quả ==="
if [ -z "$READY_ISO" ]; then
  echo "⛔ không đọc được mốc Ready — KHÔNG kết luận."
  exit 1
fi
SKEW=$(measure_skew_ms)
if [ -z "$SKEW" ]; then
  echo "⛔ không đo được lệch đồng hồ VM↔local — KHÔNG kết luận."
  echo "  (trừ thẳng hai mốc trên hai đồng hồ khác nhau là cách sinh ra một con số vô nghĩa)"
  exit 1
fi
echo "lệch đồng hồ: VM nhanh hơn local ${SKEW}ms"
# Quy t0 từ đồng hồ VM về đồng hồ local để cùng hệ quy chiếu với t1.
T0_MS=$(( $(date -u -d "$READY_ISO" +%s) * 1000 - SKEW ))
FIRST_200=$(awk -F'\t' '$2=="200"{print $1; exit}' "$POLL_LOG")
NON200_BEFORE=$(awk -F'\t' -v t="$T0_MS" '$1>=t && $2!="200" && $2!="-" {n++} END{print n+0}' "$POLL_LOG")
CODES=$(awk -F'\t' '$2!="-"{print $2}' "$POLL_LOG" | sort | uniq -c | tr '\n' ' ')

echo "t0 (Ready)          = $T0_MS ms"
echo "t1 (jwks 200 đầu)   = ${FIRST_200:-<chua thay 200>} ms"
echo "phân bố mã trả về   = $CODES"
echo "số lượt KHÔNG-200 sau khi Ready = $NON200_BEFORE"

if [ -z "$FIRST_200" ]; then
  echo "⛔ chưa từng thấy 200 — cửa sổ KHÔNG đo được, ghi nguyên trạng."
  exit 1
fi
WINDOW=$(awk -v a="$FIRST_200" -v b="$T0_MS" 'BEGIN{printf "%.1f", (a-b)/1000}')
echo "CỬA SỔ web-500      = ${WINDOW}s   (ngưỡng đã chốt 2026-08-10: ~60s)"
if [ "$NON200_BEFORE" -eq 0 ]; then
  echo "⚠ KHÔNG có lượt KHÔNG-200 nào sau mốc Ready ⇒ đối chứng dương VẮNG."
  echo "  Con số trên KHÔNG phân biệt được 'cửa sổ ngắn' với 'bỏ lỡ cả cửa sổ'."
fi
