#!/bin/bash
# Hai gia tri THAT: truot khi cum chua du hai node Ready, dat khi du hai.
# Dem node Ready chu khong dem dong `kubectl get nodes`: mot node NotReady van
# hien ra o day va se lam moi buoc sau that bai mot cach kho hieu.
set -uo pipefail

dlp-k8s-wait 15
rc=$?
if [ "$rc" -ne 0 ]; then
  if [ "$rc" -eq 2 ]; then
    echo "Phien nay khong bat cum Kubernetes con (loi cau hinh ha tang, khong phai loi lam bai)."
    echo "Bao lai cho quan tri vien."
  else
    echo "Cum chua du hai node san sang. Doi mot chut roi bam Kiem tra lai."
  fi
  exit 1
fi

READY=$(kubectl get nodes --no-headers 2>/dev/null | awk '$2 == "Ready"' | wc -l)
READY=${READY:-0}
if [ "$READY" -lt 2 ]; then
  echo "Moi thay $READY node Ready, bai nay can 2."
  echo "Chay: kubectl get nodes -o wide - roi doi node con lai chuyen sang Ready."
  exit 1
fi

echo "Dat - cum co $READY node Ready."
