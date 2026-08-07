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

# 3. Không có docker.sock (luật 10)
if kexec test -e /var/run/docker.sock; then
  no "/var/run/docker.sock TỒN TẠI trong pod — vi phạm luật 10, escape ra host"
else
  ok "không mount docker.sock"
fi

# 4. Capabilities dropped
CAPS="$(kubectl get -n "$NS" pod "$POD" -o jsonpath='{.spec.containers[0].securityContext.capabilities.drop[0]}')"
[ "$CAPS" = "ALL" ] && ok "capabilities.drop = [ALL]" || no "capabilities.drop = '$CAPS'"

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
  # KHÔNG dùng kexec ở đây: nó nuốt stderr, mà toàn bộ lỗi của 'docker run' nằm ở stderr.
  DOUT="$(kubectl exec -n "$NS" "$POD" -- docker run --rm hello-world 2>&1)"
  if printf '%s' "$DOUT" | grep -q 'Hello from Docker'; then
    ok "chạy được 'docker run hello-world' BÊN TRONG pod không-privileged"
  else
    no "dockerd sống nhưng 'docker run' fail. Output thật:"
    printf '%s\n' "$DOUT" | tail -25 | sed 's/^/          /'
    printf '\n          --- bối cảnh trong pod ---\n'
    kubectl exec -n "$NS" "$POD" -- docker info 2>&1 \
      | grep -iE 'storage driver|cgroup|backing filesystem|server version|warning' \
      | sed 's/^/          /'
    kubectl exec -n "$NS" "$POD" -- sh -c 'getent hosts registry-1.docker.io || echo "DNS: KHÔNG phân giải được registry-1.docker.io"' 2>&1 \
      | sed 's/^/          /'
  fi
else
  no "dockerd không lên trong 90s (image '$IMAGE' có thể không kèm docker; thử KEEP=1 rồi vào xem)"
fi

# 8. Metadata endpoint (khung NetworkPolicy — siết đủ ở P3)
log "Cloud metadata (NetworkPolicy đầy đủ làm ở P3, đây chỉ là baseline)"
if kexec curl -s -m 3 http://169.254.169.254/ >/dev/null 2>&1; then
  printf '  \033[33m! WARN\033[0m  vào được 169.254.169.254 — cần NetworkPolicy deny (P1 task 20)\n'
else
  ok "không vào được cloud metadata endpoint"
fi

# ------------------------------------------------------------------
log "Kết quả cổng P0.F"
printf '  %d pass, %d fail\n\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '\033[31mCỔNG ĐỎ — chưa được mở P1.\033[0m Chạy lại với KEEP=1 để giữ pod mà chẩn đoán.\n\n'
  exit 1
fi
printf '\033[32mCỔNG XANH — Sysbox proof đạt. P0.F đóng, mở được P1.\033[0m\n\n'
