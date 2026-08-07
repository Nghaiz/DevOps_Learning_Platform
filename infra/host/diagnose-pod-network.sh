#!/usr/bin/env bash
# diagnose-pod-network.sh — Định vị chính xác DNS/egress của pod hỏng ở TẦNG NÀO.
# Chỉ đọc, không sửa gì. Tạo đúng MỘT pod busybox tạm rồi xoá.
#
# Cây quyết định — đọc kết quả theo thứ tự:
#
#   Test 3 (pod → 192.168.94.2 trực tiếp) HỎNG  →  pod không ra nổi mạng ngoài.
#       Lỗi ở CNI/masquerade (Calico natOutgoing), KHÔNG phải CoreDNS. Sửa CoreDNS vô ích.
#   Test 3 OK nhưng Test 1 (qua ClusterIP 10.96.0.10) hỏng, Test 2 (qua pod IP) OK
#                                              →  kube-proxy/iptables không định tuyến ClusterIP.
#   Test 2 và 3 OK nhưng Test 1 hỏng           →  Service kube-dns trỏ sai endpoint.
#   Test 3 hỏng nhưng Test 4 (1.1.1.1) OK      →  riêng DNS proxy của VMware NAT từ chối dải pod.
#                                                 Ghim upstream công cộng là xong.
#   Tất cả OK                                  →  lúc thăm dò trước CoreDNS chưa kịp Ready. Thử lại.

set -uo pipefail

PROBE_HOST="${PROBE_HOST:-registry-1.docker.io}"
IMAGE="${IMAGE:-busybox:1.36}"

ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✘\033[0m %s\n' "$*"; }
log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die()  { printf '\n\033[31mLỖI: %s\033[0m\n' "$*" >&2; exit 1; }

command -v kubectl >/dev/null || die "Không có kubectl."

# ------------------------------------------------------------------ 1. Thu thập địa chỉ
log "1/4 Địa chỉ cần cho phép thử"
COREDNS_IP="$(kubectl -n kube-system get pods -l k8s-app=kube-dns \
  -o jsonpath='{.items[0].status.podIP}' 2>/dev/null)"
[ -n "$COREDNS_IP" ] || die "Không lấy được pod IP của CoreDNS — CoreDNS có đang chạy không?"
GW="$(ip route 2>/dev/null | awk '/^default/{print $3; exit}')"
HOSTIP="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1)"
ok "CoreDNS pod IP : $COREDNS_IP"
ok "gateway        : ${GW:-(không xác định)}"
ok "host IP        : ${HOSTIP:-(không xác định)}"

log "2/4 Trạng thái CoreDNS"
kubectl -n kube-system get pods -l k8s-app=kube-dns -o wide --no-headers 2>/dev/null | sed 's/^/    /'
printf '\n    Endpoints của Service kube-dns:\n'
kubectl -n kube-system get endpointslices -l kubernetes.io/service-name=kube-dns \
  -o jsonpath='{range .items[*]}{.endpoints[*].addresses[*]}{"\n"}{end}' 2>/dev/null | sed 's/^/      /'
printf '\n    Corefile — dòng forward:\n'
kubectl -n kube-system get cm coredns -o jsonpath='{.data.Corefile}' 2>/dev/null \
  | grep -E 'forward' | sed 's/^/      /'
printf '\n    Log CoreDNS (25 dòng cuối):\n'
kubectl -n kube-system logs -l k8s-app=kube-dns --tail=25 2>/dev/null | sed 's/^/      /'

# Calico natOutgoing=false ⇒ traffic pod ra ngoài không được SNAT ⇒ không có đường về.
log "3/4 Calico IPPool (natOutgoing phải là true)"
if kubectl get ippools.crd.projectcalico.org -o jsonpath='{range .items[*]}{.metadata.name}{"  cidr="}{.spec.cidr}{"  natOutgoing="}{.spec.natOutgoing}{"\n"}{end}' 2>/dev/null | grep -q .; then
  kubectl get ippools.crd.projectcalico.org \
    -o jsonpath='{range .items[*]}{.metadata.name}{"  cidr="}{.spec.cidr}{"  natOutgoing="}{.spec.natOutgoing}{"\n"}{end}' 2>/dev/null \
    | sed 's/^/    /'
else
  bad "không đọc được IPPool của Calico"
fi

# ------------------------------------------------------------------ 4. Phép thử trong pod
log "4/4 Phép thử từ TRONG một pod (image $IMAGE)"
kubectl delete pod net-probe --ignore-not-found >/dev/null 2>&1

kubectl run net-probe --rm -i --restart=Never --timeout=180s --image="$IMAGE" \
  --command -- sh -c "
echo '--- Test 1: DNS qua ClusterIP CoreDNS (10.96.0.10) ---'
nslookup ${PROBE_HOST} 10.96.0.10 2>&1 | tail -5
echo
echo '--- Test 2: DNS qua pod IP CoreDNS trực tiếp (${COREDNS_IP}) — bỏ qua kube-proxy ---'
nslookup ${PROBE_HOST} ${COREDNS_IP} 2>&1 | tail -5
echo
echo '--- Test 3: DNS thẳng tới gateway/upstream (${GW:-192.168.94.2}) — bỏ qua CoreDNS ---'
nslookup ${PROBE_HOST} ${GW:-192.168.94.2} 2>&1 | tail -5
echo
echo '--- Test 4: DNS thẳng tới 1.1.1.1 — chứng minh pod có ra được internet không ---'
nslookup ${PROBE_HOST} 1.1.1.1 2>&1 | tail -5
echo
echo '--- Test 5: tên nội bộ cluster (phải luôn chạy được) ---'
nslookup kubernetes.default.svc.cluster.local 10.96.0.10 2>&1 | tail -5
echo
echo '--- Test 6: ping gateway ${GW:-192.168.94.2} ---'
ping -c2 -W2 ${GW:-192.168.94.2} 2>&1 | tail -3
echo
echo '--- Test 7: ping 1.1.1.1 (ICMP ra internet) ---'
ping -c2 -W2 1.1.1.1 2>&1 | tail -3
echo
echo '--- Test 8: resolv.conf mà kubelet cấp cho pod ---'
cat /etc/resolv.conf
" 2>&1 | sed 's/^/    /'

kubectl delete pod net-probe --ignore-not-found >/dev/null 2>&1

printf '\n\033[1mĐọc kết quả:\033[0m xem cây quyết định ở đầu file này (head -20 %s)\n\n' "$0"
