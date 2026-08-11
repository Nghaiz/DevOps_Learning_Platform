#!/usr/bin/env bash
# 06-kubelet-pids-limit.sh — D-19′: đặt trần PID cho mỗi pod (phase-1 §1.D).
#
# VẤN ĐỀ: `/sys/fs/cgroup/pids.max` trong pod sandbox hiện là `max`, và kubelet
# không có `podPidsLimit` (xác minh 2026-08-09). Một fork-bomb trong pod của một
# sinh viên hạ được CẢ NODE — mà cluster này là 1-node, nên "hạ node" nghĩa là
# hạ luôn control-plane, orchestrator, gateway và mọi phiên của mọi người khác.
# Sysbox cách ly được filesystem/uid, nó KHÔNG cách ly được bảng PID của kernel.
#
# ⛔ VÌ SAO SCRIPT NÀY DÀI HƠN MỘT DÒNG SED — nó restart kubelet trên một cluster
# 1-NODE, tức bounce TOÀN BỘ pod. Nếu token CNI Calico đang cũ tại đúng thời điểm
# đó (R0) thì KHÔNG POD NÀO QUAY LẠI: `install-cni` là initContainer nên token SA
# 24h không bao giờ được refresh, và pod mới chết với
# `FailedCreatePodSandBox: ClusterInformation: connection is unauthorized`.
# Chạy `sed` trần rồi `systemctl restart kubelet` là TỰ TAY DỰNG LẠI đúng sự cố
# mà R0 mô tả — chỉ khác là lần này ta gây ra nó.
#
# Thứ tự bắt buộc (phase-1 §D-19′), script này thực thi đúng nó:
#   1. cron vá token (1.B0.1) phải đang sống  →  2. rollout restart calico-node
#   3. canary tạo pod phải XANH TRƯỚC          →  4. mới đổi kubelet + restart
#   5. canary lại NGAY sau khi kubelet lên     →  6. đo pids.max trong pod thật
#
# Bước 3 là thứ phân biệt "ta làm hỏng" với "nó vốn đã hỏng": không có nó thì mọi
# lỗi sau bước 4 đều trông như lỗi của bản vá này.
#
#   sudo bash 06-kubelet-pids-limit.sh
#   PIDS_LIMIT=8192 sudo -E bash 06-kubelet-pids-limit.sh
#   SKIP_CANARY=1 sudo -E bash 06-kubelet-pids-limit.sh   # cluster chưa có dlp-sandbox

set -euo pipefail
cd "$(dirname "$0")"

# 4096 đủ rộng cho dockerd + buildkit + một cây build thật trong pod (E7), đủ
# chặt để một fork-bomb chạm trần trong vài chục mili-giây thay vì ăn hết
# `kernel.pid_max` của host. Không phải con số thần thánh — nhưng nó là con số
# ĐƯỢC GHI, và trần hiện tại (`max`) thì không phải một con số nào cả.
PIDS_LIMIT="${PIDS_LIMIT:-4096}"
KUBELET_CONF="${KUBELET_CONF:-/var/lib/kubelet/config.yaml}"
SKIP_CANARY="${SKIP_CANARY:-0}"

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31mLỖI: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Chạy bằng root: sudo bash $0"
[ -f "$KUBELET_CONF" ] || die "Không thấy $KUBELET_CONF — node này chưa join cluster?"
command -v kubectl >/dev/null || die "Không có kubectl trong PATH của root."

export KUBECONFIG="${KUBECONFIG:-/etc/kubernetes/admin.conf}"

# canary chạy một Job từ CronJob dlp-cni-canary và ĐỢI nó Complete. Trả 1 khi
# canary đỏ hoặc namespace chưa có.
canary() {
  local label="$1" name="canary-$2-$(date +%s)"
  if ! kubectl get cronjob -n dlp-sandbox dlp-cni-canary >/dev/null 2>&1; then
    warn "chưa có cronjob/dlp-cni-canary — bỏ qua canary $label (chạy 05-cluster-addons.sh sau helm install)"
    return 0
  fi
  kubectl -n dlp-sandbox create job --from=cronjob/dlp-cni-canary "$name" >/dev/null
  if kubectl -n dlp-sandbox wait --for=condition=Complete "job/$name" --timeout=180s >/dev/null 2>&1; then
    ok "canary $label XANH — CNI cấp được IP, pod mới tạo được"
    kubectl -n dlp-sandbox delete job "$name" --ignore-not-found >/dev/null
    return 0
  fi
  printf '\n\033[31mcanary %s ĐỎ.\033[0m Events:\n' "$label"
  kubectl -n dlp-sandbox describe "job/$name" | tail -25
  return 1
}

# ------------------------------------------------------------------ 0. Đã đặt rồi?
step "0/6 Trạng thái hiện tại của $KUBELET_CONF"
CURRENT="$(grep -E '^podPidsLimit:' "$KUBELET_CONF" | awk '{print $2}' || true)"
if [ "$CURRENT" = "$PIDS_LIMIT" ]; then
  ok "podPidsLimit đã là $PIDS_LIMIT — không restart kubelet vô cớ"
  step "Kiểm lại trên cgroup HOST của pod thật (KHÔNG kiểm trong pod — xem bước 6b)"
  POD="$(kubectl get pods -n dlp-sandbox -l app=sandbox \
    -o jsonpath='{.items[?(@.status.phase=="Running")].metadata.name}' 2>/dev/null | awk '{print $1}')"
  if [ -n "$POD" ]; then
    PODUID="$(kubectl get pod -n dlp-sandbox "$POD" -o jsonpath='{.metadata.uid}')"
    SLICE="$(find /sys/fs/cgroup -maxdepth 4 -type d -name "*${PODUID//-/_}*" 2>/dev/null | head -1)"
    if [ -n "$SLICE" ] && [ -r "$SLICE/pids.max" ]; then
      MAX="$(cat "$SLICE/pids.max")"
      [ "$MAX" = "max" ] && die "config nói $PIDS_LIMIT nhưng cgroup host của pod $POD vẫn 'max' —
     pod này được tạo TRƯỚC lần restart kubelet. Xoá nó cho warm-pool dựng lại rồi đo lại."
      ok "pod $POD: cgroup HOST pids.max = $MAX ; pids.events = $(tr '\n' ' ' < "$SLICE/pids.events" 2>/dev/null)"
    else
      warn "không tìm được cgroup slice của $POD — 'không đo được' KHÔNG phải 'đạt'"
    fi
  else
    warn "không có pod sandbox Running để đo — chạy lại sau khi warm-pool dựng pod"
  fi
  exit 0
fi
[ -n "$CURRENT" ] && warn "podPidsLimit hiện là $CURRENT, sẽ đổi thành $PIDS_LIMIT" \
                  || ok "chưa có podPidsLimit (⇒ trần là 'max', tức KHÔNG có trần)"

# ------------------------------------------------------------------ 1+2. Hàng rào R0
step "1/6 Cron vá token CNI (1.B0.1) — phải đang sống TRƯỚC khi ta bounce node"
kubectl -n kube-system get cronjob dlp-calico-token-refresh >/dev/null 2>&1 \
  || die "Chưa có cronjob/dlp-calico-token-refresh. Chạy 05-cluster-addons.sh TRƯỚC.
     Không có nó thì restart kubelet trên cluster đã sống > 24h = không pod nào quay lại (R0)."
ok "cronjob/dlp-calico-token-refresh tồn tại"

step "2/6 Làm mới token NGAY (không tin vào lịch 12h)"
REFRESH="pidslimit-refresh-$(date +%s)"
kubectl -n kube-system create job --from=cronjob/dlp-calico-token-refresh "$REFRESH" >/dev/null
kubectl -n kube-system wait --for=condition=Complete "job/$REFRESH" --timeout=180s \
  || die "Job vá token không Complete. DỪNG — restart kubelet lúc này là tự gây ra R0."
kubectl -n kube-system rollout status daemonset/calico-node --timeout=180s
kubectl -n kube-system delete job "$REFRESH" --ignore-not-found >/dev/null
ok "token CNI vừa được ghi mới, calico-node đã rollout xong"

# ------------------------------------------------------------------ 3. Canary TRƯỚC
step "3/6 Canary TRƯỚC khi đổi kubelet (đường phân định trách nhiệm)"
if [ "$SKIP_CANARY" = "1" ]; then
  warn "SKIP_CANARY=1 — bỏ qua. Mọi lỗi sau bước 4 sẽ KHÔNG quy trách nhiệm được."
else
  canary "TRƯỚC" "truoc" || die "Canary ĐỎ khi CHƯA đụng gì tới kubelet.
     Cluster đang hỏng sẵn — sửa cái đó trước. Đổi kubelet lúc này chỉ làm
     nguyên nhân thật bị chôn dưới một thay đổi mới."
fi

# ------------------------------------------------------------------ 4. Đổi + restart
step "4/6 Ghi podPidsLimit: $PIDS_LIMIT rồi restart kubelet"
BACKUP="${KUBELET_CONF}.bak-$(date +%Y%m%d-%H%M%S)"
cp -a "$KUBELET_CONF" "$BACKUP"
ok "backup: $BACKUP"

if [ -n "$CURRENT" ]; then
  sed -i -E "s/^podPidsLimit:.*/podPidsLimit: ${PIDS_LIMIT}/" "$KUBELET_CONF"
else
  printf 'podPidsLimit: %s\n' "$PIDS_LIMIT" >> "$KUBELET_CONF"
fi
grep -qE "^podPidsLimit: ${PIDS_LIMIT}\$" "$KUBELET_CONF" \
  || { cp -a "$BACKUP" "$KUBELET_CONF"; die "Ghi config thất bại — đã khôi phục từ backup."; }
ok "$KUBELET_CONF đã có podPidsLimit: $PIDS_LIMIT"

# ⛔ ConfigMap kubelet-config là NGUỒN, file trên đĩa chỉ là bản render.
# `kubeadm upgrade node` ghi đè /var/lib/kubelet/config.yaml TỪ ConfigMap này.
# Sửa mỗi file trên đĩa = bản vá biến mất im lặng ở lần nâng version kế tiếp, và
# fork-bomb quay lại mà không ai đổi gì cả.
step "4b/6 Đồng bộ ConfigMap kubelet-config (nếu chỉ sửa file, kubeadm upgrade sẽ xoá)"
if kubectl -n kube-system get cm kubelet-config >/dev/null 2>&1; then
  CM="$(kubectl -n kube-system get cm kubelet-config -o jsonpath='{.data.kubelet}')"
  if printf '%s' "$CM" | grep -qE '^podPidsLimit:'; then
    NEWCM="$(printf '%s' "$CM" | sed -E "s/^podPidsLimit:.*/podPidsLimit: ${PIDS_LIMIT}/")"
  else
    NEWCM="$(printf '%s\npodPidsLimit: %s\n' "$CM" "$PIDS_LIMIT")"
  fi
  kubectl -n kube-system create cm kubelet-config --from-literal=kubelet="$NEWCM" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  ok "ConfigMap kubelet-config đã đồng bộ"
else
  warn "không thấy cm/kubelet-config — bản vá chỉ nằm trên đĩa, kiểm lại sau mỗi kubeadm upgrade"
fi

step "5/6 Restart kubelet (bounce toàn bộ pod trên node 1-node này)"
systemctl restart kubelet
printf '    chờ node Ready (tối đa 300s)...\n'
kubectl wait --for=condition=Ready node --all --timeout=300s \
  || die "Node KHÔNG Ready sau restart. Khôi phục:
     cp -a $BACKUP $KUBELET_CONF && systemctl restart kubelet
     Chẩn đoán: journalctl -u kubelet -n 120 --no-pager"
ok "node Ready"

# ------------------------------------------------------------------ 6. Chứng minh
step "6/6 Canary SAU + đo pids.max trên pod THẬT"
if [ "$SKIP_CANARY" != "1" ]; then
  canary "SAU" "sau" || die "Canary ĐỎ ngay sau restart kubelet, trong khi canary TRƯỚC đã xanh.
     Bản vá này là nghi phạm số một. Khôi phục:
     cp -a $BACKUP $KUBELET_CONF && systemctl restart kubelet"
fi

# ⛔ HAI CÁCH ĐO SAI ĐÃ THỬ VÀ LOẠI, ghi lại để không ai quay lại chúng:
#
#  (a) `kubectl run --image=busybox` — cụm side-load image, KHÔNG pull được
#      (ghcr private, `pullPolicy: Never`). Probe treo ở ImagePullBackOff rồi
#      timeout, và cái timeout đó trông y hệt "bản vá thất bại".
#  (b) `kubectl exec <pod> -- cat /sys/fs/cgroup/pids.max` — ĐO SAI CHỖ. Sysbox
#      ảo hoá `/sys/fs/cgroup` trong container, nên pod nhìn thấy cgroup-namespace
#      root của chính nó (một cgroup con được uỷ quyền, chưa đặt trần) và luôn
#      trả **`max`**, kể cả khi kubelet đã áp đúng. Đo được 2026-08-11: trong pod
#      = `max`, cgroup của pod trên host = `4096`, `pids.events` = `max 5`.
#      Kiểm ở đó là dựng một AC KHÔNG BAO GIỜ XANH ĐƯỢC — cùng họ với AC
#      "runtime có drop ALL" mà D-17′ đã bỏ.
#
# Điểm thực thi thật là slice của pod TRÊN HOST. Hai vế dưới đây đo đúng nó.
step "6a/6 kubelet có thật sự NẠP giá trị không (lời khai của chính kubelet)"
if journalctl -u kubelet --since "-5min" --no-pager 2>/dev/null \
     | grep -q "\"PodPidsLimit\":${PIDS_LIMIT}"; then
  ok "kubelet báo cáo PodPidsLimit=$PIDS_LIMIT trong Container Manager config"
else
  warn "không thấy dòng Container Manager trong journal 5 phút qua — kiểm vế 6b là đủ kết luận"
fi

step "6b/6 cgroup của một pod SINH RA SAU restart (điểm thực thi thật)"
# Pod ấm hiện có được tạo TRƯỚC restart nên cgroup của nó mang trần cũ. Đợi
# warm-pool dựng pod mới thay vì tự tạo probe: nó dùng đúng image đã side-load.
NEWPOD=""
for _ in $(seq 1 30); do
  NEWPOD="$(kubectl get pods -n dlp-sandbox -l app=sandbox \
    --sort-by=.status.startTime -o jsonpath='{.items[-1:].metadata.name}' 2>/dev/null)"
  [ -n "$NEWPOD" ] && [ "$(kubectl get pod -n dlp-sandbox "$NEWPOD" -o jsonpath='{.status.phase}')" = "Running" ] && break
  sleep 5
done
if [ -z "$NEWPOD" ]; then
  warn "chưa có pod sandbox nào Running để đo. Chạy sau khi warm-pool dựng pod:
      sudo bash $0   (script idempotent, nhánh 0/6 sẽ đo lại)"
else
  PODUID="$(kubectl get pod -n dlp-sandbox "$NEWPOD" -o jsonpath='{.metadata.uid}')"
  SLICE="$(find /sys/fs/cgroup -maxdepth 4 -type d -name "*${PODUID//-/_}*" 2>/dev/null | head -1)"
  if [ -n "$SLICE" ] && [ -r "$SLICE/pids.max" ]; then
    HOSTMAX="$(cat "$SLICE/pids.max")"
    [ "$HOSTMAX" = "max" ] && die "cgroup host của pod $NEWPOD vẫn 'max' — kubelet KHÔNG áp podPidsLimit.
     Kiểm: journalctl -u kubelet -n 80 --no-pager | grep -i pidslimit"
    ok "pod $NEWPOD: cgroup HOST pids.max = $HOSTMAX"
    printf '    \033[2m· quan sát\033[0m  trong pod thì `cat /sys/fs/cgroup/pids.max` = %s — Sysbox ảo hoá, ĐỪNG kiểm ở đó\n' \
      "$(kubectl exec -n dlp-sandbox "$NEWPOD" -- cat /sys/fs/cgroup/pids.max 2>/dev/null | tr -d '\r')"
  else
    warn "không tìm được cgroup slice của $NEWPOD — 'không đo được' KHÔNG phải 'đạt'"
  fi
fi

printf '\n\033[1;32mD-19′ xong.\033[0m podPidsLimit=%s, backup ở %s\n' "$PIDS_LIMIT" "$BACKUP"
printf 'Pod ấm CŨ vẫn mang trần cũ — xoá chúng cho warm-pool dựng lại:\n'
printf '  kubectl -n dlp-sandbox delete pod -l app=sandbox\n'
printf '(reaper tầng 4 sẽ tự rút tên khỏi pool:free, warm-pool replenish trong ~5s)\n\n'
