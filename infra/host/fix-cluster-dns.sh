#!/usr/bin/env bash
# fix-cluster-dns.sh — Chẩn đoán (và sửa) việc pod không phân giải được tên miền ngoài:
#
#   dial tcp: lookup registry-1.docker.io on 10.96.0.10:53: server misbehaving
#
# "server misbehaving" = CoreDNS TRẢ LỜI nhưng trả SERVFAIL. Tức là pod network + kube-proxy
# đều ổn, chỉ mỗi khâu CoreDNS chuyển tiếp truy vấn ra upstream là hỏng.
#
# NGUYÊN NHÂN THƯỜNG GẶP — Corefile mặc định của kubeadm có `forward . /etc/resolv.conf`, và
# file đó là resolv.conf mà KUBELET đưa vào pod CoreDNS. Nếu resolv.conf của host trỏ tới một
# stub resolver loopback (127.0.0.53 của systemd-resolved), thì bên trong container CoreDNS,
# 127.0.0.53 là chính nó — không ai nghe ở đó ⇒ mọi truy vấn ra ngoài đều SERVFAIL.
#
# Cách sửa: trỏ `forward .` thẳng vào nameserver THẬT mà host đang dùng.
#
# Mặc định chỉ ĐỌC. Sửa thật:            FIX=1 bash fix-cluster-dns.sh
# Chỉ định upstream tay:  UPSTREAM="1.1.1.1 8.8.8.8" FIX=1 bash fix-cluster-dns.sh

set -uo pipefail

FIX="${FIX:-0}"
UPSTREAM="${UPSTREAM:-}"
PROBE_HOST="${PROBE_HOST:-registry-1.docker.io}"

ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✘\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die()  { printf '\n\033[31mLỖI: %s\033[0m\n' "$*" >&2; exit 1; }

SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

command -v kubectl >/dev/null || die "Không có kubectl."
kubectl get nodes >/dev/null 2>&1 || die "Không nói chuyện được với cluster."

# ------------------------------------------------------------------ 1. DNS của host
log "1/5 DNS của host"
printf '    /etc/resolv.conf:\n'
grep -vE '^[[:space:]]*(#|$)' /etc/resolv.conf 2>/dev/null | sed 's/^/      /'

mapfile -t HOST_NS < <(grep -E '^[[:space:]]*nameserver' /etc/resolv.conf 2>/dev/null | awk '{print $2}')
REAL_NS=()
STUB=0
for ns in "${HOST_NS[@]:-}"; do
  [ -n "$ns" ] || continue
  case "$ns" in
    127.*|::1) STUB=1 ;;
    *) REAL_NS+=("$ns") ;;
  esac
done

if [ "$STUB" = "1" ]; then
  warn "resolv.conf trỏ tới stub loopback → bên trong pod CoreDNS đó là chính nó, không ai nghe."
  warn "  Đây gần như chắc chắn là nguyên nhân."
fi

# systemd-resolved giữ nameserver THẬT ở file riêng
if [ "${#REAL_NS[@]}" -eq 0 ] && [ -r /run/systemd/resolve/resolv.conf ]; then
  mapfile -t RESOLVED_NS < <(grep -E '^[[:space:]]*nameserver' /run/systemd/resolve/resolv.conf | awk '{print $2}')
  for ns in "${RESOLVED_NS[@]:-}"; do
    case "$ns" in 127.*|::1) ;; *) REAL_NS+=("$ns") ;; esac
  done
  [ "${#REAL_NS[@]}" -gt 0 ] && ok "lấy được nameserver thật từ /run/systemd/resolve/resolv.conf"
fi

if [ "${#REAL_NS[@]}" -gt 0 ]; then
  ok "nameserver thật: ${REAL_NS[*]}"
else
  bad "không tìm ra nameserver thật nào (chỉ có loopback)."
fi

systemctl is-active --quiet systemd-resolved 2>/dev/null \
  && warn "systemd-resolved đang chạy" \
  || ok "systemd-resolved không chạy"

# Host tự phân giải được không? Phân biệt "host hỏng DNS" với "chỉ CoreDNS hỏng".
if getent hosts "$PROBE_HOST" >/dev/null 2>&1; then
  ok "HOST phân giải được $PROBE_HOST ⇒ lỗi nằm ở CoreDNS, không phải mạng VM"
  HOST_DNS_OK=1
else
  bad "HOST cũng KHÔNG phân giải được $PROBE_HOST — hỏng từ tầng VM, sửa host trước."
  bad "  Kiểm tra: ip route ; cat /etc/resolv.conf ; ping -c2 ${REAL_NS[0]:-8.8.8.8}"
  HOST_DNS_OK=0
fi

# ------------------------------------------------------------------ 2. kubelet resolvConf
log "2/5 kubelet đưa resolv.conf nào vào pod"
KCFG=/var/lib/kubelet/config.yaml
if RESOLV_LINE="$($SUDO grep -E '^resolvConf:' "$KCFG" 2>/dev/null)"; then
  ok "$RESOLV_LINE"
else
  warn "kubelet không khai báo resolvConf → mặc định /etc/resolv.conf của host"
fi

# ------------------------------------------------------------------ 3. CoreDNS
log "3/5 CoreDNS"
kubectl -n kube-system get pods -l k8s-app=kube-dns \
  -o custom-columns='POD:.metadata.name,READY:.status.containerStatuses[0].ready,RESTARTS:.status.containerStatuses[0].restartCount,STATUS:.status.phase' \
  --no-headers 2>/dev/null | sed 's/^/    /'

READY_N="$(kubectl -n kube-system get pods -l k8s-app=kube-dns -o jsonpath='{.items[*].status.containerStatuses[0].ready}' 2>/dev/null | tr ' ' '\n' | grep -c true)"
[ "${READY_N:-0}" -gt 0 ] && ok "$READY_N pod CoreDNS Ready" || bad "không có pod CoreDNS nào Ready"

printf '\n    Log CoreDNS (30 dòng cuối):\n'
kubectl -n kube-system logs -l k8s-app=kube-dns --tail=30 2>/dev/null | tail -30 | sed 's/^/      /'

kubectl -n kube-system logs -l k8s-app=kube-dns --tail=200 2>/dev/null | grep -qi 'plugin/loop' \
  && bad "log có 'plugin/loop' — CoreDNS đang tự hỏi chính nó (đúng triệu chứng stub loopback)"

# ------------------------------------------------------------------ 4. Corefile
log "4/5 Corefile hiện tại"
COREFILE="$(kubectl -n kube-system get cm coredns -o jsonpath='{.data.Corefile}' 2>/dev/null)"
[ -n "$COREFILE" ] || die "Không đọc được ConfigMap coredns."
printf '%s\n' "$COREFILE" | grep -nE 'forward|health|loop' | sed 's/^/      /'

FWD_LINE="$(printf '%s\n' "$COREFILE" | grep -E '^[[:space:]]*forward[[:space:]]+\.' | head -1 | sed 's/^[[:space:]]*//')"
if printf '%s' "$FWD_LINE" | grep -q '/etc/resolv.conf'; then
  bad "forward trỏ vào /etc/resolv.conf — kế thừa đúng cái resolv.conf hỏng của host"
else
  ok "forward đã trỏ upstream tường minh: $FWD_LINE"
fi

# ------------------------------------------------------------------ 5. Sửa
log "5/5 Sửa"
if [ "$HOST_DNS_OK" = "0" ]; then
  die "Host chưa phân giải được thì sửa CoreDNS vô nghĩa. Sửa DNS của VM trước."
fi

if [ -z "$UPSTREAM" ]; then
  [ "${#REAL_NS[@]}" -gt 0 ] \
    || die "Không suy được upstream. Chỉ định tay: UPSTREAM=\"1.1.1.1 8.8.8.8\" FIX=1 bash $0"
  UPSTREAM="${REAL_NS[*]}"
fi
ok "upstream sẽ dùng: $UPSTREAM"

if [ "$FIX" != "1" ]; then
  printf '\n  Chưa sửa gì (chế độ chỉ-đọc). Chạy lệnh sau để sửa:\n\n'
  printf '    FIX=1 bash %s\n\n' "$0"
  printf '  Nó sẽ: backup ConfigMap coredns → đổi "forward . /etc/resolv.conf" thành\n'
  printf '         "forward . %s" → rollout lại CoreDNS → thử phân giải lại.\n\n' "$UPSTREAM"
  exit 1
fi

BAK="${TMPDIR:-/tmp}/coredns-cm.bak.$(date +%s).yaml"
kubectl -n kube-system get cm coredns -o yaml > "$BAK" || die "Không backup được ConfigMap."
ok "đã backup ConfigMap → $BAK"

NEWCF="${TMPDIR:-/tmp}/Corefile.$$"
printf '%s\n' "$COREFILE" | sed -E "s|^([[:space:]]*)forward[[:space:]]+\.[[:space:]]+/etc/resolv\.conf|\1forward . ${UPSTREAM}|" > "$NEWCF"

if diff -q <(printf '%s\n' "$COREFILE") "$NEWCF" >/dev/null; then
  warn "Corefile không đổi (forward vốn đã không trỏ /etc/resolv.conf). Không apply."
  rm -f "$NEWCF"
else
  printf '\n    Thay đổi:\n'
  diff <(printf '%s\n' "$COREFILE") "$NEWCF" | sed 's/^/      /'
  kubectl create cm coredns --from-file=Corefile="$NEWCF" --dry-run=client -o yaml \
    | kubectl apply -n kube-system -f - >/dev/null \
    || { rm -f "$NEWCF"; die "Apply thất bại. Khôi phục: kubectl apply -f $BAK"; }
  rm -f "$NEWCF"
  ok "đã cập nhật ConfigMap coredns"
fi

kubectl -n kube-system rollout restart deployment/coredns >/dev/null \
  || die "Không restart được CoreDNS. Khôi phục: kubectl apply -f $BAK"
kubectl -n kube-system rollout status deployment/coredns --timeout=120s >/dev/null \
  || die "CoreDNS không lên lại sau 120s. Khôi phục: kubectl apply -f $BAK"
ok "CoreDNS đã rollout lại"

log "Kiểm chứng — phân giải từ TRONG cluster"
# CoreDNS Ready xong vẫn cần vài giây để endpoint + iptables của kube-proxy cập nhật.
# Thăm dò 1 lần quá sớm sẽ báo timeout nhầm, che mất kết quả thật. Thử lại tối đa 3 lượt.
TESTNS="${TESTNS:-default}"
DNSOUT=""; RESOLVED=0
for attempt in 1 2 3; do
  sleep 10
  kubectl delete pod dns-probe -n "$TESTNS" --ignore-not-found >/dev/null 2>&1
  DNSOUT="$(kubectl run dns-probe -n "$TESTNS" --rm -i --restart=Never --timeout=120s \
    --image=busybox:1.36 --command -- nslookup "$PROBE_HOST" 2>&1)"
  if printf '%s' "$DNSOUT" | grep -qE '^Address: *[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' \
     && ! printf '%s' "$DNSOUT" | grep -qiE "can't resolve|timed out|no servers"; then
    RESOLVED=1; break
  fi
  printf '    lượt %d chưa được, thử lại...\n' "$attempt"
done

if [ "$RESOLVED" = "1" ]; then
  ok "pod phân giải được $PROBE_HOST"
  printf '\n\033[32mXong.\033[0m Chạy lại cổng P0.F:  bash ~/host/04-verify-sysbox.sh\n\n'
else
  bad "pod VẪN không phân giải được sau 3 lượt. Output lượt cuối:"
  printf '%s\n' "$DNSOUT" | tail -20 | sed 's/^/      /'
  printf '\n  Bước tiếp — định vị hỏng ở tầng nào:  bash %s/diagnose-pod-network.sh\n' "$(dirname "$0")"
  printf '  Khôi phục Corefile cũ nếu muốn: kubectl apply -f %s\n\n' "$BAK"
  exit 1
fi
