#!/usr/bin/env bash
# Cho cluster Kubernetes con san sang. Dung cho ca nguoi hoc lan verify script.
#
#   dlp-k8s-wait [timeout-giay]        # mac dinh 240
#
# Ma thoat:
#   0  cluster Ready
#   1  het gio ma chua Ready
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

start=$(date +%s)
while :; do
  # k3s ghi kubeconfig truoc khi apiserver phuc vu duoc, nen phai kiem CA HAI:
  # file co that, VA node bao Ready. Chi kiem file la tra ve som mot cach sai.
  if [ -s "$KUBECONFIG_SRC" ]; then
    mkdir -p /root/.kube
    cp "$KUBECONFIG_SRC" /root/.kube/config 2>/dev/null || true
    chmod 0600 /root/.kube/config 2>/dev/null || true
    if kubectl get nodes 2>/dev/null | grep -qw Ready; then
      echo "Cluster con da san sang sau $(( $(date +%s) - start ))s."
      exit 0
    fi
  fi

  if [ $(( $(date +%s) - start )) -ge "$TIMEOUT" ]; then
    echo "Cluster con chua san sang sau ${TIMEOUT}s. 20 dong cuoi cua log:" >&2
    tail -n 20 /var/log/dlp/k8s.log >&2 2>/dev/null || true
    exit 1
  fi
  sleep 2
done
