#!/usr/bin/env bash
# 02-kubeadm-init.sh — Dựng cluster kubeadm single-node (control-plane kiêm worker).
# Idempotent: nếu cluster đã có thì bỏ qua init.
#
# Single-node là ĐÚNG cho dev/NCKH. Khi lên cloud multi-node, chạy script này trên
# control-plane rồi dùng lệnh `kubeadm join` nó in ra cho các worker.

set -euo pipefail

# CỐ Ý KHÔNG dùng 192.168.0.0/16 (mặc định của Calico): nó chồng lấn dải LAN/NAT phổ biến nhất
# (VMware NAT 192.168.x.0/24, router gia đình 192.168.1.0/24). Chồng lấn ⇒ Calico coi gateway là
# "trong pool" nên KHÔNG SNAT gói đi tới đó ⇒ pod mất đường tới gateway, DNS treo i/o timeout,
# trong khi ra internet (ngoài pool) vẫn chạy — triệu chứng cực khó truy.
POD_CIDR="${POD_CIDR:-10.244.0.0/16}"
CALICO_VERSION="${CALICO_VERSION:-v3.30.0}"
SINGLE_NODE="${SINGLE_NODE:-true}"       # true => gỡ taint control-plane để pod chạy được

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()  { printf '    \033[32m✔\033[0m %s\n' "$*"; }
die() { printf '\n\033[31mLỖI: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Chạy bằng root: sudo bash $0"
command -v kubeadm >/dev/null || die "Chưa có kubeadm. Chạy 01-node-prereqs.sh trước."

TARGET_USER="${SUDO_USER:-root}"
TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
[ -n "$TARGET_HOME" ] || die "Không xác định được home của $TARGET_USER"

# ------------------------------------------------------------------ 0. Cổng chặn chồng lấn CIDR
ip_to_int() { local IFS=. a b c d; read -r a b c d <<<"$1"; printf '%d' $(( (a<<24)|(b<<16)|(c<<8)|d )); }
cidr_overlap() {   # $1 $2 = a.b.c.d/len — trùng nhau khi cùng prefix ở độ dài NGẮN hơn
  local i1 i2 m mask
  i1="$(ip_to_int "${1%/*}")"; i2="$(ip_to_int "${2%/*}")"
  m=$(( ${1#*/} < ${2#*/} ? ${1#*/} : ${2#*/} ))
  mask=$(( m == 0 ? 0 : (0xFFFFFFFF << (32 - m)) & 0xFFFFFFFF ))
  [ $(( i1 & mask )) -eq $(( i2 & mask )) ]
}

log "0/4 Kiểm tra POD_CIDR không chồng lấn mạng của host"
CLASH=""
while read -r hostcidr; do
  [ -n "$hostcidr" ] || continue
  cidr_overlap "$POD_CIDR" "$hostcidr" && CLASH="$CLASH $hostcidr"
done < <(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}')

if [ -n "$CLASH" ] && [ ! -f /etc/kubernetes/admin.conf ]; then
  die "POD_CIDR=$POD_CIDR chồng lấn mạng của host:$CLASH

     Calico KHÔNG SNAT gói đi tới địa chỉ nằm trong pool của chính nó. Gateway/host nằm trong
     dải pod ⇒ pod gửi đi được mà không có đường về: DNS treo 'i/o timeout', kéo image fail,
     trong khi ping 1.1.1.1 (ngoài pool) vẫn chạy bình thường.

     Chọn dải KHÔNG đụng mạng nào ở trên. Gợi ý theo môi trường:
       LAN/NAT 192.168.x  ->  POD_CIDR=10.244.0.0/16
       VPC cloud 10.x     ->  POD_CIDR=172.20.0.0/16
       cả hai đều đụng    ->  POD_CIDR=100.64.0.0/16   (dải CGNAT, gần như không ai dùng)

     Chạy lại:  POD_CIDR=<dải bạn chọn> sudo -E bash $0"
elif [ -n "$CLASH" ]; then
  printf '    \033[33m!\033[0m POD_CIDR=%s chồng lấn%s — cluster đã dựng rồi nên chỉ cảnh báo.\n' "$POD_CIDR" "$CLASH"
  printf '      Pod sẽ KHÔNG với tới được host/gateway. Dựng lại với POD_CIDR khác là cách sửa gốc.\n'
else
  ok "$POD_CIDR không đụng mạng nào của host"
fi

# ------------------------------------------------------------------ 1. kubeadm init
log "1/4 kubeadm init (pod-network-cidr=$POD_CIDR)"
if [ -f /etc/kubernetes/admin.conf ]; then
  ok "cluster đã tồn tại — bỏ qua init"
else
  kubeadm init \
    --pod-network-cidr="$POD_CIDR" \
    --cri-socket=unix:///run/containerd/containerd.sock \
    | tee /var/log/kubeadm-init.log
  ok "init xong, log ở /var/log/kubeadm-init.log"
  printf '    \033[33mi\033[0m Lệnh `kubeadm join` cho worker nằm ở cuối file log trên.\n'
fi

# ------------------------------------------------------------------ 2. kubeconfig
log "2/4 Cấp kubeconfig cho $TARGET_USER và root"
install -d -m 0700 -o "$TARGET_USER" -g "$TARGET_USER" "$TARGET_HOME/.kube"
install -m 0600 -o "$TARGET_USER" -g "$TARGET_USER" /etc/kubernetes/admin.conf "$TARGET_HOME/.kube/config"
install -d -m 0700 /root/.kube
install -m 0600 /etc/kubernetes/admin.conf /root/.kube/config
export KUBECONFIG=/etc/kubernetes/admin.conf
ok "$TARGET_HOME/.kube/config"

# ------------------------------------------------------------------ 3. CNI
log "3/4 Cài CNI (Calico $CALICO_VERSION)"
if kubectl get daemonset -n kube-system calico-node >/dev/null 2>&1; then
  ok "Calico đã có — bỏ qua"
else
  kubectl apply -f "https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION}/manifests/calico.yaml"
  ok "đã apply Calico"
fi

printf '    chờ node Ready (tối đa 300s)...\n'
kubectl wait --for=condition=Ready node --all --timeout=300s \
  || die "Node không Ready. Xem: kubectl describe node ; journalctl -u kubelet -n 80"
ok "node Ready"

# ------------------------------------------------------------------ 4. Single-node untaint
log "4/4 Cấu hình single-node"
if [ "$SINGLE_NODE" = "true" ]; then
  kubectl taint nodes --all node-role.kubernetes.io/control-plane- 2>/dev/null \
    && ok "đã gỡ taint control-plane (pod chạy được trên node này)" \
    || ok "taint đã gỡ từ trước"
else
  ok "SINGLE_NODE=false — giữ taint, dùng worker riêng"
fi

log "Trạng thái cluster"
kubectl get nodes -o wide
kubectl get pods -A --no-headers | awk '{print $4}' | sort | uniq -c

printf '\n\033[32mXong 02.\033[0m Bước tiếp: bash 03-sysbox-install.sh\n\n'
