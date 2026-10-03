#!/usr/bin/env bash
# Cho cluster Kubernetes con san sang. Dung cho ca nguoi hoc lan verify script.
#
#   dlp-k8s-wait [timeout-giay]        # mac dinh 240
#
# Cho DU SO node bao Ready, khong phai cho node dau tien. So node mong doi lay
# tu `DLP_K8S_NODES` (mac dinh 1) — cung bien ma entrypoint dung de quyet dinh
# co dung node thu hai hay khong, nen hai ben khong the lech nhau.
#
# ⚠ Vi sao khong giu phep kiem cu `grep -qw Ready`: no dung ngay khi MOT node
# Ready. Tren cum 2 node, verify script se chay khi node 2 chua dang ky, va moi
# bai day nodeSelector/taint/DaemonSet se truot mot cach ngat quang — thu se doc
# ra thanh "hoc vien lam sai" chu khong thanh "moi truong chua san sang".
#
# ⚠ "San sang" = DU node Ready VA coredns co >= 1 replica Available (them
# 2026-10-03). Node Ready KHONG keo theo DNS: do tren cum that, sau khi lenh
# nay tra 0 thi pod coredns van ContainerCreating them ~55 giay, nen bai nao
# dung ten Service (`curl http://web`, `nslookup web.default`) ngay sau lenh cho
# se truot — va lai doc ra thanh "hoc vien lam sai". Hai dieu kien kiem trong
# CUNG mot vong lap nen dung chung MOT ngan sach TIMEOUT, khong cong don.
# Kiem Deployment `coredns` (k3s dung no tu manifest; k3s-boot.sh KHONG
# --disable coredns). Available = pod qua readinessProbe `/ready` cua coredns.
#
# Ma thoat:
#   0  cluster Ready (node + coredns)
#   1  het gio ma chua Ready (thong bao noi ro thieu node hay thieu DNS)
#   2  pod nay khong bat cluster con (DLP_K8S != 1)
#
# ⚠ BA ma thoat, khong phai hai. Mot script cham goi ham nay ma chi phan biet
# 0/khac-0 se doc "phien nay khong co Kubernetes" thanh "hoc vien lam sai" —
# dung loai loi ma `validate.ts` ton tai de chan (loi ha tang KHONG duoc bien
# thanh passed:false). Cho no mot ma rieng de phia goi phan biet duoc.
#
# Vi sao can mot lenh cho rieng: cluster con duoc dung NEN luc pod khoi dong
# (xem `start_k8s` trong entrypoint.sh), nen mot nguoi hoc go `kubectl get nodes`
# trong ~30 giay dau se thay "connection refused" va tuong bai hong. Lenh nay la
# cau tra loi trung thuc cho cau hoi "no san sang chua".
set -uo pipefail

TIMEOUT=${1:-240}
KUBECONFIG_SRC=/var/lib/dlp/k3s/kubeconfig.yaml

if [ "${DLP_K8S:-0}" != "1" ]; then
  echo "Phien nay khong bat cluster Kubernetes con (DLP_K8S != 1)." >&2
  exit 2
fi

WANT_NODES=${DLP_K8S_NODES:-1}
# Cung phep kiem nhu entrypoint, vi day doc CUNG mot bien. Lech nhau o day
# nghia la cho mot so node ma phia kia khong bao gio dung — treo den het timeout
# roi bao "cluster chua san sang", trong khi cluster da san sang tu lau.
case "$WANT_NODES" in
  1 | 2) ;;
  *)
    echo "[dlp-k8s-wait] DLP_K8S_NODES='$WANT_NODES' khong hop le (chi 1 hoac 2) — cho 1 node" >&2
    WANT_NODES=1
    ;;
esac
start=$(date +%s)
ready=0
dns=0
nodes_at=""
while :; do
  # k3s ghi kubeconfig truoc khi apiserver phuc vu duoc, nen phai kiem CA HAI:
  # file co that, VA node bao Ready. Chi kiem file la tra ve som mot cach sai.
  #
  # `--request-timeout=5s` o MOI lenh kubectl: mac dinh cua kubectl la KHONG
  # gioi han, nen mot apiserver treo giu mot lenh qua ca TIMEOUT va vong lap
  # khong bao gio toi duoc phep kiem het gio ben duoi.
  if [ -s "$KUBECONFIG_SRC" ]; then
    mkdir -p /root/.kube
    cp "$KUBECONFIG_SRC" /root/.kube/config 2>/dev/null || true
    chmod 0600 /root/.kube/config 2>/dev/null || true
    ready=$(kubectl get nodes --no-headers --request-timeout=5s 2>/dev/null | awk '$2 == "Ready"' | wc -l)
    if [ "$ready" -ge "$WANT_NODES" ]; then
      [ -n "$nodes_at" ] || nodes_at=$(( $(date +%s) - start ))
      dns=$(kubectl -n kube-system get deployment coredns --request-timeout=5s \
              -o jsonpath='{.status.availableReplicas}' 2>/dev/null)
      # jsonpath tra RONG (khong phai 0) khi field chua co — dung ca "coredns
      # chua co replica nao". Rong hay rac trong `[ -ge ]` la loi cu phap ma
      # bash nuot roi di tiep nhu "sai"; chuan hoa tuong minh thay vi dua vao do.
      case "$dns" in
        '' | *[!0-9]*) dns=0 ;;
      esac
      if [ "$dns" -ge 1 ]; then
        echo "Cluster con da san sang sau $(( $(date +%s) - start ))s ($ready/$WANT_NODES node Ready sau ${nodes_at}s, coredns Available)."
        exit 0
      fi
    fi
  fi

  if [ $(( $(date +%s) - start )) -ge "$TIMEOUT" ]; then
    if [ "$ready" -ge "$WANT_NODES" ]; then
      why="du $ready/$WANT_NODES node Ready nhung coredns chua co replica Available — ten Service se khong phan giai duoc"
    else
      why="${ready}/$WANT_NODES node Ready"
    fi
    echo "Cluster con chua san sang sau ${TIMEOUT}s ($why). 20 dong cuoi cua log:" >&2
    tail -n 20 /var/log/dlp/k8s.log >&2 2>/dev/null || true
    exit 1
  fi
  sleep 2
done
