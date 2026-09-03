#!/usr/bin/env bash
# P7 / 7.F — cach ly KHONG tut khi pod co mot cluster Kubernetes ben trong.
#
# Chay TREN HOST. Doi so: ten pod sandbox (mac dinh: tim pod dau tien co nhan
# app=sandbox trong $NS).
#
#   bash infra/k8s/p7-escape-verify.sh [pod-name]
#
# Vi sao can mot script RIENG ngoai `netpol-verify.sh`:
# `netpol-verify.sh` chung minh hang rao dung quanh cac pod DICH VU cua nen
# tang. No khong biet gi ve mot cluster con — mot cluster con mang CNI rieng,
# bang iptables rieng, va mot dai IP rieng, tuc la MOT DUONG MANG MOI ma cac
# phep do cu chua tung nhin thay.
#
# ⚠ BA DOI CHUNG DUONG la bat buoc, khong phai trang tri.
# Mot pod chet, mot pod mat DNS, hay mot ten pod go sai deu lam MOI phep thu
# "phai truot" truot — va bao cao se doc ra la "cach ly hoan hao". Neu doi
# chung duong do, ket qua cua ca script la VO NGHIA chu khong phai la dat.
set -uo pipefail

NS=${NS:-dlp-sandbox}
NODE_IP=${NODE_IP:-$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalAddress")].address}' 2>/dev/null)}
[ -n "${NODE_IP:-}" ] || NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
MIRROR_HOST=${MIRROR_HOST:-platform-registry-mirror.dlp-registry.svc.cluster.local}
TIMEOUT=${TIMEOUT:-6}

POD=${1:-$(kubectl get pods -n "$NS" -l app=sandbox -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)}
[ -n "$POD" ] || { echo "Khong tim thay pod sandbox nao trong namespace $NS"; exit 2; }

pass=0; fail=0
ok()   { printf '  \033[32mDAT\033[0m   %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31mTRUOT\033[0m %s — %s\n' "$1" "${2:-}"; fail=$((fail+1)); }

# Chay lenh TRONG pod sandbox (lop ngoai).
outer() { kubectl exec -n "$NS" "$POD" -- bash -lc "$1" 2>&1; }

# Chay lenh trong MOT POD CUA CLUSTER CON. Dung `kubectl run --rm -i` cua
# chinh cluster con, nen no that su o ben trong dai mang cua cluster con chu
# khong phai o netns cua pod sandbox.
inner() {
  outer "kubectl run p7probe-\$RANDOM --rm -i --restart=Never --quiet \
      --image=busybox:1.36 --command -- sh -c '$1' 2>&1 | tail -3"
}

echo "Pod sandbox: $POD (ns=$NS) · node=$NODE_IP"
echo

# ── DOI CHUNG DUONG ─────────────────────────────────────────────────────────
# Neu ba muc nay khong dat thi khong doc tiep phan sau: moi "phai truot" ben
# duoi se truot vi pod hong, chu khong vi hang rao dung.
echo "Doi chung DUONG (thieu no thi ca bai do vo nghia):"
if outer 'echo alive' | grep -q alive; then ok "exec vao pod sandbox chay duoc"
else bad "exec vao pod sandbox" "pod khong phan hoi — DUNG DOC TIEP"; fi

if outer "getent hosts $MIRROR_HOST >/dev/null && echo dns-ok" | grep -q dns-ok
then ok "DNS trong pod van phan giai duoc ($MIRROR_HOST)"
else bad "DNS trong pod" "cluster con da cuop 10.96.0.10? xem ghi chu --network host"; fi

if outer "curl -sS -m$TIMEOUT -o /dev/null -w '%{http_code}' http://$MIRROR_HOST:5000/v2/" | grep -q 200
then ok "mirror docker.io van toi duoc tu pod"
else bad "mirror tu pod" "egress hop phap da bi cluster con lam hong"; fi

if outer 'kubectl get nodes 2>/dev/null | grep -qw Ready && echo inner-ready' | grep -q inner-ready
then ok "cluster CON dang Ready (co that mot duong mang moi de kiem)"
else bad "cluster con Ready" "khong co cluster con thi 7.F chua kiem duoc gi"; fi
echo

# ── PHAI TRUOT — tu LOP NGOAI (pod sandbox) ─────────────────────────────────
echo "Tu POD SANDBOX (lop ngoai) — moi muc PHAI truot:"
c=$(outer "curl -sS -m$TIMEOUT -o /dev/null -w '%{http_code}' http://169.254.169.254/ ; echo rc=\$?")
case "$c" in *rc=0*) bad "IMDS 169.254.169.254" "TOI DUOC: $c";; *) ok "IMDS 169.254.169.254 bi chan";; esac

c=$(outer "curl -sS -m$TIMEOUT -k -o /dev/null -w '%{http_code}' https://$NODE_IP:6443/version ; echo rc=\$?")
case "$c" in *rc=0*) bad "apiserver CHU qua node IP" "TOI DUOC: $c";; *) ok "apiserver CHU ($NODE_IP:6443) bi chan";; esac

c=$(outer "curl -sS -m$TIMEOUT -k -o /dev/null -w '%{http_code}' https://10.96.0.1:443/version ; echo rc=\$?")
case "$c" in *rc=0*) bad "apiserver CHU qua ClusterIP" "TOI DUOC: $c";; *) ok "apiserver CHU (10.96.0.1) bi chan";; esac
echo

# ── PHAI TRUOT — tu BEN TRONG CLUSTER CON ───────────────────────────────────
# Day la phan `netpol-verify.sh` khong the biet: mot pod cua cluster con di ra
# bang CNI cua cluster con, khong bang duong ma netpol ve.
echo "Tu MOT POD CUA CLUSTER CON — moi muc PHAI truot:"
r=$(inner "wget -T $TIMEOUT -q -O- http://169.254.169.254/ >/dev/null 2>&1 && echo REACHED || echo blocked")
case "$r" in *REACHED*) bad "IMDS tu cluster con" "TOI DUOC";; *) ok "IMDS tu cluster con bi chan";; esac

r=$(inner "wget -T $TIMEOUT -q --no-check-certificate -O- https://$NODE_IP:6443/version >/dev/null 2>&1 && echo REACHED || echo blocked")
case "$r" in *REACHED*) bad "apiserver CHU tu cluster con" "TOI DUOC";; *) ok "apiserver CHU tu cluster con bi chan";; esac

# ⚠ Do bang IP, KHONG bang ten DNS.
#
# Mot pod trong cluster con phan giai ten qua coredns CUA CLUSTER CON, va
# coredns do khong biet gi ve service cua cum CHU — nen
# `platform-registry-mirror.dlp-registry.svc.cluster.local` tra NXDOMAIN. Do
# bang ten se doc ra la "mirror bi chan" trong khi that ra duong mang thong.
#
# Lan chay dau (2026-09-04) da mac dung bay nay va suyt ket luan sai rang bai
# hoc se ImagePullBackOff — trong khi `nginx:1.29.0` ngay truoc do da keo ve
# THANH CONG trong chinh cluster con ay.
#
# Hai duong khac nhau, dung ca hai deu can:
#   · containerd CUA CLUSTER CON keo image -> di bang registries.yaml + netns
#     cua pod sandbox -> DUOC.
#   · pod NGUOI HOC tao ra -> di bang CNI cua cluster con -> cung ra duoc, nhung
#     phai goi bang IP vi DNS la cua cluster con.
MIRROR_IP=${MIRROR_IP:-$(kubectl get svc -n dlp-registry -o jsonpath='{.items[0].spec.clusterIP}' 2>/dev/null)}
if [ -n "$MIRROR_IP" ]; then
  r=$(inner "wget -T $TIMEOUT -q -O- http://$MIRROR_IP:5000/v2/ >/dev/null 2>&1 && echo REACHED || echo blocked")
  case "$r" in
    *REACHED*) ok "mirror toi duoc tu cluster con qua IP $MIRROR_IP (can, de keo image bai hoc)";;
    *) printf '  \033[33mGHI CHU\033[0m mirror KHONG toi duoc tu cluster con qua IP — bai hoc co the ImagePullBackOff\n';;
  esac
else
  printf '  \033[33mGHI CHU\033[0m khong tim duoc ClusterIP cua mirror — bo qua phep thu nay\n'
fi
echo

printf 'Tong: %d dat, %d truot\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
