#!/bin/bash
# Hai gia tri THAT: truot khi cum chua co node nao Ready, dat khi
# `kubectl get nodes` bao it nhat mot node Ready.
#
# Goi dlp-k8s-wait o DAU voi timeout NGAN (15s, khong phai mac dinh 240s) —
# cum thuong da Ready tu luc vao step nay (intro da cho roi), nen day chi la
# mot lan cho bu ngan trong trong tran 120s cua mot luot Kiem tra
# (GATEWAY_EXEC_TIMEOUT), khong phai lan cho chinh.
set -uo pipefail

dlp-k8s-wait 15
rc=$?
if [ "$rc" -ne 0 ]; then
  if [ "$rc" -eq 2 ]; then
    echo "Phien nay khong bat cum Kubernetes con (loi cau hinh ha tang, khong phai loi lam bai)."
    echo "Bao lai cho quan tri vien."
  else
    echo "Cum chua san sang sau vai giay cho them. Doi mot chut roi bam Kiem tra lai."
  fi
  exit 1
fi

NODE_COUNT=$(kubectl get nodes --no-headers 2>/dev/null | wc -l | tr -d ' ')
READY_COUNT=$(kubectl get nodes --no-headers 2>/dev/null | awk '$2=="Ready"' | wc -l | tr -d ' ')

if [ "${NODE_COUNT:-0}" -lt 1 ] || [ "${READY_COUNT:-0}" -lt 1 ]; then
  echo "Chua thay node nao o trang thai Ready. Chay lai: kubectl get nodes"
  exit 1
fi

echo "Dat — cum co $READY_COUNT/$NODE_COUNT node Ready."
