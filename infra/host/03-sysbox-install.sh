#!/usr/bin/env bash
# 03-sysbox-install.sh — Cài Sysbox vào cluster qua daemonset chính chủ.
#
# Daemonset TỰ QUYẾT runtime (runtime_precheck() trong sysbox-deploy-k8s.sh):
#   SYSBOX_USE_CRIO=true          -> ép cài CRI-O
#   containerd >= 2.0.0 (trừ 2.0.1–2.0.4) -> dùng userns containerd, KHÔNG cài CRI-O  ← mặc định của ta
#   còn lại                        -> cài CRI-O (tarball, distro-agnostic) + reconfigure kubelet
#
# TRÊN DEBIAN: is_supported_distro() có nhánh [[ $distro =~ "debian" ]] nên KHÔNG in warning.
# Nếu bạn vẫn thấy "Warning: Sysbox is not officially supported..." thì get_host_distro()
# đọc được chuỗi lạ — không chặn (chỉ echo), nhưng đáng xem lại /etc/os-release.
#
# Ép CRI-O:  SYSBOX_USE_CRIO=true bash 03-sysbox-install.sh

set -euo pipefail

MANIFEST="${MANIFEST:-https://raw.githubusercontent.com/nestybox/sysbox/master/sysbox-k8s-manifests/sysbox-install.yaml}"
NODE="${NODE:-}"
SYSBOX_USE_CRIO="${SYSBOX_USE_CRIO:-}"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32m✔\033[0m %s\n' "$*"; }
info() { printf '    \033[33mi\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31mLỖI: %s\033[0m\n' "$*" >&2; exit 1; }

command -v kubectl >/dev/null || die "Chưa có kubectl. Chạy 02-kubeadm-init.sh trước."
kubectl get nodes >/dev/null 2>&1 || die "Không nói chuyện được với cluster. Kiểm tra \$KUBECONFIG."

# ------------------------------------------------------------------ 1. Cổng chặn version
log "1/6 Kiểm tra version K8s (đây là điều kiện die THẬT trong trình cài đặt)"
SRV="$(kubectl version -o json | jq -r '.serverVersion.gitVersion')"
MINOR="$(printf '%s' "$SRV" | sed -E 's/^v1\.([0-9]+).*/\1/')"
if [ "$MINOR" -lt 32 ] || [ "$MINOR" -gt 35 ]; then
  die "Cluster đang chạy $SRV — Sysbox chỉ hỗ trợ v1.32–v1.35.
     Cài lại node với: K8S_VERSION=v1.34 sudo bash 01-node-prereqs.sh"
fi
ok "$SRV — hợp lệ"

# ------------------------------------------------------------------ 2. Runtime hiện tại
log "2/6 Runtime hiện tại của node"
kubectl get nodes -o custom-columns='NODE:.metadata.name,RUNTIME:.status.nodeInfo.containerRuntimeVersion' --no-headers
if [ -n "$SYSBOX_USE_CRIO" ]; then
  info "SYSBOX_USE_CRIO=$SYSBOX_USE_CRIO → sẽ ÉP cài CRI-O"
fi

# ------------------------------------------------------------------ 3. Label node
log "3/6 Gắn nhãn node sysbox-install=yes"
if [ -z "$NODE" ]; then
  mapfile -t NODES < <(kubectl get nodes -o jsonpath='{.items[*].metadata.name}' | tr ' ' '\n')
else
  NODES=("$NODE")
fi
[ "${#NODES[@]}" -gt 0 ] || die "Không tìm thấy node nào"
for n in "${NODES[@]}"; do
  kubectl label node "$n" sysbox-install=yes --overwrite >/dev/null
  ok "$n"
done

# ------------------------------------------------------------------ 4. Apply daemonset
log "4/6 Apply sysbox-install daemonset"
kubectl apply -f "$MANIFEST"
ok "đã apply"

DS_NS="$(kubectl get daemonset -A -o jsonpath='{range .items[?(@.metadata.name=="sysbox-deploy-k8s")]}{.metadata.namespace}{end}')"
[ -n "$DS_NS" ] || die "Không tìm thấy daemonset sysbox-deploy-k8s sau khi apply."
ok "namespace: $DS_NS"

if [ -n "$SYSBOX_USE_CRIO" ]; then
  kubectl set env daemonset/sysbox-deploy-k8s -n "$DS_NS" "SYSBOX_USE_CRIO=$SYSBOX_USE_CRIO" >/dev/null
  ok "đã đặt SYSBOX_USE_CRIO=$SYSBOX_USE_CRIO (daemonset sẽ rollout lại)"
fi

# ------------------------------------------------------------------ 5. Chờ cài xong
log "5/6 Chờ daemonset cài xong"
info "Nếu daemonset chọn đường CRI-O, kubelet sẽ restart → node NotReady 30s–2 phút. Bình thường."
for i in $(seq 1 60); do
  if kubectl rollout status daemonset/sysbox-deploy-k8s -n "$DS_NS" --timeout=20s >/dev/null 2>&1; then
    ok "daemonset rollout xong"
    break
  fi
  printf '    ...chờ (%d/60)\n' "$i"
  sleep 10
  [ "$i" -lt 60 ] || die "Quá 10 phút. Log: kubectl logs -n $DS_NS ds/sysbox-deploy-k8s --tail=100"
done

# ------------------------------------------------------------------ 6. Xác minh
log "6/6 Xác minh"
for i in $(seq 1 30); do
  kubectl get runtimeclass sysbox-runc >/dev/null 2>&1 && break
  sleep 5
  [ "$i" -lt 30 ] || die "RuntimeClass 'sysbox-runc' không xuất hiện sau 150s.
     Log: kubectl logs -n $DS_NS ds/sysbox-deploy-k8s --tail=100"
done
ok "RuntimeClass sysbox-runc tồn tại"

kubectl wait --for=condition=Ready node --all --timeout=300s >/dev/null \
  || die "Node không trở lại Ready. Xem: kubectl describe node ; journalctl -u kubelet -n 80"
ok "node Ready"

# RuntimeClass là object của k8s; runtime handler là chuyện của CRI. HAI TẦNG KHÁC NHAU và trên
# containerd 2.x chúng hay lệch: trình cài Sysbox ghi section theo plugin ID đời 1.x
# (io.containerd.grpc.v1.cri), còn `containerd config default` của 2.x sinh file schema mới dùng
# ID khác ⇒ section bị bỏ qua im lặng. Bắt tại đây, không để bước 04 chết bằng thông báo
# khó hiểu 'the handler "sysbox-runc" is not known'.
if command -v containerd >/dev/null 2>&1; then
  if CTD_DUMP="$(sudo containerd config dump 2>/dev/null)"; then
    if printf '%s' "$CTD_DUMP" | grep -qF 'sysbox-runc'; then
      ok "containerd đã đăng ký runtime handler sysbox-runc"
    else
      die "RuntimeClass có, nhưng containerd KHÔNG đăng ký handler 'sysbox-runc'.
     Bước 04 sẽ chết với 'the handler \"sysbox-runc\" is not known'.
     Chẩn đoán + sửa: bash $(dirname "$0")/fix-containerd-handler.sh"
    fi
  else
    info "không đọc được 'containerd config dump' (thiếu sudo) — bỏ qua kiểm tra tầng CRI."
  fi
fi

log "Đường runtime mà daemonset đã chọn"
kubectl logs -n "$DS_NS" ds/sysbox-deploy-k8s --tail=200 2>/dev/null \
  | grep -iE 'will use|will install|detected containerd|not officially supported' | tail -10 \
  || info "(không đọc được log — xem tay: kubectl logs -n $DS_NS ds/sysbox-deploy-k8s)"
echo
kubectl get nodes -o custom-columns='NODE:.metadata.name,RUNTIME:.status.nodeInfo.containerRuntimeVersion' --no-headers

printf '\n\033[32mXong 03.\033[0m Bước tiếp — CỔNG P0.F: bash 04-verify-sysbox.sh\n\n'
