#!/usr/bin/env bash
# bench-sandbox-provision.sh — Đo THẬT thời gian cấp sandbox pod, không đoán.
#
# Trả lời câu "học viên phải chờ bao lâu?" bằng 3 mốc, vì chúng RẤT khác nhau:
#   t_ready   pod Ready         — Kubernetes coi là xong, nhưng systemd bên trong còn đang boot
#   t_docker  `docker info` OK  — dockerd trong pod đã sống; đây mới là lúc bài lab dùng được
#   t_all     pod cuối cùng xong — quyết định độ trễ khi cấp cả lớp cùng lúc
#
# Con số 300s trong 04-verify-sysbox.sh là TRẦN CHỜ (timeout), không phải thời gian thật.
#
#   bash bench-sandbox-provision.sh          # 1 pod, đo baseline
#   bash bench-sandbox-provision.sh 5        # 5 pod song song, mô phỏng 1 lớp nhỏ
#   NO_DOCKER=1 bash bench-sandbox-provision.sh 10   # bỏ đo dockerd, chỉ đo tới Ready

set -uo pipefail

N="${1:-1}"
NS="${NS:-sandbox-bench}"
IMAGE="${IMAGE:-nestybox/ubuntu-noble-systemd-docker}"
NO_DOCKER="${NO_DOCKER:-0}"
TIMEOUT_S="${TIMEOUT_S:-600}"

ok()  { printf '  \033[32m✔\033[0m %s\n' "$*"; }
log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mLỖI: %s\033[0m\n' "$*" >&2; exit 1; }

now_ms() { date +%s%3N; }
fmt() { awk -v ms="$1" 'BEGIN{printf "%.1fs", ms/1000}'; }

command -v kubectl >/dev/null || die "Không có kubectl."
kubectl get runtimeclass sysbox-runc >/dev/null 2>&1 || die "Chưa có RuntimeClass sysbox-runc."

cleanup() { kubectl delete ns "$NS" --wait=false >/dev/null 2>&1 || true; }
trap cleanup EXIT

log "Chuẩn bị: $N pod, image $IMAGE"
kubectl delete ns "$NS" --wait=true --timeout=120s >/dev/null 2>&1 || true
kubectl create ns "$NS" >/dev/null
for _ in $(seq 1 60); do
  kubectl get -n "$NS" serviceaccount default >/dev/null 2>&1 && break
  sleep 1
done

# Image đã nằm sẵn trên node hay chưa quyết định phần lớn con số. Nói rõ để không đọc nhầm.
if sudo crictl images 2>/dev/null | grep -q "${IMAGE##*/}" || \
   sudo ctr -n k8s.io images ls -q 2>/dev/null | grep -q "${IMAGE##*/}"; then
  ok "image ĐÃ có sẵn trên node — số đo dưới đây là kịch bản warm (đúng với sản phẩm thật)"
else
  ok "image CHƯA có — lần đo này gồm cả thời gian kéo image (kịch bản cold, chỉ xảy ra 1 lần/node)"
fi

log "Tạo $N pod cùng lúc"
T0="$(now_ms)"
for i in $(seq 1 "$N"); do
  kubectl apply -n "$NS" -f - >/dev/null <<EOF &
apiVersion: v1
kind: Pod
metadata:
  name: bench-$i
spec:
  runtimeClassName: sysbox-runc
  hostUsers: false
  restartPolicy: Never
  containers:
  - name: sandbox
    image: $IMAGE
    command: ["/sbin/init"]
    securityContext:
      privileged: false
      allowPrivilegeEscalation: false
      capabilities: { drop: ["ALL"] }
      seccompProfile: { type: RuntimeDefault }
    resources:
      limits:   { cpu: "2", memory: "2Gi" }
      requests: { cpu: "500m", memory: "512Mi" }
EOF
done
wait
ok "đã submit $N pod trong $(fmt $(( $(now_ms) - T0 )))"

# ------------------------------------------------------------------ Đo t_ready
log "Chờ Ready"
declare -A T_READY
DONE=0
while [ "$DONE" -lt "$N" ]; do
  [ $(( ($(now_ms) - T0) / 1000 )) -lt "$TIMEOUT_S" ] || { printf '\n'; die "Quá $TIMEOUT_S giây."; }
  for i in $(seq 1 "$N"); do
    [ -n "${T_READY[$i]:-}" ] && continue
    if [ "$(kubectl get -n "$NS" pod "bench-$i" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)" = "True" ]; then
      T_READY[$i]=$(( $(now_ms) - T0 ))
      DONE=$((DONE + 1))
      printf '    bench-%-3s Ready  %8s   (%d/%d)\n' "$i" "$(fmt "${T_READY[$i]}")" "$DONE" "$N"
    fi
  done
  sleep 1
done
T_ALL_READY=$(( $(now_ms) - T0 ))

# ------------------------------------------------------------------ Đo t_docker
declare -A T_DOCKER
if [ "$NO_DOCKER" != "1" ]; then
  log "Chờ dockerd trong pod sống (đây mới là lúc bài lab dùng được)"
  DONE=0
  while [ "$DONE" -lt "$N" ]; do
    [ $(( ($(now_ms) - T0) / 1000 )) -lt "$TIMEOUT_S" ] || { printf '\n'; die "Quá $TIMEOUT_S giây."; }
    for i in $(seq 1 "$N"); do
      [ -n "${T_DOCKER[$i]:-}" ] && continue
      if kubectl exec -n "$NS" "bench-$i" -- docker info >/dev/null 2>&1; then
        T_DOCKER[$i]=$(( $(now_ms) - T0 ))
        DONE=$((DONE + 1))
        printf '    bench-%-3s docker OK  %8s   (%d/%d)\n' "$i" "$(fmt "${T_DOCKER[$i]}")" "$DONE" "$N"
      fi
    done
    sleep 2
  done
fi
T_ALL=$(( $(now_ms) - T0 ))

# ------------------------------------------------------------------ Tổng kết
log "Kết quả — $N pod song song"
minmax() {  # $1 = tên mảng
  local -n arr="$1"; local mn=999999999 mx=0 sum=0 c=0 v
  for v in "${arr[@]}"; do
    [ "$v" -lt "$mn" ] && mn="$v"; [ "$v" -gt "$mx" ] && mx="$v"
    sum=$((sum + v)); c=$((c + 1))
  done
  [ "$c" -gt 0 ] && printf '%s / %s / %s' "$(fmt "$mn")" "$(fmt $((sum / c)))" "$(fmt "$mx")" || printf 'n/a'
}
printf '  %-34s %s\n' "pod Ready (nhanh/tb/chậm nhất):" "$(minmax T_READY)"
[ "$NO_DOCKER" != "1" ] && printf '  %-34s %s\n' "docker dùng được (nhanh/tb/chậm):" "$(minmax T_DOCKER)"
printf '  %-34s %s\n' "TỔNG wall-clock cho cả $N pod:" "$(fmt "$T_ALL")"

printf '\n  Tài nguyên node lúc này:\n'
kubectl top node --no-headers 2>/dev/null | sed 's/^/    /' || printf '    (chưa cài metrics-server)\n'

printf '\n'
