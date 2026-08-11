#!/usr/bin/env bash
# 04-verify-sysbox.sh — CỔNG P0.F "Sysbox proof".
# Chạy đúng các acceptance criteria bảo mật trong plans/devops-learning-platform/phase-1.md §1.D.
# Không pass hết => KHÔNG được mở P1. Đây là bằng chứng, không phải "chắc là chạy được".
#
# Dọn sạch pod test khi xong (kể cả khi fail), trừ khi KEEP=1.

set -uo pipefail

NS="${NS:-sysbox-proof}"
POD="${POD:-sysbox-proof}"
IMAGE="${IMAGE:-nestybox/ubuntu-noble-systemd-docker}"
KEEP="${KEEP:-0}"

PASS=0; FAIL=0
ok()   { printf '  \033[32m✔ PASS\033[0m  %s\n' "$*"; PASS=$((PASS+1)); }
no()   { printf '  \033[31m✘ FAIL\033[0m  %s\n' "$*"; FAIL=$((FAIL+1)); }
log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

cleanup() {
  [ "$KEEP" = "1" ] && { printf '\nKEEP=1 → giữ lại ns/%s để bạn tự nghịch.\n' "$NS"; return; }
  kubectl delete ns "$NS" --wait=false >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "Tạo pod Sysbox thử nghiệm"
kubectl create ns "$NS" >/dev/null 2>&1 || true

# ServiceAccount "default" do kube-controller-manager tạo BẤT ĐỒNG BỘ sau khi namespace ra đời.
# Apply pod ngay lập tức => admission chặn: 'error looking up service account NS/default'.
# Phải chờ SA có thật rồi mới apply.
printf '    chờ ServiceAccount "default" của ns/%s (tối đa 60s)...\n' "$NS"
for _ in $(seq 1 60); do
  kubectl get -n "$NS" serviceaccount default >/dev/null 2>&1 && break
  sleep 1
done
if ! kubectl get -n "$NS" serviceaccount default >/dev/null 2>&1; then
  printf '\n\033[31mns/%s vẫn không có ServiceAccount "default" sau 60s.\033[0m\n' "$NS"
  printf 'kube-controller-manager nhiều khả năng chưa chạy. Kiểm tra:\n'
  printf '  kubectl -n kube-system get pods -l component=kube-controller-manager\n\n'
  exit 1
fi

# hostUsers:false + runtimeClassName là 2 thứ BẮT BUỘC (theo docs Sysbox v0.7.x).
# securityContext ở đây khớp đúng phase-1 §1.D: no-priv, drop ALL, seccomp RuntimeDefault.
MANIFEST="$(cat <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: $POD
  annotations:
    io.kubernetes.cri-o.userns-mode: "auto:size=65536"
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
      capabilities:
        drop: ["ALL"]
      seccompProfile:
        type: RuntimeDefault
    resources:
      limits:   { cpu: "2", memory: "2Gi" }
      requests: { cpu: "500m", memory: "512Mi" }
EOF
)"

# Không kiểm exit code của apply => pod chưa từng được tạo mà script vẫn chạy tiếp,
# rồi báo nhầm "pod not found" ở bước chẩn đoán. Fail ngay tại đây, in đúng lỗi gốc.
if ! APPLY_OUT="$(printf '%s\n' "$MANIFEST" | kubectl apply -n "$NS" -f - 2>&1)"; then
  printf '\n\033[31mTạo pod thất bại — lỗi gốc từ API server:\033[0m\n%s\n\n' "$APPLY_OUT"
  exit 1
fi

printf '    chờ pod Running (tối đa 300s)...\n'
if ! kubectl wait -n "$NS" --for=condition=Ready "pod/$POD" --timeout=300s >/dev/null 2>&1; then
  printf '\n\033[31mPod không lên được. Chẩn đoán:\033[0m\n'
  if kubectl get -n "$NS" "pod/$POD" >/dev/null 2>&1; then
    DESC="$(kubectl describe -n "$NS" "pod/$POD")"
    printf '%s\n' "$DESC" | tail -40
    # Lỗi hay gặp nhất trên containerd 2.x: RuntimeClass có trong k8s nhưng CRI không có handler.
    if printf '%s' "$DESC" | grep -qE 'handler "sysbox-runc" is not known|does not support user namespaces'; then
      printf '\n\033[33mĐây KHÔNG phải lỗi của pod.\033[0m containerd chưa đăng ký handler sysbox-runc.\n'
      printf 'Chẩn đoán + sửa:  bash %s/fix-containerd-handler.sh\n' "$(dirname "$0")"
    fi
  else
    printf 'Pod không tồn tại (bị admission chặn hoặc đã bị xoá). Events của ns/%s:\n' "$NS"
    kubectl get events -n "$NS" --sort-by=.lastTimestamp 2>/dev/null | tail -20
  fi
  exit 1
fi
printf '    pod Running.\n'

kexec() { kubectl exec -n "$NS" "$POD" -- "$@" 2>/dev/null; }

# ------------------------------------------------------------------
log "Kiểm chứng (phase-1 §1.D acceptance criteria)"

# 1. RuntimeClass
RC="$(kubectl get -n "$NS" pod "$POD" -o jsonpath='{.spec.runtimeClassName}')"
[ "$RC" = "sysbox-runc" ] && ok "runtimeClassName = sysbox-runc" || no "runtimeClassName = '$RC'"

# 2. Cái quan trọng nhất: root trong pod KHÔNG phải root trên host
UIDMAP="$(kexec cat /proc/self/uid_map | tr -s ' ' | sed 's/^ //')"
HOST_UID="$(printf '%s' "$UIDMAP" | awk '{print $2}')"
if [ -n "$HOST_UID" ] && [ "$HOST_UID" != "0" ]; then
  ok "user-namespace ĐANG hoạt động — root(0) trong pod map ra UID $HOST_UID trên host"
else
  no "uid_map = '$UIDMAP' → root trong pod VẪN là root host. Sysbox KHÔNG cách ly. Blocker."
fi

# 3. Không mount hostPath (luật 10)
#
# ⛔ D-22′ — BẢN CŨ KIỂM SAI THỨ, VÀ NÓ XANH VÌ MAY CHỨ KHÔNG VÌ ĐÚNG.
# Cũ: `test -e /var/run/docker.sock` kỳ vọng "không tồn tại". Nhưng image này là
# image DinD — socket đó là của dockerd *bên trong* pod (Sysbox), và nó XUẤT HIỆN
# ngay khi dockerd lên. Check cũ chỉ xanh vì nó chạy TRƯỚC bước 7 (bước chờ
# dockerd tới 90s); đảo thứ tự hai bước là cổng đỏ mà không có gì thay đổi về
# bảo mật. Tức nó đo một cuộc đua, không đo một tính chất.
# Thứ luật 10 thật sự cấm là mount socket CỦA HOST vào pod — và đó là một
# `hostPath` volume, đọc được từ spec, không phụ thuộc thời điểm. VAP validation
# #8 (`platform-sandbox-isolation`) đã ép điều này ở admission; đây là phép đo
# độc lập xác nhận nó có hiệu lực.
HOSTPATHS="$(kubectl get -n "$NS" pod "$POD" -o jsonpath='{.spec.volumes[*].hostPath.path}')"
if [ -z "$HOSTPATHS" ]; then
  ok "không có hostPath volume nào (⇒ không có đường mount docker.sock của host)"
else
  no "pod có hostPath volume: '$HOSTPATHS' — vi phạm luật 10, đây là đường escape ra host"
fi

# 4. Trần PID mỗi pod (D-19′)
#
# ⛔ D-17′ — CHECK CŨ Ở CHỖ NÀY LÀ TAUTOLOGY, ĐÃ BỎ.
# Cũ: đọc `.spec.containers[0].securityContext.capabilities.drop[0]` và so với
# "ALL" — nhưng CHÍNH SCRIPT NÀY vừa ghi field đó trong $MANIFEST ở trên. Nó
# không thể đỏ, nên nó không kiểm gì cả.
# Sự thật đo được trên pod thật: `CapEff = CapBnd = 000001ffffffffff` (đủ 41 cap)
# DÙ spec có `drop: [ALL]` — Sysbox bỏ qua field đó ở runtime. Giữ `drop:[ALL]`
# trong spec là phòng thủ chiều sâu (ngày `runtimeClassName` rơi mất thì pod chạy
# runc thường và field này mới có tác dụng), nhưng khẳng định "runtime đã drop"
# là SAI. Tính chất cách ly thật nằm ở check #2 (`uid_map` offset ≠ 0), thứ đỏ
# được nếu user-namespace không hoạt động.
# Chỗ này thay bằng một phép đo runtime KHÁC ĐỎ ĐƯỢC và trước đây không ai gác:
# trần PID. `max` nghĩa là một fork-bomb trong pod sinh viên hạ cả node 1-node.
# ⛔ ĐỌC TỪ HOST, KHÔNG ĐỌC TỪ TRONG POD — và đây là cùng một cái bẫy với
# `drop:[ALL]` ở trên, chỉ khác chỗ nó cắn.
# Đo được 2026-08-11 trên cụm: `kubectl exec -- cat /sys/fs/cgroup/pids.max`
# trả **`max`** trong khi kubelet ĐÃ áp `podPidsLimit: 4096` và cgroup của pod
# trên host đọc đúng `4096`. Sysbox ảo hoá `/sys/fs/cgroup` trong container: pod
# nhìn thấy cgroup-namespace root của chính nó (một cgroup con được uỷ quyền,
# chưa đặt trần) chứ không thấy slice mà kubelet ép. Trần của tổ tiên VẪN có
# hiệu lực — nhưng nó vô hình với mọi phép đo từ bên trong.
# Kiểm bằng lệnh trong pod là AC KHÔNG BAO GIỜ XANH ĐƯỢC dù cấu hình hoàn toàn
# đúng, đúng loại tautology-ngược mà D-17′ vừa dọn ở check #4 cũ.
PODUID="$(kubectl get -n "$NS" pod "$POD" -o jsonpath='{.metadata.uid}')"
SLICE=""
for base in /sys/fs/cgroup/kubepods.slice/kubepods-burstable.slice \
            /sys/fs/cgroup/kubepods.slice/kubepods-besteffort.slice \
            /sys/fs/cgroup/kubepods.slice; do
  cand="$base/kubepods-burstable-pod${PODUID//-/_}.slice"
  [ -f "$cand/pids.max" ] && { SLICE="$cand"; break; }
  cand="$base/kubepods-pod${PODUID//-/_}.slice"
  [ -f "$cand/pids.max" ] && { SLICE="$cand"; break; }
done
[ -z "$SLICE" ] && SLICE="$(find /sys/fs/cgroup -maxdepth 4 -type d -name "*${PODUID//-/_}*" 2>/dev/null | head -1)"

if [ -n "$SLICE" ] && [ -r "$SLICE/pids.max" ]; then
  PIDSMAX="$(cat "$SLICE/pids.max" 2>/dev/null | tr -d '\r')"
  if [ -n "$PIDSMAX" ] && [ "$PIDSMAX" != "max" ]; then
    ok "trần PID mỗi pod = $PIDSMAX (D-19′, đọc ở cgroup HOST — điểm thực thi thật)"
    printf '  \033[2m· quan sát\033[0m  trong pod thì `cat /sys/fs/cgroup/pids.max` = %s (Sysbox ảo hoá — ĐỪNG kiểm ở đó)\n' \
      "$(kexec cat /sys/fs/cgroup/pids.max | tr -d '\r')"
  else
    no "cgroup host của pod có pids.max='$PIDSMAX' → KHÔNG có trần PID; fork-bomb hạ được node.
          Vá: sudo bash $(dirname "$0")/06-kubelet-pids-limit.sh"
  fi
else
  no "không tìm được cgroup slice của pod (uid=$PODUID) → KHÔNG kết luận được về trần PID.
          Script này phải chạy TRÊN NODE. Không đổi mục này thành PASS: 'không đo được' ≠ 'đạt'."
fi

# Quan sát, KHÔNG phải cổng: in ra sự thật về capability để không ai đọc
# `drop:[ALL]` trong spec rồi tin rằng runtime đã drop. Xem D-17′.
CAPEFF="$(kexec grep -E '^CapEff:' /proc/self/status | awk '{print $2}')"
printf '  \033[2m· quan sát\033[0m  CapEff runtime = %s (Sysbox bỏ qua drop:[ALL] — D-17′; cách ly thật là user-ns ở check #2)\n' "${CAPEFF:-?}"

# 5. Không privileged
PRIV="$(kubectl get -n "$NS" pod "$POD" -o jsonpath='{.spec.containers[0].securityContext.privileged}')"
[ "$PRIV" != "true" ] && ok "privileged = false" || no "pod đang PRIVILEGED"

# 6. seccomp
SEC="$(kubectl get -n "$NS" pod "$POD" -o jsonpath='{.spec.containers[0].securityContext.seccompProfile.type}')"
[ "$SEC" = "RuntimeDefault" ] && ok "seccompProfile = RuntimeDefault" || no "seccompProfile = '$SEC'"

# 7. LÝ DO DÙNG SYSBOX: docker-in-docker thật, không cần privileged
log "Docker-in-Docker (đây là lý do cả dự án chọn Sysbox)"
printf '    chờ systemd + dockerd trong pod khởi động (tối đa 90s)...\n'
DIND=0
for _ in $(seq 1 18); do
  if kexec docker info >/dev/null 2>&1; then DIND=1; break; fi
  sleep 5
done
if [ "$DIND" = "1" ]; then
  # ⛔ D4 — `docker run hello-world` LÀ PHÉP THỬ SAI, ĐÃ BỎ.
  # Nó phải KÉO image từ Docker Hub, mà NetworkPolicy default-deny của
  # `dlp-sandbox` (luật 10) chặn đúng đường đó. Giữ nó nghĩa là hoặc cổng đỏ trên
  # một nền tảng đang chạy ĐÚNG, hoặc phải nới NetworkPolicy để cổng xanh — tức
  # phép thử ép ta phá chính thứ nó đang gác. Ở ns `sysbox-proof` này chưa có
  # NetworkPolicy nên nó "xanh", và đó là lý do lỗi thiết kế sống sót tới giờ.
  #
  # Thứ AC thật sự muốn kiểm là: **dockerd chạy được trong pod KHÔNG-privileged,
  # và làm được việc mà không cần mạng.** `FROM scratch` không kéo gì cả.
  # KHÔNG dùng kexec: nó nuốt stderr, mà toàn bộ lỗi của docker nằm ở stderr.
  BOUT="$(kubectl exec -n "$NS" "$POD" -- sh -c \
    'set -e; mkdir -p /tmp/dind-offline; printf "FROM scratch\n" > /tmp/dind-offline/Dockerfile;
     docker build -q -t dlp-offline-proof /tmp/dind-offline && docker images -q dlp-offline-proof' 2>&1)"
  if printf '%s' "$BOUT" | tail -1 | grep -qE '^[0-9a-f]{12,}$'; then
    ok "docker build 'FROM scratch' THÀNH CÔNG trong pod không-privileged — không chạm mạng (D4)"
  else
    no "dockerd sống nhưng 'docker build FROM scratch' fail. Output thật:"
    printf '%s\n' "$BOUT" | tail -25 | sed 's/^/          /'
    printf '\n          --- bối cảnh trong pod ---\n'
    kubectl exec -n "$NS" "$POD" -- docker info 2>&1 \
      | grep -iE 'storage driver|cgroup|backing filesystem|server version|warning' \
      | sed 's/^/          /'
  fi

  # Vế `docker run` của AC: image `FROM scratch` KHÔNG có binary nào nên docker
  # từ chối với "no command specified" — và chính lỗi đó là bằng chứng: docker đã
  # phân giải image CỤC BỘ, không hề thử pull. Thứ phải đỏ ở đây là dấu vết của
  # một lượt ra mạng, không phải việc container có chạy được hay không.
  ROUT="$(kubectl exec -n "$NS" "$POD" -- docker run --rm dlp-offline-proof 2>&1 || true)"
  if printf '%s' "$ROUT" | grep -qiE 'unable to find image|pull access denied|dial tcp|lookup .* no such host|i/o timeout'; then
    no "'docker run' đã cố RA MẠNG cho một image có sẵn cục bộ — vế offline của D4 hỏng:"
    printf '%s\n' "$ROUT" | tail -10 | sed 's/^/          /'
  else
    ok "'docker run' phân giải image CỤC BỘ, không thử pull (D4 offline)"
  fi
  kubectl exec -n "$NS" "$POD" -- docker rmi -f dlp-offline-proof >/dev/null 2>&1 || true
else
  no "dockerd không lên trong 90s (image '$IMAGE' có thể không kèm docker; thử KEEP=1 rồi vào xem)"
fi

# 8. Metadata endpoint (khung NetworkPolicy — siết đủ ở P3)
log "Cloud metadata (NetworkPolicy đầy đủ làm ở P3, đây chỉ là baseline)"
# ⛔ BẢN CŨ XANH KHI CURL VẮNG MẶT. `kexec curl …` trả khác 0 vì hai lý do hoàn
# toàn khác nhau — "bị chặn" và "không có lệnh curl trong image" — rồi cả hai
# rơi vào nhánh `ok`. Một image không kèm curl sẽ làm check này báo "đã chặn"
# mà không ai từng gửi một gói nào. Phải tách hai ca trước khi kết luận.
if ! kexec sh -c 'command -v curl' >/dev/null 2>&1; then
  printf '  \033[33m! BỎ QUA\033[0m  image "%s" không có curl — KHÔNG kết luận được. (Bản cũ báo PASS ở đây.)\n' "$IMAGE"
elif kexec curl -s -m 3 http://169.254.169.254/ >/dev/null 2>&1; then
  # Vẫn WARN chứ không FAIL: pod này ở ns `sysbox-proof`, còn NetworkPolicy
  # default-deny chỉ phủ `dlp-sandbox`. Đỏ ở đây là đỏ vì sai namespace, không
  # vì sai cấu hình. AC thật của luật 10 đo trên pod trong `dlp-sandbox`.
  printf '  \033[33m! WARN\033[0m  vào được 169.254.169.254 từ ns/%s — bình thường, ns này KHÔNG có NetworkPolicy.\n' "$NS"
  printf '            AC thật đo trong dlp-sandbox: kubectl exec -n dlp-sandbox $POD -- curl -m 3 http://169.254.169.254/\n'
else
  ok "không vào được cloud metadata endpoint (curl CÓ trong image, và nó bị chặn)"
fi

# ------------------------------------------------------------------
log "Kết quả cổng P0.F"
printf '  %d pass, %d fail\n\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '\033[31mCỔNG ĐỎ — chưa được mở P1.\033[0m Chạy lại với KEEP=1 để giữ pod mà chẩn đoán.\n\n'
  exit 1
fi
printf '\033[32mCỔNG XANH — Sysbox proof đạt. P0.F đóng, mở được P1.\033[0m\n\n'
